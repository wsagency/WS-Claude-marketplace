import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
	parseOriginIdentity,
	discoverProviders,
	FakeJiraAdapter,
	validateJiraCapability,
	planTrackerEffects,
	checkTrackerReadiness,
	getAdapterContent,
} from "./trackers.mjs";

describe("Tracker Providers Module", () => {
	describe("Origin Parsing (Ticket 13)", () => {
		test("parses valid GitHub SSH origin", () => {
			const id = parseOriginIdentity("git@github.com:owner/repo.git");
			assert.deepEqual(id, { provider: "github", host: "github.com", owner: "owner", repo: "repo" });
		});

		test("returns null for unknown origins", () => {
			assert.equal(parseOriginIdentity("git@bitbucket.org:owner/repo.git"), null);
		});

		test("discovers providers based on origin", () => {
			assert.deepEqual(discoverProviders("git@github.com:owner/repo.git"), ["local", "github"]);
		});
	});

	describe("Jira Fake Adapter (Ticket 14)", () => {
		test("validates successful Jira capability", async () => {
			const adapter = new FakeJiraAdapter();
			const result = await validateJiraCapability(adapter, "PROJ");
			assert.deepEqual(result, { ready: true });
		});

		test("blocks when binary is missing", async () => {
			const adapter = new FakeJiraAdapter({ missingBinary: true });
			const result = await validateJiraCapability(adapter, "PROJ");
			assert.deepEqual(result, { ready: false, reason: "jira-cli binary not found" });
		});
	});

	describe("Tracker Effects & Readiness", () => {
		const discoveryGitLab = { git: { origin: "git@gitlab.com:owner/repo.git" } };
		test("evaluates provider readiness once per planning or readiness pass", () => {
			let originReads = 0;
			const discovery = {
				git: {
					get origin() {
						originReads += 1;
						return "git@gitlab.com:owner/repo.git";
					}
				}
			};
			const config = { tracker: { primary: "gitlab" } };
			const capabilities = { glabCli: true };

			assert.equal(planTrackerEffects(config, discovery, null, capabilities)[0].classification, "CREATE");
			assert.equal(originReads, 1);
			originReads = 0;
			assert.deepEqual(checkTrackerReadiness(config, discovery, null, capabilities), {
				trackerReady: true,
				blockers: []
			});
			assert.equal(originReads, 1);
		});

		
		test("returns CREATE adapter content effect for valid GitLab (first run)", () => {
			const config = { tracker: { primary: "gitlab" } };
			const capabilities = { glabCli: true };
			const effects = planTrackerEffects(config, discoveryGitLab, null, capabilities);
			assert.equal(effects.length, 1);
			assert.equal(effects[0].classification, "CREATE");
			assert.equal(effects[0].target, "dev-docs/agents/issue-tracker.md");
			assert.match(effects[0].after, /GitLab Issues behavior/);
		});

		test("returns NO-OP adapter content effect for aligned rerun (idempotency)", () => {
			const config = { tracker: { primary: "gitlab" } };
			const capabilities = { glabCli: true };
			const existingAdapter = getAdapterContent("gitlab");
			const discovery = { 
				git: { origin: "git@gitlab.com:owner/repo.git" },
				entries: { "dev-docs/agents/issue-tracker.md": { kind: "file", content: existingAdapter, fingerprint: "x" } }
			};
			const effects = planTrackerEffects(config, discovery, null, capabilities);
			assert.equal(effects.length, 1);
			assert.equal(effects[0].classification, "NO-OP");
			assert.equal(effects[0].target, "dev-docs/agents/issue-tracker.md");
		});

		test("returns UPDATE adapter content effect for drifted rerun", () => {
			const config = { tracker: { primary: "gitlab" } };
			const capabilities = { glabCli: true };
			const discovery = { 
				git: { origin: "git@gitlab.com:owner/repo.git" },
				entries: { "dev-docs/agents/issue-tracker.md": { kind: "file", content: "old", fingerprint: "x" } }
			};
			const effects = planTrackerEffects(config, discovery, null, capabilities);
			assert.equal(effects.length, 1);
			assert.equal(effects[0].classification, "UPDATE");
			assert.equal(effects[0].target, "dev-docs/agents/issue-tracker.md");
		});

		test("blocks GitHub if origin doesn't match and yields zero write effects", () => {
			const config = { tracker: { primary: "github" } };
			const capabilities = { ghCli: true };
			const effects = planTrackerEffects(config, discoveryGitLab, null, capabilities);
			assert.equal(effects.length, 1); 
			assert.equal(effects[0].classification, "BLOCKING_CONFLICT");
			assert.match(effects[0].reason, /github selected as primary but repository origin does not match/);
		});

		test("blocks GitHub if CLI is missing and yields zero write effects", () => {
			const config = { tracker: { primary: "github" } };
			const discovery = { git: { origin: "git@github.com:owner/repo.git" } };
			const capabilities = { ghCli: false };
			const effects = planTrackerEffects(config, discovery, null, capabilities);
			assert.equal(effects.length, 1);
			assert.equal(effects[0].classification, "BLOCKING_CONFLICT");
			assert.match(effects[0].reason, /gh CLI is not available/);
		});

		test("blocks Jira if capability is not ready (zero-write failure)", () => {
			const config = { tracker: { primary: "jira" }, jira: { sync: "disabled" } };
			const validation = { ready: false, reason: "jira-cli binary not found" };
			const effects = planTrackerEffects(config, {}, validation, {});
			assert.equal(effects.length, 1);
			assert.equal(effects[0].classification, "BLOCKING_CONFLICT");
			assert.equal(effects[0].reason, "jira-cli binary not found");
		});

		test("blocks Jira if sync is not disabled", () => {
			const config = { tracker: { primary: "jira" }, jira: { sync: "all_local_tickets" } };
			const validation = { ready: true };
			const effects = planTrackerEffects(config, {}, validation, {});
			assert.equal(effects[0].classification, "BLOCKING_CONFLICT");
			assert.match(effects[0].reason, /sync to be disabled/);
		});

		test("reports dependency conflict for Jira-aware choices without Jira binding", () => {
			const config = { tracker: { primary: "local" }, ui: { session_start_dashboard: "jira_assignments" } };
			const effects = planTrackerEffects(config, {}, null, {});
			assert.equal(effects.length, 1);
			assert.equal(effects[0].classification, "BLOCKING_CONFLICT");
			assert.match(effects[0].reason, /Jira-aware configuration requires Jira binding/);
		});

		test("Jira readiness correctly reports blockers without invalidating unrelated config", () => {
			const config = { tracker: { primary: "jira" }, jira: { sync: "all_local_tickets" } };
			const validation = { ready: false, reason: "jira-cli authentication failed" };
			const readiness = checkTrackerReadiness(config, {}, validation, {});
			
			assert.equal(readiness.trackerReady, false);
			assert.equal(readiness.blockers.length, 2);
			assert.ok(readiness.blockers.includes("jira-cli authentication failed"));
			assert.ok(readiness.blockers.includes("Jira primary tracker requires Jira sync to be disabled"));
		});
	});
});
