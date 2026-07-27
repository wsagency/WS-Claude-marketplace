/**
 * ws_changelog: append a Keep-a-Changelog entry to CHANGELOG.md under
 * [Unreleased], creating the section in canonical order when missing, and
 * mirroring the whole file to docs/changelog.md when that mirror exists
 * (dual-track-docs: root file is the source of truth, mirror is a copy).
 * OPTIONAL convenience — the keep-a-changelog prose convention remains
 * authoritative.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { ZodType } from "zod/v4";

export type ChangeType = "feat" | "fix" | "perf" | "refactor" | "security" | "breaking";

/** WS mapping: feat→Added, fix→Fixed, perf/refactor→Changed, security→Security, breaking→Changed with **BREAKING:** prefix. */
export const TYPE_TO_SECTION: Record<ChangeType, string> = {
	feat: "Added",
	fix: "Fixed",
	perf: "Changed",
	refactor: "Changed",
	security: "Security",
	breaking: "Changed",
};

/** Keep-a-Changelog canonical section order. */
export const SECTION_ORDER = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];

export interface ChangelogEntry {
	type: ChangeType;
	text: string;
	ticket?: string;
}

export function formatEntryLine(entry: ChangelogEntry): string {
	const prefix = entry.type === "breaking" ? "**BREAKING:** " : "";
	const suffix = entry.ticket ? ` (${entry.ticket})` : "";
	return `- ${prefix}${entry.text}${suffix}`;
}

/**
 * Pure transform: insert the entry into the [Unreleased] block of a
 * Keep-a-Changelog document. Throws with a descriptive message when the
 * document has no `## [Unreleased]` heading.
 */
export function addChangelogEntry(markdown: string, entry: ChangelogEntry): string {
	const lines = markdown.split("\n");
	const section = TYPE_TO_SECTION[entry.type];
	const entryLine = formatEntryLine(entry);

	const unreleasedIndex = lines.findIndex(line => /^## \[Unreleased\]/.test(line));
	if (unreleasedIndex === -1) {
		throw new Error("CHANGELOG.md has no '## [Unreleased]' section — not a Keep-a-Changelog file this tool can edit.");
	}

	// The unreleased block ends at the next `## ` heading (or EOF).
	let blockEnd = lines.length;
	for (let index = unreleasedIndex + 1; index < lines.length; index += 1) {
		if (/^## /.test(lines[index] as string)) {
			blockEnd = index;
			break;
		}
	}

	// Existing sections inside the block, in file order.
	const sections: { name: string; start: number }[] = [];
	for (let index = unreleasedIndex + 1; index < blockEnd; index += 1) {
		const match = /^### (.+)$/.exec(lines[index] as string);
		if (match?.[1]) sections.push({ name: match[1].trim(), start: index });
	}

	const existing = sections.find(candidate => candidate.name === section);
	if (existing) {
		// Append after the last non-empty line of this section.
		const nextStart = sections.find(candidate => candidate.start > existing.start)?.start ?? blockEnd;
		let insertAt = existing.start + 1;
		for (let index = existing.start + 1; index < nextStart; index += 1) {
			if ((lines[index] as string).trim() !== "") insertAt = index + 1;
		}
		lines.splice(insertAt, 0, entryLine);
		return lines.join("\n");
	}

	// Create the section at its canonical position among the existing ones.
	const rank = SECTION_ORDER.indexOf(section);
	let insertAt = blockEnd;
	for (const candidate of sections) {
		const candidateRank = SECTION_ORDER.indexOf(candidate.name);
		if (candidateRank !== -1 && candidateRank > rank) {
			insertAt = candidate.start;
			break;
		}
	}
	// Trim trailing blank lines at the insertion point for stable spacing.
	while (insertAt > unreleasedIndex + 1 && (lines[insertAt - 1] as string).trim() === "") {
		insertAt -= 1;
	}
	lines.splice(insertAt, 0, "", `### ${section}`, "", entryLine);
	return lines.join("\n");
}

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}

interface ChangelogToolParams {
	type: ChangeType;
	text: string;
	ticket?: string | undefined;
}

export function registerChangelogTool(pi: ExtensionAPI): void {
	const z = pi.zod;

	// Explicit ZodType<Params> keeps Static<TParams> shallow — the raw ZodObject
	// type sends tsc into TS2589 (excessively deep instantiation) at registerTool.
	const parameters: ZodType<ChangelogToolParams> = z.object({
		type: z.enum(["feat", "fix", "perf", "refactor", "security", "breaking"]).describe("Change type (maps to the Keep-a-Changelog section)"),
		text: z.string().describe("Entry text — start with a verb, describe user impact, no trailing period needed"),
		ticket: z.string().optional().describe("Ticket reference to append, e.g. WSC-123"),
	}) as unknown as ZodType<ChangelogToolParams>;

	pi.registerTool<ZodType<ChangelogToolParams>, unknown>({
		name: "ws_changelog",
		label: "WS Changelog",
		description:
			"Append a Keep-a-Changelog entry to CHANGELOG.md under [Unreleased], in the correct section " +
			"(feat→Added, fix→Fixed, perf/refactor→Changed, security→Security, breaking→Changed with **BREAKING:** prefix), " +
			"creating missing sections in canonical order and mirroring the file to docs/changelog.md when that mirror exists. " +
			"OPTIONAL convenience: the keep-a-changelog prose convention remains authoritative — editing CHANGELOG.md directly is equally valid.",
		parameters,
		approval: "write",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const changelogPath = path.join(ctx.cwd, "CHANGELOG.md");
			let markdown: string;
			try {
				markdown = await fs.readFile(changelogPath, "utf8");
			} catch {
				return textResult("CHANGELOG.md not found in the working directory — create it first (see the keep-a-changelog skill).", true);
			}

			let updated: string;
			try {
				updated = addChangelogEntry(markdown, { type: params.type, text: params.text, ticket: params.ticket });
			} catch (error) {
				return textResult(String(error instanceof Error ? error.message : error), true);
			}
			await fs.writeFile(changelogPath, updated, "utf8");

			// Mirror (dual-track-docs): docs/changelog.md is a full copy of the root file.
			const mirrorPath = path.join(ctx.cwd, "docs", "changelog.md");
			let mirrored = false;
			try {
				await fs.stat(mirrorPath);
				await fs.writeFile(mirrorPath, updated, "utf8");
				mirrored = true;
			} catch {
				// No mirror in this repo — root file only.
			}

			const section = TYPE_TO_SECTION[params.type];
			return textResult(`Added entry under [Unreleased] > ${section} in CHANGELOG.md${mirrored ? " (mirrored to docs/changelog.md)" : ""}.`);
		},
	});
}
