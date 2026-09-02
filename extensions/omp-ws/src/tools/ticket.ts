/**
 * ws_ticket: schema-validated operations on the WS local issue tracker
 * (dev-docs/tickets/open|done), per the issue-tracker-local convention of
 * the ws plugin. The tool is an OPTIONAL convenience — canonical tracker
 * policy from `/ws-setup` and the ws-to-tickets flow remain authoritative.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { ZodType } from "zod/v4";
import { slugify } from "../lib/slug";
import {
	loadRepositoryPolicy,
	missingPolicyCapability,
	repositoryWritePolicyProblem,
	type RepositoryPolicyState,
} from "../lib/project-policy";


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
	"dev-docs/tickets/ does not exist — this repo has no canonical Local tracker configured. Run /ws-setup before using ws_ticket.";

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
export interface NativeTicketSyncOperation {
	action: "create" | "status";
	localId: string;
	payload: Record<string, unknown>;
	perform: () => Promise<string>;
}

export type NativeTicketSyncBoundary = (request: {
	root: string;
	policy: RepositoryPolicyState;
	operation: NativeTicketSyncOperation;
}) => Promise<string>;

export interface TicketToolDependencies {
	runSynchronizedOperation?: NativeTicketSyncBoundary;
}


export function registerTicketTool(pi: ExtensionAPI, dependencies: TicketToolDependencies = {}): void {
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
			"Create, move, or close a ticket in the canonical Local issue tracker (dev-docs/tickets/open|done), following the issue-tracker-local file convention. " +
			"Requires strict-valid .wsagency/config.yaml policy with tracker.primary=local. " +
			"All-ticket Jira mirrors are changed only through an available durable synchronization boundary. " +
			"op=create writes open/<slug>.md from title/body; op=close moves it to done/; op=move explicitly moves between open/ and done/.",
		parameters,
		approval: "write",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const policy = await loadRepositoryPolicy(ctx.cwd);
			const policyProblem = repositoryWritePolicyProblem(policy, "ws_ticket");
			if (policyProblem !== undefined) return textResult(policyProblem, true);
			if (policy.status !== "valid" || !policy.config?.tracker) {
				return textResult(missingPolicyCapability("ws_ticket", "tracker.primary"), true);
			}
			if (policy.config.tracker.primary !== "local") {
				return textResult(
					`ws_ticket: canonical tracker.primary is ${policy.config.tracker.primary}; Local ticket writes are refused.`,
					true,
				);
			}
			const synchronize = policy.config.jira?.sync === "all_local_tickets";
			if (synchronize && dependencies.runSynchronizedOperation === undefined) {
				return textResult(
					"ws_ticket: all-ticket Jira synchronization is configured, but the durable synchronization boundary is unavailable; refusing the Local write.",
					true,
				);
			}

			const ticketsDir = path.join(policy.root, "dev-docs", "tickets");
			if (!(await exists(ticketsDir))) {
				return textResult(MISSING_TRACKER_MESSAGE, true);
			}
			const runMutation = async (operation: NativeTicketSyncOperation) => {
				try {
					const message = synchronize
						? await dependencies.runSynchronizedOperation!({ root: policy.root, policy, operation })
						: await operation.perform();
					return textResult(message);
				} catch (error) {
					return textResult(
						`ws_ticket: ${String(error instanceof Error ? error.message : error)}`,
						true,
					);
				}
			};

			if (params.op === "create") {
				if (!params.title || !params.body) {
					return textResult("ws_ticket create requires both title and body.", true);
				}
				const slug = params.slug ? slugify(params.slug) : slugify(params.title);
				if (slug === "") return textResult("ws_ticket: title produced an empty slug.", true);
				const { open, done } = ticketPaths(ticketsDir, slug);
				if (await exists(open)) {
					return textResult(`Ticket already exists: ${open}. Use a different slug or edit the file directly.`, true);
				}
				if (await exists(done)) {
					return textResult(`Slug already archived: ${done}. Reopen it with op=move to=open, or pick a different slug.`, true);
				}
				return runMutation({
					action: "create",
					localId: slug,
					payload: {
						title: params.title,
						description: params.body,
						acceptanceCriteria: params.criteria?.join("\n"),
						status: "ready-for-agent",
					},
					perform: async () => {
						await fs.mkdir(path.dirname(open), { recursive: true });
						await fs.writeFile(
							open,
							renderTicket({
								title: params.title!,
								body: params.body!,
								blockedBy: params.blocked_by,
								share: params.share,
								criteria: params.criteria,
							}),
							"utf8",
						);
						return `Created ${open}`;
					},
				});
			}

			if (!params.slug) {
				return textResult(`ws_ticket ${params.op} requires slug.`, true);
			}
			// Preserve a hand-authored file name while containing the operation to
			// one bare ticket path under the canonical repository root.
			const slug = params.slug.replace(/\.md$/, "");
			if (slug === "" || slug === "." || slug === ".." || /[\\/]/.test(slug)) {
				return textResult(`ws_ticket ${params.op} requires a bare slug (no path separators).`, true);
			}
			const { open, done } = ticketPaths(ticketsDir, slug);
			const target = params.op === "close" ? "done" : (params.to ?? "done");
			const [from, to] = target === "done" ? [open, done] : [done, open];

			if (!(await exists(from))) {
				const where = target === "done" ? "open/" : "done/";
				return textResult(`Ticket not found in ${where}: ${from}`, true);
			}
			if (await exists(to)) {
				return textResult(`Destination already exists: ${to}. Resolve the slug collision first (rename one of the tickets).`, true);
			}
			return runMutation({
				action: "status",
				localId: slug,
				payload: { status: target === "done" ? "done" : "ready-for-agent" },
				perform: async () => {
					await fs.mkdir(path.dirname(to), { recursive: true });
					if (params.share) {
						const text = await fs.readFile(from, "utf8");
						if (!text.includes(`share: ${params.share}`)) {
							const lines = text.split("\n");
							lines.splice(1, 0, "", `share: ${params.share}`);
							await fs.writeFile(from, lines.join("\n"), "utf8");
						}
					}
					await fs.rename(from, to);
					return `Moved ${from} -> ${to}`;
				},
			});
		},
	});
}
