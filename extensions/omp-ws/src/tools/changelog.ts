/**
 * ws_changelog: append an entry under [Unreleased] in the changelog selected by
 * canonical repository policy. When the configured user-docs mirror exists, it
 * remains an exact copy.
 * OPTIONAL convenience — the keep-a-changelog prose convention remains
 * authoritative.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { ZodType } from "zod/v4";
import {
	loadRepositoryPolicy,
	missingPolicyCapability,
	repositoryPolicyProblem,
} from "../lib/project-policy";

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
			"Append a Keep-a-Changelog entry under [Unreleased] in the path selected by canonical .wsagency/config.yaml policy, " +
			"using the correct section (feat→Added, fix→Fixed, perf/refactor→Changed, security→Security, breaking→Changed with **BREAKING:** prefix). " +
			"When the configured user-docs changelog mirror exists, it is updated as an exact copy. " +
			"OPTIONAL convenience: editing the configured changelog directly is equally valid.",
		parameters,
		approval: "write",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const state = await loadRepositoryPolicy(ctx.cwd);
			const policyProblem = repositoryPolicyProblem(state, "ws_changelog");
			if (policyProblem !== undefined) return textResult(policyProblem, true);
			if (state.status !== "valid" || !state.config?.changelog) {
				return textResult(missingPolicyCapability("ws_changelog", "changelog policy"), true);
			}
			if (state.config.changelog.update_mode === "disabled") {
				return textResult("ws_changelog: changelog updates are disabled by .wsagency/config.yaml.", true);
			}

			const relativeChangelogPath = state.config.changelog.path;
			const changelogPath = path.join(state.root, relativeChangelogPath);
			let markdown: string;
			try {
				markdown = await fs.readFile(changelogPath, "utf8");
			} catch {
				return textResult(`${relativeChangelogPath} not found — create it first (see the keep-a-changelog skill).`, true);
			}

			let updated: string;
			try {
				updated = addChangelogEntry(markdown, { type: params.type, text: params.text, ticket: params.ticket });
			} catch (error) {
				return textResult(String(error instanceof Error ? error.message : error), true);
			}
			await fs.writeFile(changelogPath, updated, "utf8");

			const mirrorRelativePath = state.config.docs
				? path.posix.join(state.config.docs.user_track, "changelog.md")
				: undefined;
			const mirrorPath = mirrorRelativePath ? path.join(state.root, mirrorRelativePath) : undefined;
			let mirrored = false;
			let mirrorExists = false;
			if (mirrorPath) {
				try {
					await fs.stat(mirrorPath);
					mirrorExists = true;
				} catch {
					// No configured mirror in this repository.
				}
			}
			let mirrorError: string | undefined;
			if (mirrorExists) {
				// stat succeeded => a mirror exists. Keep it in sync; a write
				// failure here would leave the mirror stale, so surface it
				// rather than swallowing it as "no mirror".
				try {
					await fs.writeFile(mirrorPath as string, updated, "utf8");
					mirrored = true;
				} catch (error) {
					mirrorError = String(error instanceof Error ? error.message : error);
				}
			}

			const section = TYPE_TO_SECTION[params.type];
			if (mirrorError) {
				return textResult(
					`ws_changelog added the entry to ${relativeChangelogPath} but could not mirror it to ${mirrorRelativePath}: ${mirrorError}. ` +
						`The mirror is now stale. Do NOT re-run ws_changelog (the source entry is already written) — ` +
						`copy ${relativeChangelogPath} over ${mirrorRelativePath} (or fix the mirror's permissions), ` +
						`then stage both files before committing.`,
					true,
				);
			}
			return textResult(
				`Added entry under [Unreleased] > ${section} in ${relativeChangelogPath}${mirrored ? ` (mirrored to ${mirrorRelativePath})` : ""}. ` +
					`Stage the updated file${mirrored ? "s" : ""} before committing — the changelog gate only sees staged files.`,
			);
		},
	});
}
