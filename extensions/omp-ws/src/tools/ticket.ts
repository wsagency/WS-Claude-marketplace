/**
 * ws_ticket: schema-validated operations on the WS local issue tracker
 * (dev-docs/tickets/open|done), per the issue-tracker-local convention of
 * the ws plugin. The tool is an OPTIONAL convenience — the prose convention
 * (ws-to-tickets / ws-setup-matt-pocock-skills) remains authoritative.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { ZodType } from "zod/v4";
import { slugify } from "../lib/slug";

export interface TicketCreateInput {
	title: string;
	body: string;
	blockedBy?: string[];
	share?: string;
	criteria?: string[];
}

/** Render a ticket file exactly in the local-tracker template shape. */
export function renderTicket(input: TicketCreateInput): string {
	const lines: string[] = [`# ${input.title}`, ""];
	if (input.share) {
		lines.push(`share: ${input.share}`, "");
	}
	lines.push(`**What to build:** ${input.body}`, "");
	const blockedBy = input.blockedBy && input.blockedBy.length > 0 ? input.blockedBy.join(", ") : "None — can start immediately";
	lines.push(`**Blocked by:** ${blockedBy}`, "");
	lines.push("**Status:** ready-for-agent", "");
	for (const criterion of input.criteria ?? []) {
		lines.push(`- [ ] ${criterion}`);
	}
	return `${lines.join("\n").trimEnd()}\n`;
}

export function ticketPaths(ticketsDir: string, slug: string): { open: string; done: string } {
	return {
		open: path.join(ticketsDir, "open", `${slug}.md`),
		done: path.join(ticketsDir, "done", `${slug}.md`),
	};
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await fs.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}

const MISSING_TRACKER_MESSAGE =
	"dev-docs/tickets/ does not exist — this repo has no local issue tracker configured. Run /ws-matt setup to configure a tracker (or create dev-docs/tickets/open/ manually) before using ws_ticket.";

interface TicketToolParams {
	op: "create" | "move" | "close";
	title?: string | undefined;
	body?: string | undefined;
	slug?: string | undefined;
	blocked_by?: string[] | undefined;
	share?: string | undefined;
	criteria?: string[] | undefined;
	to?: "open" | "done" | undefined;
}

export function registerTicketTool(pi: ExtensionAPI): void {
	const z = pi.zod;

	// Explicit ZodType<Params> keeps Static<TParams> shallow — the raw ZodObject
	// type sends tsc into TS2589 (excessively deep instantiation) at registerTool.
	const parameters = z.object({
		op: z.enum(["create", "move", "close"]).describe("Operation: create a ticket, move it between open/done, or close (move to done)"),
		title: z.string().optional().describe("Ticket title (required for create)"),
		body: z.string().optional().describe("'What to build' — the end-to-end behaviour this ticket makes work (required for create)"),
		slug: z.string().optional().describe("Ticket slug (file name without .md). Derived from title on create; required for move/close"),
		blocked_by: z.array(z.string()).optional().describe("Slugs of tickets that gate this one (create only)"),
		share: z.string().optional().describe("Session share URL to record in the ticket file"),
		criteria: z.array(z.string()).optional().describe("Acceptance criteria, one per checkbox (create only)"),
		to: z.enum(["open", "done"]).optional().describe("Target directory for op=move (default done)"),
	}) as unknown as ZodType<TicketToolParams>;

	pi.registerTool<ZodType<TicketToolParams>, unknown>({
		name: "ws_ticket",
		label: "WS Ticket",
		description:
			"Create, move, or close a ticket in the WS local issue tracker (dev-docs/tickets/open|done), following the issue-tracker-local file convention. " +
			"OPTIONAL convenience: the prose convention in the ws plugin skills remains authoritative — free-form edits to ticket files are equally valid. " +
			"op=create writes dev-docs/tickets/open/<slug>.md from title/body (plus optional blocked_by slugs, share URL, acceptance criteria). " +
			"op=close moves open/<slug>.md to done/ (closing = archiving; only close when the result is coded AND captured in dev-docs). " +
			"op=move moves a ticket between open/ and done/ explicitly (use to=open to reopen).",
		parameters,
		approval: "write",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const ticketsDir = path.join(ctx.cwd, "dev-docs", "tickets");
			if (!(await exists(ticketsDir))) {
				return textResult(MISSING_TRACKER_MESSAGE, true);
			}

			if (params.op === "create") {
				if (!params.title || !params.body) {
					return textResult("ws_ticket create requires both title and body.", true);
				}
				const slug = params.slug ? slugify(params.slug) : slugify(params.title);
				if (slug === "") return textResult("ws_ticket: title produced an empty slug.", true);
				const { open } = ticketPaths(ticketsDir, slug);
				if (await exists(open)) {
					return textResult(`Ticket already exists: ${open}. Use a different slug or edit the file directly.`, true);
				}
				await fs.mkdir(path.dirname(open), { recursive: true });
				await fs.writeFile(
					open,
					renderTicket({
						title: params.title,
						body: params.body,
						blockedBy: params.blocked_by,
						share: params.share,
						criteria: params.criteria,
					}),
					"utf8",
				);
				return textResult(`Created ${open}`);
			}

			// move / close
			if (!params.slug) {
				return textResult(`ws_ticket ${params.op} requires slug.`, true);
			}
			const slug = params.slug.replace(/\.md$/, "");
			const { open, done } = ticketPaths(ticketsDir, slug);
			const target = params.op === "close" ? "done" : (params.to ?? "done");
			const [from, to] = target === "done" ? [open, done] : [done, open];

			if (!(await exists(from))) {
				const where = target === "done" ? "open/" : "done/";
				return textResult(`Ticket not found in ${where}: ${from}`, true);
			}
			if (params.share) {
				// Record session evidence before archiving: share line under the title.
				const text = await fs.readFile(from, "utf8");
				if (!text.includes(`share: ${params.share}`)) {
					const lines = text.split("\n");
					lines.splice(1, 0, "", `share: ${params.share}`);
					await fs.writeFile(from, lines.join("\n"), "utf8");
				}
			}
			await fs.mkdir(path.dirname(to), { recursive: true });
			if (await exists(to)) {
				return textResult(`Destination already exists: ${to}. Resolve the slug collision first (rename one of the tickets).`, true);
			}
			await fs.rename(from, to);
			return textResult(`Moved ${from} -> ${to}`);
		},
	});
}
