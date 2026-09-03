import assert from "node:assert/strict";
import test from "node:test";
import { checkDocsRuntimeCleanupEligibility, discoverDocsRuntimeState, planDocsRuntimeMigration } from "./migration-docs-runtime.mjs";

const releasedDocsConfig = `docs:
  initialized: 2026-08-01
  version: 1
  user_track: docs
  dev_track: dev-docs
  default_audience: ask
  default_scope: repo
  changelog:
    skip_types: [docs, chore, test, style, build, ci]
  auto:
    changelog_per_commit: false
    adr_for_arch_changes: true
    enforce_via_hooks: true
  surface:
    subagent_status: compact
`;
const base = () => ({ schema_version: 1 });

test("released docs configuration maps deterministic policy and drops presentation markers", () => {
	const discovery = discoverDocsRuntimeState({ ".claude/docs-config.yaml": releasedDocsConfig }, { sessionDiscipline: true, dangerousGitGuard: true });
	const plan = planDocsRuntimeMigration(discovery, base(), { "changelog.update_mode": "pull_request" });
	assert.deepEqual(plan.patch.docs, {
		user_track: "docs",
		dev_track: "dev-docs",
		default_audience: "ask",
		default_scope: "repo",
		adr_for_arch_changes: true,
	});
	assert.deepEqual(plan.patch.changelog, {
		path: "CHANGELOG.md",
		skip_types: ["docs", "chore", "test", "style", "build", "ci"],
		update_mode: "pull_request",
	});
	assert.deepEqual(plan.patch.runtime, { session_discipline: "required", dangerous_git_guard: "enabled" });
	assert.ok(!JSON.stringify(plan.patch).includes("initialized"));
	assert.ok(!JSON.stringify(plan.patch).includes("subagent_status"));
	assert.equal(plan.blockers.length, 0);
	assert.equal(plan.effects.find(effect => effect.target === ".claude/docs-config.yaml").order, 900);
});

test("changelog truth table resolves unambiguous modes", () => {
	const cases = [
		[true, false, "pull_request"],
		[false, true, "commit"],
		[false, false, "disabled"],
	];
	for (const [autoUpdate, perCommit, expected] of cases) {
		const discovery = discoverDocsRuntimeState({
			".claude/ws-project.yaml": { changelog: { auto_update: autoUpdate } },
			".claude/docs-config.yaml": { auto: { changelog_per_commit: perCommit } },
		}, { dangerousGitGuard: true });
		assert.equal(planDocsRuntimeMigration(discovery, base()).patch.changelog.update_mode, expected);
	}
});

test("contradictory and insufficient changelog booleans block until explicitly resolved", () => {
	for (const [project, docs] of [
		[{ changelog: { auto_update: true } }, { auto: { changelog_per_commit: true } }],
		[{}, { auto: { changelog_per_commit: false } }],
	]) {
		const discovery = discoverDocsRuntimeState({ ".claude/ws-project.yaml": project, ".claude/docs-config.yaml": docs });
		const blocked = planDocsRuntimeMigration(discovery, base());
		assert.ok(blocked.blockers.some(blocker => blocker.includes("changelog.update_mode")));
		assert.equal(blocked.effects.find(effect => effect.target === "config:changelog.update_mode").classification, "BLOCKING_CONFLICT");
		const resolved = planDocsRuntimeMigration(discovery, base(), { "changelog.update_mode": "pull_request" });
		assert.equal(resolved.blockers.length, 0);
	}
});

test("conflicting fat context files preserve authored prose and require a choice", () => {
	const discovery = discoverDocsRuntimeState({
		"AGENTS.md": "# Authored agent context\n",
		"CLAUDE.md": "# Different authored Claude context\n",
	});
	const blocked = planDocsRuntimeMigration(discovery, base());
	assert.ok(blocked.blockers.some(blocker => blocker.includes("context.source")));
	assert.deepEqual(blocked.effects.filter(effect => ["AGENTS.md", "CLAUDE.md"].includes(effect.target)).map(effect => effect.classification), ["PRESERVE", "PRESERVE"]);

	const resolvedAgents = planDocsRuntimeMigration(discovery, base(), { "context.source": "agents" });
	assert.ok(!resolvedAgents.blockers.some(blocker => blocker.includes("context.source")));
	assert.equal(resolvedAgents.effects.find(e => e.target === "AGENTS.md").classification, "UPDATE");
	assert.equal(resolvedAgents.effects.find(e => e.target === "AGENTS.md").after, "# Authored agent context\n");
	assert.equal(resolvedAgents.effects.find(e => e.target === "CLAUDE.md").classification, "UPDATE");
	assert.match(resolvedAgents.effects.find(e => e.target === "CLAUDE.md").after, /@AGENTS\.md/);

	const resolvedMerge = planDocsRuntimeMigration(discovery, base(), { "context.source": "merge" });
	assert.equal(resolvedMerge.effects.find(e => e.target === "AGENTS.md").after, "# Authored agent context\n\n# Different authored Claude context\n");
});

test("fat-only context fails closed and resolves to authorized effect", () => {
	const discovery = discoverDocsRuntimeState({
		"CLAUDE.md": "# Only fat claude context\n",
	});
	const blocked = planDocsRuntimeMigration(discovery, base());
	assert.ok(blocked.blockers.some(blocker => blocker.includes("context.source")));
	assert.deepEqual(blocked.effects.filter(effect => ["CLAUDE.md"].includes(effect.target)).map(effect => effect.classification), ["PRESERVE"]);

	const resolved = planDocsRuntimeMigration(discovery, base(), { "context.source": "claude" });
	assert.ok(!resolved.blockers.some(blocker => blocker.includes("context.source")));
	assert.equal(resolved.effects.find(e => e.target === "AGENTS.md").classification, "CREATE");
	assert.equal(resolved.effects.find(e => e.target === "AGENTS.md").after, "# Only fat claude context\n");
	assert.equal(resolved.effects.find(e => e.target === "CLAUDE.md").classification, "UPDATE");
});

test("invalid context resolutions fail closed without discarding authored bytes", () => {
	const fatOnly = discoverDocsRuntimeState({ "CLAUDE.md": "# Claude-only context\n" });
	for (const resolution of ["agents", "unknown"]) {
		const plan = planDocsRuntimeMigration(fatOnly, base(), { "context.source": resolution });
		assert.ok(plan.blockers.some(blocker => blocker.includes("context.source")));
		assert.equal(plan.effects.find(effect => effect.target === "CLAUDE.md").classification, "PRESERVE");
		assert.equal(plan.effects.find(effect => effect.target === "CLAUDE.md").after, "# Claude-only context\n");
		assert.equal(plan.effects.some(effect => effect.target === "AGENTS.md" && effect.classification !== "PRESERVE"), false);
	}
});

test("merged context preserves every authored source byte", () => {
	const agentsContent = "# Agent context\n\n";
	const claudeContent = "  # Claude context without trailing newline";
	const discovery = discoverDocsRuntimeState({
		"AGENTS.md": agentsContent,
		"CLAUDE.md": claudeContent,
	});
	const plan = planDocsRuntimeMigration(discovery, base(), { "context.source": "merge" });
	const merged = plan.effects.find(effect => effect.target === "AGENTS.md").after;
	assert.ok(merged.startsWith(agentsContent));
	assert.ok(merged.endsWith(claudeContent));
	assert.equal(merged, `${agentsContent}\n${claudeContent}`);
});

test("recommended guard policy is independent of machine capability and accepts explicit resolution", () => {
	const capableMachine = discoverDocsRuntimeState({}, { dangerousGitGuard: true });
	const incapableMachine = discoverDocsRuntimeState({}, { dangerousGitGuard: false });
	assert.equal(planDocsRuntimeMigration(capableMachine, base()).patch.runtime.dangerous_git_guard, "enabled");
	assert.equal(planDocsRuntimeMigration(incapableMachine, base()).patch.runtime.dangerous_git_guard, "enabled");
	assert.equal(
		planDocsRuntimeMigration(capableMachine, base(), { "runtime.dangerous_git_guard": "disabled" }).patch.runtime.dangerous_git_guard,
		"disabled",
	);
});

test("thin Claude import is recognized without a context conflict", () => {
	const discovery = discoverDocsRuntimeState({
		"AGENTS.md": "# Authored agent context\n",
		"CLAUDE.md": "<!-- Canonical project context lives in AGENTS.md (agent-neutral). Keep this file as a one-line import. -->\n@AGENTS.md\n",
	});
	assert.equal(discovery.context.thinClaude, true);
	assert.equal(planDocsRuntimeMigration(discovery, base()).conflicts.length, 0);
});

test("unknown and malformed legacy documentation policy fails closed", () => {
	const unknown = planDocsRuntimeMigration(discoverDocsRuntimeState({ ".claude/docs-config.yaml": "docs:\n  mystery: true\n" }), base());
	assert.match(unknown.blockers[0], /unknown legacy documentation fields/i);
	const malformed = planDocsRuntimeMigration(discoverDocsRuntimeState({ ".claude/docs-config.yaml": "docs:\n   invalid: true\n" }), base());
	assert.match(malformed.blockers[0], /malformed legacy source/i);
});

test("repository-owned runtime instructions are cleanup candidates only when uncustomized", () => {
	const exact = discoverDocsRuntimeState({ ".claude/settings.json": JSON.stringify({ hooks: { PreToolUse: [{ command: "ws dangerous-git guard" }] } }) }, { sessionDiscipline: true, dangerousGitGuard: true });
	const exactPlan = planDocsRuntimeMigration(exact, base());
	assert.equal(exactPlan.effects.find(effect => effect.target === ".claude/settings.json").classification, "UPDATE");
	const custom = discoverDocsRuntimeState({ ".claude/settings.json": JSON.stringify({ hooks: { PreToolUse: [{ command: "ws dangerous-git guard" }] }, permissions: { allow: ["Read"] } }) }, { sessionDiscipline: true, dangerousGitGuard: true });
	assert.equal(planDocsRuntimeMigration(custom, base()).effects.find(effect => effect.target === ".claude/settings.json").classification, "PRESERVE");
});

test("canonical policy wins over every legacy value", () => {
	const canonical = {
		schema_version: 1,
		docs: { user_track: "manual", dev_track: "internal", default_audience: "dev", default_scope: "product", adr_for_arch_changes: false },
		changelog: { update_mode: "disabled", path: "HISTORY.md", skip_types: [] },
		runtime: { session_discipline: "required", dangerous_git_guard: "disabled" },
	};
	const plan = planDocsRuntimeMigration(discoverDocsRuntimeState({ ".claude/docs-config.yaml": releasedDocsConfig }, { dangerousGitGuard: true }), canonical, { "docs.user_track": "ignored" });
	assert.deepEqual(plan.patch, canonical);
});

test("cleanup requires canonical docs, context, runtime, and conflict verification", () => {
	const plan = { blockers: [] };
	assert.deepEqual(checkDocsRuntimeCleanupEligibility(plan, { status: "valid" }, { docsReady: true, contextReady: true, runtimeReady: true }), { eligible: true, blockers: [] });
	const blocked = checkDocsRuntimeCleanupEligibility({ blockers: ["unresolved"] }, { status: "invalid" }, { docsReady: false, contextReady: false, runtimeReady: false });
	assert.deepEqual(blocked.blockers, ["Canonical configuration is invalid.", "Documentation policy and artifacts are not verified.", "Canonical context is not verified.", "Active runtime delivery is not verified.", "unresolved"]);
});
