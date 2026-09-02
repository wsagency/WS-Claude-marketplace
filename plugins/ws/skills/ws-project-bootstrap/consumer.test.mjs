import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { serializeCanonicalConfig } from "./config.mjs";
import { getAdapterContent } from "./trackers.mjs";
import { FakeJiraAdapterTemplate, hashField } from "./sync.mjs";
import {
	detectRepositoryLegacyPolicy,
	inspectCanonicalCapability,
	runCanonicalSynchronizedTrackerOperation,
} from "./consumer.mjs";

const roots = [];
const TRIAGE_ADAPTER = readFileSync(new URL("./templates/triage-labels.md", import.meta.url), "utf8");
const DOMAIN_ADAPTER = readFileSync(new URL("./templates/domain.md", import.meta.url), "utf8");


afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function baseConfig(primary = "local") {
	return {
		schema_version: 1,
		tracker: { primary, pull_requests: "ignore" },
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
		changelog: { update_mode: "pull_request", path: "CHANGELOG.md", skip_types: ["docs", "chore", "test", "style", "build", "ci"] },
		ui: { session_start_dashboard: "disabled" },
		runtime: { session_discipline: "required", dangerous_git_guard: "enabled" },
	};
}

function createRepository(config, options = {}) {
	const root = mkdtempSync(path.join(tmpdir(), "ws-consumer-"));
	roots.push(root);
	if (config) {
		mkdirSync(path.join(root, ".wsagency"), { recursive: true });
		writeFileSync(path.join(root, ".wsagency/config.yaml"), serializeCanonicalConfig(config));
	}
	if (options.tracker !== false) {
		mkdirSync(path.join(root, "dev-docs/agents"), { recursive: true });
		writeFileSync(path.join(root, "dev-docs/agents/issue-tracker.md"), getAdapterContent(config?.tracker?.primary ?? "local"));
	}
	if (options.engineeringAdapters) {
		writeFileSync(path.join(root, "dev-docs/agents/triage-labels.md"), TRIAGE_ADAPTER);
		writeFileSync(path.join(root, "dev-docs/agents/domain.md"), DOMAIN_ADAPTER);
		writeFileSync(path.join(root, "AGENTS.md"), "canonical agents\n");
		writeFileSync(path.join(root, "CLAUDE.md"), "@AGENTS.md\n");
	}
	if (options.local !== false) {
		mkdirSync(path.join(root, "dev-docs/tickets/open"), { recursive: true });
		mkdirSync(path.join(root, "dev-docs/tickets/done"), { recursive: true });
	}
	return root;
}

function jiraConfig(primary = "jira", sync = "disabled") {
	return {
		...baseConfig(primary),
		jira: { project: "WCM", default_issue_type: "Task", sync },
	};
}

describe("canonical capability inspection", () => {
	test("Local readiness needs no external integration", () => {
		const root = createRepository(baseConfig());
		const result = inspectCanonicalCapability({ root, capability: "tracker" });
		assert.equal(result.ready, true);
		assert.equal(result.operation.primary, "local");
		assert.equal(result.degraded, false);
		assert.deepEqual(result.detectedLegacySources, []);
		assert.equal(result.setupReadiness.configValid, true);
		assert.equal(result.setupReadiness.engineeringReady, false);
		assert.equal(result.setupReadiness.trackerReady, false);
	});

	test("canonical managed adapters are not legacy policy sources", () => {
		const root = createRepository(baseConfig(), { engineeringAdapters: true });
		assert.deepEqual(detectRepositoryLegacyPolicy(root), []);
		const result = inspectCanonicalCapability({ root, capability: "engineering" });
		assert.deepEqual(result.detectedLegacySources, []);
	});

	test("operational adapters without canonical policy remain legacy migration sources", () => {
		const root = createRepository(null, { engineeringAdapters: true });
		assert.deepEqual(detectRepositoryLegacyPolicy(root), [
			"dev-docs/agents/issue-tracker.md",
			"dev-docs/agents/triage-labels.md",
			"dev-docs/agents/domain.md",
		]);
	});

	for (const [primary, origin] of [
		["github", "git@github.com:wsagency/repo.git"],
		["gitlab", "https://gitlab.com/wsagency/repo.git"],
	]) {
		test(`${primary} readiness uses the matching origin and integration only`, () => {
			const root = createRepository(baseConfig(primary), { local: false });
			const ready = inspectCanonicalCapability({
				root,
				capability: "tracker",
				snapshot: { origin, integrations: { [primary]: true } },
			});
			assert.equal(ready.ready, true);
			const unavailable = inspectCanonicalCapability({
				root,
				capability: "tracker",
				snapshot: { origin, integrations: { [primary]: false }, integrationReasons: { [primary]: `${primary} auth unavailable` } },
			});
			assert.equal(unavailable.ready, false);
			assert.deepEqual(unavailable.blockers, [`${primary} auth unavailable`]);
		});
	}

	test("Jira primary readiness is capability-specific", () => {
		const root = createRepository(jiraConfig(), { local: false });
		const unavailable = inspectCanonicalCapability({
			root,
			capability: "tracker",
			snapshot: { integrations: { jira: false }, integrationReasons: { jira: "jira-cli authentication failed" } },
		});
		assert.equal(unavailable.ready, false);
		assert.deepEqual(unavailable.blockers, ["jira-cli authentication failed"]);
		const ready = inspectCanonicalCapability({ root, capability: "tracker", snapshot: { integrations: { jira: true } } });
		assert.equal(ready.ready, true);
	});

	test("Local/Jira outage and pending work degrade without blocking Local", () => {
		const root = createRepository(jiraConfig("local", "all_local_tickets"));
		const outage = inspectCanonicalCapability({
			root,
			capability: "tracker",
			snapshot: { integrations: { jira: false }, integrationReasons: { jira: "Jira outage" }, sync: { pending: 2 } },
		});
		assert.equal(outage.ready, true);
		assert.equal(outage.degraded, true);
		assert.match(outage.warnings[0], /Local Markdown remains available/);
		const pending = inspectCanonicalCapability({
			root,
			capability: "tracker",
			snapshot: { integrations: { jira: true }, sync: { pending: 2 } },
		});
		assert.equal(pending.ready, true);
		assert.match(pending.warnings[0], /must be retried before/);
	});

	test("Local/Jira same-field conflicts fail closed", () => {
		const root = createRepository(jiraConfig("local", "all_local_tickets"));
		const result = inspectCanonicalCapability({
			root,
			capability: "tracker",
			snapshot: { integrations: { jira: true }, sync: { conflicts: 1 } },
		});
		assert.equal(result.ready, false);
		assert.match(result.blockers[0], /Local, Jira, or manual merge/);
	});

	test("named local capabilities ignore unrelated integration outages", () => {
		const root = createRepository(baseConfig(), { engineeringAdapters: true });
		const domain = inspectCanonicalCapability({
			root,
			capability: "domain",
			snapshot: { integrations: { github: false, gitlab: false, jira: false } },
		});
		const commit = inspectCanonicalCapability({
			root,
			capability: "commit",
			snapshot: { integrations: { jira: false } },
		});
		assert.equal(domain.ready, true);
		assert.equal(commit.ready, true);
	});

	test("missing capability reports the exact repository-local legacy source", () => {
		const root = createRepository(null, { tracker: false, local: false });
		mkdirSync(path.join(root, ".claude"), { recursive: true });
		writeFileSync(path.join(root, ".claude/ws-project.yaml"), "jira:\n  project: LEGACY\n");
		assert.deepEqual(detectRepositoryLegacyPolicy(root), [".claude/ws-project.yaml"]);
		const result = inspectCanonicalCapability({ root, capability: "tracker" });
		assert.equal(result.ready, false);
		assert.match(result.blockers[0], /Detected repository-local legacy source: \.claude\/ws-project\.yaml\. Run \/ws-setup\./);
		assert.doesNotMatch(result.blockers[0], /~\/\.claude/);
	});

	test("partial canonical policy never receives runtime defaults", () => {
		const root = createRepository({ schema_version: 1, domain: { layout: "single_context" } }, { tracker: false, local: false });
		mkdirSync(path.join(root, "dev-docs/agents"), { recursive: true });
		writeFileSync(path.join(root, "dev-docs/agents/domain.md"), DOMAIN_ADAPTER);
		const domain = inspectCanonicalCapability({ root, capability: "domain" });
		assert.equal(domain.ready, true);
		assert.deepEqual(domain.detectedLegacySources, []);
		const tracker = inspectCanonicalCapability({ root, capability: "tracker" });
		assert.equal(tracker.ready, false);
		assert.match(tracker.blockers[0], /missing section: tracker/);
		assert.equal(tracker.policy.tracker, undefined);
	});

	test("triage, changelog, dashboard, pull-request, and engineering capabilities stay independent", () => {
		const config = baseConfig();
		config.tracker.pull_requests = "triage";
		const root = createRepository(config, { engineeringAdapters: true });
		const triage = inspectCanonicalCapability({ root, capability: "triage" });
		const changelog = inspectCanonicalCapability({ root, capability: "changelog" });
		const pullRequests = inspectCanonicalCapability({
			root,
			capability: "pull_requests",
			snapshot: { origin: "git@github.com:wsagency/repo.git", integrations: { github: true, jira: false } },
		});
		const dashboard = inspectCanonicalCapability({
			root,
			capability: "dashboard",
			snapshot: { integrations: { jira: false } },
		});
		const engineering = inspectCanonicalCapability({ root, capability: "engineering" });
		assert.equal(triage.ready, true);
		assert.deepEqual(changelog.policy.changelog, config.changelog);
		assert.deepEqual(pullRequests.operation.provider, "github");
		assert.equal(pullRequests.ready, true);
		assert.deepEqual(dashboard.operation, { enabled: false, mode: "disabled" });
		assert.equal(dashboard.ready, true);
		assert.equal(engineering.ready, true);
	});
});

describe("canonical Local/Jira operation boundary", () => {
	test("retries pending synchronization before the requested operation", async () => {
		const root = createRepository(jiraConfig("local", "all_local_tickets"));
		const adapter = new FakeJiraAdapterTemplate({
			"WCM-1": { id: "WCM-1", title: "Before" },
		});
		const result = await runCanonicalSynchronizedTrackerOperation({
			root,
			snapshot: { integrations: { jira: true }, sync: { pending: 1 } },
			localStore: { local1: { id: "local1", title: "After" } },
			syncState: {
				mappings: { local1: { jiraId: "WCM-1", fieldHashes: { title: hashField("After") } } },
				pendingOperations: [{ correlationId: "pending-1", localId: "local1", action: "update", payload: { title: "After" } }],
			},
			operation: { action: "status", localId: "local1", payload: { status: "done" } },
			jiraAdapter: adapter,
		});
		assert.equal(result.nextSyncState.pendingOperations.length, 0);
		assert.equal(result.externalCallLog[0].method, "updateTicket");
		assert.equal(result.nextLocalStore.local1.status, "done");
	});

	test("returns same-field conflict choices before local or remote overwrite", async () => {
		const root = createRepository(jiraConfig("local", "all_local_tickets"));
		const adapter = new FakeJiraAdapterTemplate({
			"WCM-2": { id: "WCM-2", title: "Remote" },
		});
		const localStore = { local2: { id: "local2", title: "Local before" } };
		const result = await runCanonicalSynchronizedTrackerOperation({
			root,
			snapshot: { integrations: { jira: true } },
			localStore,
			syncState: {
				mappings: { local2: { jiraId: "WCM-2", fieldHashes: { title: hashField("Original") } } },
				pendingOperations: [],
			},
			operation: { action: "update", localId: "local2", payload: { title: "Local" } },
			jiraAdapter: adapter,
		});
		assert.deepEqual(result.conflicts, [{ localId: "local2", field: "title", localValue: "Local", jiraValue: "Remote" }]);
		assert.equal(result.nextLocalStore.local2.title, "Local before");
		assert.deepEqual(adapter.existingData["WCM-2"], { id: "WCM-2", title: "Remote" });
	});
});

describe("tracker and engineering source consumers", () => {
	const source = relative => readFileSync(new URL(relative, import.meta.url), "utf8");

	test("tracker-facing commands and help load canonical policy without legacy shell reads", () => {
		for (const command of ["../../commands/ws-status.md", "../../commands/ws-commit.md", "../../commands/ws-help.md"]) {
			const content = source(command);
			assert.match(content, /\.wsagency\/config\.yaml/);
			assert.match(content, /ws-project-bootstrap\/consumer\.mjs/);
			assert.doesNotMatch(content, /!`cat [^`]*(?:~\/\.claude\/ws\/config|\.\/\.claude\/ws-project)/);
			assert.doesNotMatch(content, /\/ws-init/);
		}
	});

	test("engineering graph consumers request named canonical capabilities", () => {
		const skills = [
			"ws-ask-matt",
			"ws-code-review",
			"ws-domain-modeling",
			"ws-grill-with-docs",
			"ws-implement",
			"ws-improve-codebase-architecture",
			"ws-to-spec",
			"ws-to-tickets",
			"ws-triage",
			"ws-wayfinder",
		];
		for (const skill of skills) {
			const content = source(`../${skill}/SKILL.md`);
			assert.match(content, /ws-project-bootstrap\/consumer\.mjs/);
			assert.match(content, /capability/);
			assert.doesNotMatch(content, /ws-setup-matt-pocock-skills/);
		}
	});

	test("tracker-mutating graph flows preserve the Local/Jira boundary", () => {
		for (const skill of ["ws-implement", "ws-to-spec", "ws-to-tickets", "ws-triage", "ws-wayfinder"]) {
			const content = source(`../${skill}/SKILL.md`);
			assert.match(content, /runCanonicalSynchronizedTrackerOperation/);
			assert.match(content, /pending/i);
			assert.match(content, /conflict/i);
		}
	});

	test("engineering topology no longer routes to legacy setup", () => {
		const content = source("../ws-graph-engineering/SKILL.md");
		assert.match(content, /`\/ws-setup`/);
		assert.doesNotMatch(content, /ws-setup-matt-pocock-skills/);
	});
});
