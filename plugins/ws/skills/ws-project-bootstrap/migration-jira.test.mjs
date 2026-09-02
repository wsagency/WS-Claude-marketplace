import { test } from "node:test";
import * as assert from "node:assert/strict";
import { discoverJiraState, planJiraMigration, checkJiraCleanupEligibility } from "./migration-jira.mjs";
import { readFileSync } from "node:fs";

test("discoverJiraState recognizes empty snapshots", () => {
	const discovery = discoverJiraState({});
	assert.equal(discovery.hasGlobalConfig, false);
	assert.equal(discovery.hasProjectConfig, false);
	assert.deepEqual(discovery.globalValues, {});
	assert.deepEqual(discovery.projectValues, {});
});

test("discoverJiraState processes json objects", () => {
	const discovery = discoverJiraState({
		"~/.claude/ws/config.yaml": { defaults: { jira_actions: "never" } }
	});
	assert.equal(discovery.globalValues["defaults.jira_actions"], "never");
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
			"ui.session_start_dashboard": true,
			"jira.site": "wsagency.atlassian.net",
			"atlassian.account_id": "123"
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
	assert.equal(plan.patch.jira?.project, "EXISTING");
	
	// local applies
	assert.equal(plan.patch.jira?.board, 42);
	
	// ui dashboard conversion
	assert.equal(plan.patch.ui?.session_start_dashboard, "jira_assignments");
	
	// changelog mode conversion
	assert.equal(plan.patch.changelog?.update_mode, "pull_request");
	
	// global values are just suggestions
	const hasAction = plan.suggestions.some(s => s.field === "commit.jira.actions" && s.value === "ask");
	assert.equal(hasAction, true);
	
	// jira.site must NEVER enter the patch (it's excluded/not canonical)
	assert.equal(plan.patch.jira?.site, undefined);
	assert.equal(plan.patch.site, undefined);
	assert.equal(plan.patch.atlassian?.account_id, undefined);
});

test("planJiraMigration maps never to disabled in suggestions", () => {
	const discovery = { globalValues: { "defaults.jira_actions": "never" } };
	const plan = planJiraMigration(discovery, null, {});
	const hasAction = plan.suggestions.some(s => s.field === "commit.jira.actions" && s.value === "disabled");
	assert.equal(hasAction, true);
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
	
	const hasSkipConflict = plan.conflicts.some(c => c.field === "changelog.skip_types");
	assert.equal(hasSkipConflict, true);
	
	const hasModeConflict = plan.conflicts.some(c => c.field === "changelog.update_mode");
	assert.equal(hasModeConflict, true);
});

test("planJiraMigration NO-OP when canonical matches local", () => {
	const discovery = {
		projectValues: { "jira.project": "WSC" }
	};
	const plan = planJiraMigration(discovery, { jira: { project: "WSC" } }, {});
	assert.equal(plan.effects.length, 0); // No updates
});

test("checkJiraCleanupEligibility enforces validation and readiness", () => {
	const plan = { patch: { jira: { project: "WSC" } }, conflicts: [] };
	
	// not valid
	let result = checkJiraCleanupEligibility(plan, { isValid: false }, { isJiraReady: true });
	assert.equal(result.eligible, false);
	
	// valid but jira not ready (auth failure built on ticket-14 contracts represented by isJiraReady)
	result = checkJiraCleanupEligibility(plan, { isValid: true }, { isJiraReady: false });
	assert.equal(result.eligible, false);
	
	// conflicts
	result = checkJiraCleanupEligibility({ ...plan, conflicts: [{ field: "foo" }] }, { isValid: true }, { isJiraReady: true });
	assert.equal(result.eligible, false);
	
	// eligible
	result = checkJiraCleanupEligibility(plan, { isValid: true }, { isJiraReady: true });
	assert.equal(result.eligible, true);
});

test("End-to-end fixture loading and resolution", () => {
	const globalJson = JSON.parse(readFileSync(new URL("./fixtures/jira-initializer/v1-machine-global-legacy.json", import.meta.url), "utf8"));
	const repoJson = JSON.parse(readFileSync(new URL("./fixtures/jira-initializer/v2-repo-local.json", import.meta.url), "utf8"));
	const docsJson = JSON.parse(readFileSync(new URL("./fixtures/jira-initializer/v3-docs-config.json", import.meta.url), "utf8"));
	
	const discovery = discoverJiraState({
		"~/.claude/ws/config.yaml": globalJson,
		".claude/ws-project.yaml": repoJson,
		".claude/docs-config.yaml": docsJson
	});
	
	let plan = planJiraMigration(discovery, null, {});
	
	assert.equal(plan.patch.jira.project, "WSC");
	
	// Resolve conflicts
	const resolutions = {
		"changelog.update_mode": "pull_request",
		"changelog.skip_types": ["docs"]
	};
	plan = planJiraMigration(discovery, null, resolutions);
	assert.equal(plan.conflicts.length, 0);
	assert.equal(plan.patch.changelog.update_mode, "pull_request");
	assert.deepEqual(plan.patch.changelog.skip_types, ["docs"]);
	
	// Check eligible
	let eligibility = checkJiraCleanupEligibility(plan, { isValid: true }, { isJiraReady: true });
	assert.equal(eligibility.eligible, true);
	
	// Check suggestions map never->disabled
	const hasAction = plan.suggestions.some(s => s.field === "commit.jira.actions" && s.value === "disabled");
	assert.equal(hasAction, true);
	
	// Ensure user-global config is never marked for cleanup/removal in effects
	const hasGlobalRemoval = plan.effects.some(e => e.target === "~/.claude/ws/config.yaml" && e.classification !== "PRESERVE");
	assert.equal(hasGlobalRemoval, false);
});
