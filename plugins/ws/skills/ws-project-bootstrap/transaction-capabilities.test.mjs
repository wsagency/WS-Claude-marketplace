import assert from "node:assert/strict";
import test from "node:test";
import { parseCanonicalConfigYaml, serializeCanonicalConfig } from "./config.mjs";
import { buildPlan, CANONICAL_CONFIG_YAML } from "./transaction.mjs";

function discovery(origin, machine = {}) {
	const fileTargets = [".wsagency/config.yaml", "dev-docs/agents/issue-tracker.md", "dev-docs/agents/triage-labels.md", "dev-docs/agents/domain.md", "CONTEXT.md", "AGENTS.md", "CLAUDE.md"];
	const entries = Object.fromEntries(fileTargets.map(target => [target, { kind: "missing", fingerprint: null }]));
	entries["dev-docs/tickets/open"] = { kind: "missing", fingerprint: null };
	entries["dev-docs/tickets/done"] = { kind: "missing", fingerprint: null };
	return {
		root: "/repo",
		projectShape: "standalone",
		setupState: "unconfigured",
		git: { isRepository: true, root: "/repo", origin, head: null, dirty: [] },
		machine: { activeHarness: "omp", sessionDiscipline: true, dangerousGitGuard: true, ...machine },
		entries,
	};
}

function choices(mutator, extra = {}) {
	const config = parseCanonicalConfigYaml(CANONICAL_CONFIG_YAML);
	mutator(config);
	return { profile: "materialized", targetConfig: serializeCanonicalConfig(config), ...extra };
}

test("GitHub setup requires only matching origin and gh capability", () => {
	const plan = buildPlan(discovery("git@github.com:wsagency/project.git"), choices(config => { config.tracker.primary = "github"; }, { capabilities: { ghCli: true } }));
	assert.equal(plan.effects.find(effect => effect.target === "dev-docs/tickets/open").classification, "SKIP");
	assert.match(plan.effects.find(effect => effect.target === "dev-docs/agents/issue-tracker.md").after, /GitHub/);
	assert.equal(plan.effects.some(effect => effect.classification === "BLOCKING_CONFLICT"), false);
});

test("GitLab outage blocks tracker integration without changing unrelated runtime readiness", () => {
	const plan = buildPlan(discovery("https://gitlab.com/wsagency/project.git"), choices(config => { config.tracker.primary = "gitlab"; }, { capabilities: { glabCli: false } }));
	assert.equal(plan.effects.find(effect => effect.target === "integration:gitlab").classification, "BLOCKING_CONFLICT");
	assert.equal(plan.effects.find(effect => effect.target === "runtime:session_discipline").classification, "NO-OP");
});

test("Jira primary requires verified Jira capability and disabled sync", () => {
	const plan = buildPlan(discovery("git@github.com:wsagency/project.git"), choices(config => {
		config.tracker.primary = "jira";
		config.jira = { project: "WCM", default_issue_type: "Task", sync: "disabled" };
	}, { jiraValidation: { ready: false, reason: "jira-cli authentication failed" } }));
	assert.equal(plan.effects.find(effect => effect.target === "integration:jira").classification, "BLOCKING_CONFLICT");
	assert.match(plan.effects.find(effect => effect.target === "integration:jira").reason, /authentication failed/);
});

test("disabled repository guard does not require guard capability", () => {
	const plan = buildPlan(discovery(null, { dangerousGitGuard: false }), choices(config => { config.runtime.dangerous_git_guard = "disabled"; }));
	assert.equal(plan.effects.find(effect => effect.target === "runtime:dangerous_git_guard").classification, "NO-OP");
});

test("docs selection remains an explicitly delegated worker effect", () => {
	const plan = buildPlan(discovery(null), choices(config => {
		config.docs = { user_track: "docs", dev_track: "dev-docs", default_audience: "ask", default_scope: "repo", adr_for_arch_changes: true };
	}));
	assert.equal(plan.effects.find(effect => effect.target === "documentation:bootstrap").classification, "PRESERVE");
});
