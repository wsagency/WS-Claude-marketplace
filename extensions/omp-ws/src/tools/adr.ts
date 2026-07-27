/**
 * ws_adr: scaffold a lightweight (Matt-style micro) ADR in
 * dev-docs/decisions/ with auto-numbering — the two-tier WS convention's
 * default tier. OPTIONAL convenience — the adr prose convention remains
 * authoritative (full MADR documents are still written by hand / via
 * /ws-docs adr).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { ZodType } from "zod/v4";
import { slugify } from "../lib/slug";

/** Next ADR number: highest NNNN prefix among existing files + 1 (1 when none). */
export function nextAdrNumber(fileNames: string[]): number {
	let highest = 0;
	for (const name of fileNames) {
		const match = /^(\d{1,4})-/.exec(name);
		if (match?.[1]) highest = Math.max(highest, Number.parseInt(match[1], 10));
	}
	return highest + 1;
}

export function formatAdrNumber(value: number): string {
	return String(value).padStart(4, "0");
}

/** Lightweight two-tier template: `# NNNN — Title` + 1-3 sentences. */
export function formatAdr(number: string, title: string, sentences: string): string {
	return `# ${number} — ${title}\n\n${sentences.trim()}\n`;
}

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}

interface AdrToolParams {
	title: string;
	sentences: string;
}

export function registerAdrTool(pi: ExtensionAPI): void {
	const z = pi.zod;

	// Explicit ZodType<Params> keeps Static<TParams> shallow — the raw ZodObject
	// type sends tsc into TS2589 (excessively deep instantiation) at registerTool.
	const parameters = z.object({
		title: z.string().describe("Short title of the decision"),
		sentences: z.string().describe("1-3 sentences: what we're deciding + why + what would trigger revisiting it"),
	}) as unknown as ZodType<AdrToolParams>;

	pi.registerTool<ZodType<AdrToolParams>, unknown>({
		name: "ws_adr",
		label: "WS ADR",
		description:
			"Record a lightweight Architecture Decision Record in dev-docs/decisions/ (WS two-tier convention: lightweight is the default tier). " +
			"Auto-numbers as NNNN-slug.md continuing the existing sequence and returns the path. " +
			"OPTIONAL convenience: the adr prose convention remains authoritative — use full MADR v4.0.0 (written manually or via /ws-docs adr) " +
			"when the decision is breaking, costly to undo, or had multiple serious options.",
		parameters,
		approval: "write",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const decisionsDir = path.join(ctx.cwd, "dev-docs", "decisions");
			let fileNames: string[] = [];
			try {
				fileNames = await fs.readdir(decisionsDir);
			} catch {
				await fs.mkdir(decisionsDir, { recursive: true });
			}

			const slug = slugify(params.title);
			if (slug === "") return textResult("ws_adr: title produced an empty slug.", true);

			const number = formatAdrNumber(nextAdrNumber(fileNames));
			const filePath = path.join(decisionsDir, `${number}-${slug}.md`);
			await fs.writeFile(filePath, formatAdr(number, params.title, params.sentences), "utf8");
			return textResult(`Created ${filePath}`);
		},
	});
}
