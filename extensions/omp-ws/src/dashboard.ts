/**
 * Jira session dashboard driven exclusively by canonical repository policy.
 * The widget requires an explicit Jira binding, dashboard enablement, and a
 * working machine-local jira-cli integration. Policy and integration failures
 * are non-blocking and never disable unrelated native helpers.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { run } from "./lib/exec";
import { loadRepositoryPolicy, repositoryPolicyProblem } from "./lib/project-policy";

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


export function registerDashboard(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		try {
			if (!ctx.hasUI) return;

			const state = await loadRepositoryPolicy(ctx.cwd);
			const policyProblem = repositoryPolicyProblem(state, "ws-dashboard", ["tracker"]);
			if (policyProblem !== undefined) {
				ctx.ui.notify(policyProblem, "warning");
				return;
			}
			if (state.status !== "valid") return;

			if (
				state.config?.ui?.session_start_dashboard !== "jira_assignments" ||
				!state.config.jira
			) return;

			const project = state.config?.jira?.project;
			let jql = "assignee = currentUser() AND statusCategory != Done";
			if (project) jql += ` AND project = ${project}`;
			jql += " ORDER BY priority DESC, updated DESC";

			const result = await run(
				"jira",
				["issue", "list", "-q", jql, "--plain", "--no-headers", "--columns", "KEY,TYPE,STATUS,PRIORITY,SUMMARY", "--paginate", "0:50"],
				{ cwd: state.root, timeout: JIRA_TIMEOUT_MS },
			);
			if (result.code !== 0) {
				ctx.ui.notify(
					"ws-dashboard: Jira integration is unavailable; the dashboard was skipped and unrelated repository capabilities remain active.",
					"warning",
				);
				return;
			}

			const issues = parseJiraPlainRows(result.stdout);
			if (issues.length === 0) return;

			const branch = (await run("git", ["branch", "--show-current"], { cwd: state.root })).stdout.trim();
			const ticketOnBranch = /^[A-Z]+-[0-9]+/.exec(branch)?.[0];

			ctx.ui.setWidget(WIDGET_KEY, renderDashboardLines(issues, project, ticketOnBranch), { placement: "belowEditor" });
			ctx.ui.notify(`Jira: ${issues.length} open assigned issue(s) in ${project} — /ws-status for details`, "info");
		} catch (error) {
			pi.logger.warn(`ws-dashboard: internal error, dashboard skipped: ${String(error)}`);
		}
	});
}
