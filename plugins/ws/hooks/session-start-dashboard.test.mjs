import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { serializeCanonicalConfig } from "../skills/ws-project-bootstrap/config.mjs";
import { createSessionStartContext } from "./session-start-dashboard.mjs";

async function withRoot(run) {
	const root = await mkdtemp(path.join(tmpdir(), "ws-dashboard-hook-"));
	try {
		return await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function write(root, target, content) {
	await mkdir(path.dirname(path.join(root, target)), { recursive: true });
	await writeFile(path.join(root, target), content, "utf8");
}

function canonical({ dashboard = "disabled", jira = undefined } = {}) {
	return serializeCanonicalConfig({
		schema_version: 1,
		tracker: { primary: "local", pull_requests: "ignore" },
		triage: {
			labels: {
				needs_triage: "needs-triage",
				needs_info: "needs-info",
				ready_for_agent: "ready-for-agent",
				ready_for_human: "ready-for-human",
				wontfix: "wontfix",
			},
		},
		domain: { layout: "single_context" },
		commit: {
			jira: {
				actions: "disabled",
				smart_commit_trailer: false,
				post_commit_comment: false,
				pr_transition: null,
			},
		},
		changelog: {
			update_mode: "pull_request",
			path: "CHANGELOG.md",
			skip_types: ["docs", "chore", "test", "style", "build", "ci"],
		},
		ui: { session_start_dashboard: dashboard },
		runtime: { session_discipline: "required", dangerous_git_guard: "enabled" },
		...(jira ? { jira } : {}),
	});
}

test("legacy-only repositories direct setup without reading legacy values", async () => {
	await withRoot(async root => {
		await write(root, ".claude/ws-project.yaml", "jira:\n  project: WRONG\n");
		const context = createSessionStartContext({ root, jiraAvailable: false });
		assert.match(context, /\.claude\/ws-project\.yaml/);
		assert.match(context, /\/ws-setup/);
		assert.doesNotMatch(context, /WRONG/);
	});
});

test("disabled or unavailable canonical dashboards stay silent", async () => {
	await withRoot(async root => {
		await write(root, ".wsagency/config.yaml", canonical());
		assert.equal(createSessionStartContext({ root, jiraAvailable: true }), "");

		await write(root, ".wsagency/config.yaml", canonical({
			dashboard: "jira_assignments",
			jira: { project: "WCM", default_issue_type: "Task", sync: "disabled" },
		}));
		assert.equal(createSessionStartContext({ root, jiraAvailable: false }), "");
	});
});

test("Jira assignments require a canonical Jira binding", async () => {
	await withRoot(async root => {
		const invalid = canonical().replace(
			"session_start_dashboard: disabled",
			"session_start_dashboard: jira_assignments",
		);
		await write(root, ".wsagency/config.yaml", invalid);
		const context = createSessionStartContext({ root, jiraAvailable: true });
		assert.match(context, /requires \$\.jira/i);
		assert.match(context, /\/ws-setup/);
	});
});

test("canonical Jira assignment context ignores legacy repository content", async () => {
	await withRoot(async root => {
		await write(root, ".wsagency/config.yaml", canonical({
			dashboard: "jira_assignments",
			jira: { project: "WCM", default_issue_type: "Task", sync: "disabled" },
		}));
		await write(root, ".claude/ws-project.yaml", "jira:\n  project: WRONG\n");

		const context = createSessionStartContext({
			root,
			jiraAvailable: true,
			branch: "WCM-1-cutover",
		});
		assert.match(context, /project WCM/);
		assert.match(context, /ticket: WCM-1/);
		assert.match(context, /\/ws-status/);
		assert.doesNotMatch(context, /WRONG/);
	});
});
