import { test, expect } from "bun:test";
import { discoverJiraState, planJiraMigration, checkJiraCleanupEligibility } from "./migration-jira.mjs";

test("discoverJiraState recognizes empty snapshots", () => {
	const discovery = discoverJiraState({});
	expect(discovery.hasGlobalConfig).toBe(false);
	expect(discovery.hasProjectConfig).toBe(false);
	expect(discovery.globalValues).toEqual({});
	expect(discovery.projectValues).toEqual({});
});


test("parseYamlLike handles arrays and nested keys", () => {
	const { parseYamlLike } = require("./migration-jira.mjs");
	const yaml = `
jira:
  project: WSC
  board: 42
changelog:
  skip_types: [docs, chore, test]
  auto_update: true
ui:
  session_start_dashboard: true
`;
	const parsed = parseYamlLike(yaml);
	expect(parsed["jira.project"]).toBe("WSC");
	expect(parsed["jira.board"]).toBe(42);
	expect(parsed["changelog.skip_types"]).toEqual(["docs", "chore", "test"]);
	expect(parsed["changelog.auto_update"]).toBe(true);
	expect(parsed["ui.session_start_dashboard"]).toBe(true);
});

test("planJiraMigration prefers canonical over local over global", () => {
	const discovery = {
		projectValues: {
			"jira.project": "WSC",
			"jira.board": 42,
			"hooks.session_start_dashboard": true,
			"changelog.auto_update": true
		},
		globalValues: {
			"defaults.jira_actions": "ask",
			"ui.session_start_dashboard": true
		},
		docsValues: {
			"auto.changelog_per_commit": false
		}
	};
	const currentCanonical = {
		jira: { project: "EXISTING" }
	};
	const resolutions = {};
	const plan = planJiraMigration(discovery, currentCanonical, resolutions);
	
	// existing canonical wins
	expect(plan.patch.jira?.project).toBe("EXISTING");
	
	// local applies
	expect(plan.patch.jira?.board).toBe(42);
	
	// ui dashboard conversion
	expect(plan.patch.ui?.session_start_dashboard).toBe("jira_assignments");
	
	// changelog mode conversion
	expect(plan.patch.changelog?.update_mode).toBe("pull_request");
	
	// global values are just suggestions
	expect(plan.suggestions).toContainEqual({
		field: "commit.jira.actions",
		value: "ask",
		source: "~/.claude/ws/config.yaml"
	});
});

test("planJiraMigration detects skip_types and changelog conflicts", () => {
	const discovery = {
		projectValues: {
			"changelog.skip_types": ["docs"],
			"changelog.auto_update": true
		},
		docsValues: {
			"docs.changelog.skip_types": ["test"],
			"auto.changelog_per_commit": true
		}
	};
	const plan = planJiraMigration(discovery, null, {});
	
	expect(plan.conflicts).toContainEqual({
		field: "changelog.skip_types",
		values: [
			{ source: ".claude/ws-project.yaml", value: ["docs"] },
			{ source: ".claude/docs-config.yaml", value: ["test"] }
		]
	});
	
	expect(plan.conflicts).toContainEqual({
		field: "changelog.update_mode",
		values: [
			{ source: ".claude/ws-project.yaml (changelog.auto_update)", value: true },
			{ source: ".claude/docs-config.yaml (auto.changelog_per_commit)", value: true }
		]
	});
});

test("checkJiraCleanupEligibility enforces validation and readiness", () => {
	const plan = { patch: { jira: { project: "WSC" } }, conflicts: [] };
	
	// not valid
	let result = checkJiraCleanupEligibility(plan, { isValid: false }, { isJiraReady: true });
	expect(result.eligible).toBe(false);
	
	// valid but jira not ready
	result = checkJiraCleanupEligibility(plan, { isValid: true }, { isJiraReady: false });
	expect(result.eligible).toBe(false);
	
	// conflicts
	result = checkJiraCleanupEligibility({ ...plan, conflicts: [{ field: "foo" }] }, { isValid: true }, { isJiraReady: true });
	expect(result.eligible).toBe(false);
	
	// eligible
	result = checkJiraCleanupEligibility(plan, { isValid: true }, { isJiraReady: true });
	expect(result.eligible).toBe(true);
});
import { readFileSync } from "node:fs";

test("End-to-end fixture loading and resolution", () => {
	const globalYaml = readFileSync(__dirname + "/fixtures/jira-initializer/v2-machine-global.yaml", "utf8");
	const repoYaml = readFileSync(__dirname + "/fixtures/jira-initializer/v3-repo-local.yaml", "utf8");
	const docsYaml = readFileSync(__dirname + "/fixtures/jira-initializer/v4-conflicts.yaml", "utf8");
	
	const discovery = discoverJiraState({
		"~/.claude/ws/config.yaml": globalYaml,
		".claude/ws-project.yaml": repoYaml,
		".claude/docs-config.yaml": docsYaml
	});
	
	let plan = planJiraMigration(discovery, null, {});
	
	// Has conflicts due to changelog skip_types and auto update
	expect(plan.conflicts.length).toBe(2);
	expect(plan.patch.jira.project).toBe("WSC");
	
	// Not eligible for cleanup because of conflicts
	let eligibility = checkJiraCleanupEligibility(plan, { isValid: true }, { isJiraReady: true });
	expect(eligibility.eligible).toBe(false);
	
	// Resolve conflicts
	const resolutions = {
		"changelog.update_mode": "pull_request",
		"changelog.skip_types": ["docs"]
	};
	plan = planJiraMigration(discovery, null, resolutions);
	expect(plan.conflicts.length).toBe(0);
	expect(plan.patch.changelog.update_mode).toBe("pull_request");
	expect(plan.patch.changelog.skip_types).toEqual(["docs"]);
	
	// Check eligible
	eligibility = checkJiraCleanupEligibility(plan, { isValid: true }, { isJiraReady: true });
	expect(eligibility.eligible).toBe(true);
	
	// Check suggestions
	expect(plan.suggestions).toContainEqual({
		field: "commit.jira.actions",
		value: "ask",
		source: "~/.claude/ws/config.yaml"
	});
});
