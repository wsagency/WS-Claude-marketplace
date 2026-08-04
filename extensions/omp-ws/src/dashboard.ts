/**
 * Jira session dashboard: `session_start` port of
 * hooks/session-start-dashboard.sh — but rendered as a persistent widget
 * (ui.setWidget) plus a one-line notify, instead of injected context.
 *
 * Gating mirrors the shell hook: requires `./.claude/ws-project.yaml` AND
 * `~/.claude/ws/config.yaml`; honors the project `hooks.session_start_dashboard`
 * toggle, falling back to the global `ui.session_start_dashboard` (default on).
 * Fetches assignments with the same jira-cli query /ws-status uses.
 * Silent no-op on ANY failure (missing binary, unconfigured jira, timeout).
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { run } from "./lib/exec";
import { readWsSettings } from "./lib/settings";
import { sectionValue } from "./lib/yaml-lite";

const WIDGET_KEY = "ws-jira-dashboard";
const JIRA_TIMEOUT_MS = 3000;
const MAX_ISSUE_LINES = 4;

export interface JiraIssue {
	key: string;
	type: string;
	status: string;
	priority: string;
	summary: string;
}

/** Parse `jira issue list --plain --no-headers` tab-separated rows. */
export function parseJiraPlainRows(stdout: string): JiraIssue[] {
	const issues: JiraIssue[] = [];
	for (const line of stdout.split("\n")) {
		if (line.trim() === "") continue;
		const cols = line.split("\t").map(col => col.trim());
		if (cols.length < 5) continue;
		issues.push({
			key: cols[0] ?? "",
			type: cols[1] ?? "",
			status: cols[2] ?? "",
			priority: cols[3] ?? "",
			summary: cols.slice(4).join(" "),
		});
	}
	return issues;
}

/** Render the widget lines (header + a few issues), capped for the banner. */
export function renderDashboardLines(issues: JiraIssue[], project: string | undefined, ticketOnBranch: string | undefined): string[] {
	const scope = project ? ` — ${project}` : "";
	const lines = [`Jira workload${scope}: ${issues.length} open assigned issue(s)`];
	for (const issue of issues.slice(0, MAX_ISSUE_LINES)) {
		const here = ticketOnBranch !== undefined && issue.key === ticketOnBranch ? "  (you're here)" : "";
		lines.push(`  ${issue.key}  [${issue.status}] ${truncate(issue.summary, 60)}${here}`);
	}
	if (issues.length > MAX_ISSUE_LINES) {
		lines.push(`  ... and ${issues.length - MAX_ISSUE_LINES} more — /ws-status for the full dashboard`);
	}
	return lines;
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

async function readIfExists(filePath: string): Promise<string | undefined> {
	try {
		return await fs.readFile(filePath, "utf8");
	} catch {
		return undefined;
	}
}

export function registerDashboard(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		try {
			if (!ctx.hasUI) return; // widget/notify have no surface in print/RPC mode

			const settings = await readWsSettings(ctx.cwd);
			if (!settings.dashboard) return; // plugin setting off-switch

			const projectConfig = await readIfExists(path.join(ctx.cwd, ".claude", "ws-project.yaml"));
			if (projectConfig === undefined) return;
			const globalConfig = await readIfExists(path.join(os.homedir(), ".claude", "ws", "config.yaml"));
			if (globalConfig === undefined) return;

			// Per-project toggle, falling back to the global one (default on).
			// An empty project value (e.g. a bare `session_start_dashboard:` key) is
			// treated as absent — mirrors the shell hook's `if [[ -z "$toggle" ]]`.
			const projectToggle = sectionValue(projectConfig, "hooks", "session_start_dashboard");
			const toggle = projectToggle || sectionValue(globalConfig, "ui", "session_start_dashboard");
			if (toggle === "false") return;

			// Plugin setting (or JIRA_PROJECT env) overrides the ws-project.yaml binding.
			const project = settings.jiraProject !== "" ? settings.jiraProject : sectionValue(projectConfig, "jira", "project");

			// Same JQL as /ws-status, scoped to the bound project when present.
			let jql = "assignee = currentUser() AND statusCategory != Done";
			if (project) jql += ` AND project = ${project}`;
			jql += " ORDER BY priority DESC, updated DESC";

			const result = await run(
				"jira",
				["issue", "list", "-q", jql, "--plain", "--no-headers", "--columns", "KEY,TYPE,STATUS,PRIORITY,SUMMARY", "--paginate", "0:50"],
				{ cwd: ctx.cwd, timeout: JIRA_TIMEOUT_MS },
			);
			if (result.code !== 0) return; // missing binary, unconfigured, or timed out

			const issues = parseJiraPlainRows(result.stdout);
			if (issues.length === 0) return;

			const branch = (await run("git", ["branch", "--show-current"], { cwd: ctx.cwd })).stdout.trim();
			const ticketOnBranch = /^[A-Z]+-[0-9]+/.exec(branch)?.[0];

			ctx.ui.setWidget(WIDGET_KEY, renderDashboardLines(issues, project, ticketOnBranch), { placement: "belowEditor" });
			ctx.ui.notify(`Jira: ${issues.length} open assigned issue(s)${project ? ` in ${project}` : ""} — /ws-status for details`, "info");
		} catch {
			// Silent no-op by contract.
		}
	});
}
