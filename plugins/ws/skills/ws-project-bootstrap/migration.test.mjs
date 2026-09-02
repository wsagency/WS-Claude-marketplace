import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyLegacyCleanup, discoverLegacySetup, planLegacyMigration } from "./migration.mjs";
import { serializeCanonicalConfig } from "./config.mjs";

async function withRepository(files, run) {
	const root = await mkdtemp(path.join(tmpdir(), "ws-migration-test-"));
	try {
		for (const [target, content] of Object.entries(files)) {
			await mkdir(path.dirname(path.join(root, target)), { recursive: true });
			await writeFile(path.join(root, target), content, "utf8");
		}
		return await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

const machine = { sessionDiscipline: true, dangerousGitGuard: true };
const fullReadiness = {
	configValid: true,
	semanticReadBack: true,
	engineeringReady: true,
	contextReady: true,
	runtimeReady: true,
	fingerprintsReady: true,
	docsReady: true,
	jiraReady: true,
};

test("initializer-only repository produces a strict Jira canonical plan", async () => {
	await withRepository({
		".claude/ws-project.yaml": "jira:\n  project: WCM\n  board: 42\n  default_issue_type: Task\nchangelog:\n  auto_update: true\n  path: CHANGELOG.md\n  skip_types: [docs, chore]\nhooks:\n  session_start_dashboard: true\n",
	}, async root => {
		const plan = planLegacyMigration(await discoverLegacySetup(root, machine));
		assert.equal(plan.blockers.length, 0);
		assert.equal(plan.config.tracker.primary, "jira");
		assert.deepEqual(plan.config.jira, { project: "WCM", board: 42, default_issue_type: "Task", sync: "disabled" });
		assert.equal(plan.config.changelog.update_mode, "pull_request");
		assert.equal(plan.config.ui.session_start_dashboard, "jira_assignments");
		assert.equal(plan.requiresConfirmation, true);
		assert.ok(plan.effects.every(effect => ["order", "target", "kind", "classification", "reason", "before", "after", "diff", "fingerprint"].every(field => Object.hasOwn(effect, field))));
	});
});

test("documentation-initialized repository migrates docs policy and preserves authored content", async () => {
	await withRepository({
		".claude/docs-config.yaml": "docs:\n  user_track: guides\n  dev_track: engineering\n  default_audience: dev\n  default_scope: product\n  auto:\n    changelog_per_commit: true\n    adr_for_arch_changes: false\n",
		"CHANGELOG.md": "# Changelog\n\nAuthored history.\n",
		"AGENTS.md": "# Authored instructions\n",
	}, async root => {
		const plan = planLegacyMigration(await discoverLegacySetup(root, machine));
		assert.equal(plan.config.docs.user_track, "guides");
		assert.equal(plan.config.docs.dev_track, "engineering");
		assert.equal(plan.config.changelog.update_mode, "commit");
		assert.equal(plan.effects.find(effect => effect.target === "AGENTS.md").classification, "PRESERVE");
		assert.ok(!plan.effects.some(effect => effect.target === "CHANGELOG.md" && effect.classification === "UPDATE"));
	});
});

test("conflicting repository-local claims block every write until explicit resolution", async () => {
	await withRepository({
		".claude/ws-project.yaml": "changelog:\n  skip_types: [docs]\n",
		".claude/docs-config.yaml": "docs:\n  changelog:\n    skip_types: [test]\n  auto:\n    changelog_per_commit: false\n",
	}, async root => {
		const discovery = await discoverLegacySetup(root, machine);
		const blocked = planLegacyMigration(discovery, { resolutions: { "changelog.update_mode": "pull_request" } });
		assert.ok(blocked.blockers.some(blocker => blocker.includes("changelog.skip_types")));
		assert.equal(blocked.effects.find(effect => effect.target === ".wsagency/config.yaml").classification, "BLOCKING_CONFLICT");
		assert.ok(!blocked.effects.some(effect => ["CREATE", "UPDATE"].includes(effect.classification)));
		const resolved = planLegacyMigration(discovery, { resolutions: { "changelog.update_mode": "pull_request", "changelog.skip_types": ["docs", "test"] } });
		assert.equal(resolved.blockers.length, 0);
	});
});

test("unsupported custom tracker blocks and remains preserved", async () => {
	await withRepository({ "dev-docs/agents/issue-tracker.md": "# Tracker\n\nUse the Acme proprietary queue.\n" }, async root => {
		const plan = planLegacyMigration(await discoverLegacySetup(root, machine));
		assert.match(plan.blockers[0], /unsupported custom tracker/i);
		assert.equal(plan.effects.find(effect => effect.target === "dev-docs/agents/issue-tracker.md").classification, "PRESERVE");
		assert.equal(plan.effects.find(effect => effect.target === ".wsagency/config.yaml").classification, "BLOCKING_CONFLICT");
	});
});

test("canonical-first rerun resumes verified legacy cleanup after an interrupted migration", async () => {
	await withRepository({ ".claude/ws-project.yaml": "jira:\n  project: WCM\n  default_issue_type: Task\n" }, async root => {
		const initial = planLegacyMigration(await discoverLegacySetup(root, machine));
		await mkdir(path.join(root, ".wsagency"), { recursive: true });
		await writeFile(path.join(root, ".wsagency/config.yaml"), serializeCanonicalConfig(initial.config), "utf8");
		await writeFile(path.join(root, ".claude/ws-project.yaml"), "jira:\n  project: IGNORED\n  default_issue_type: Bug\n", "utf8");

		const resumed = planLegacyMigration(await discoverLegacySetup(root, machine));
		assert.equal(resumed.blockers.length, 0);
		assert.equal(resumed.config.jira.project, "WCM");
		assert.equal(resumed.config.jira.default_issue_type, "Task");
		assert.equal(resumed.effects.find(item => item.target === ".wsagency/config.yaml").classification, "NO-OP");
		assert.equal(resumed.effects.find(item => item.target === ".claude/ws-project.yaml").classification, "UPDATE");
		assert.equal(resumed.requiresConfirmation, true);

		assert.deepEqual(await applyLegacyCleanup(root, resumed, resumed.hash, fullReadiness), [{ action: "delete", target: ".claude/ws-project.yaml" }]);
		const aligned = planLegacyMigration(await discoverLegacySetup(root, machine));
		assert.equal(aligned.requiresConfirmation, false);
		assert.equal(aligned.report, "Valid canonical configuration wins. No migration changes required.");
	});
});

test("unknown repository-local policy blocks cleanup even when canonical policy is valid", async () => {
	await withRepository({
		".wsagency/config.yaml": serializeCanonicalConfig({ schema_version: 1, runtime: { session_discipline: "required", dangerous_git_guard: "enabled" } }),
		".claude/ws-project.yaml": "jira:\n  project: WCM\nunknown_policy: keep-me\n",
	}, async root => {
		const plan = planLegacyMigration(await discoverLegacySetup(root, machine));
		assert.ok(plan.blockers.some(blocker => blocker.includes("unknown_policy")));
		assert.equal(plan.effects.find(item => item.target === ".wsagency/config.yaml").classification, "BLOCKING_CONFLICT");
		assert.equal(plan.effects.find(item => item.target === ".claude/ws-project.yaml").classification, "PRESERVE");
		assert.ok(!plan.effects.some(item => ["CREATE", "UPDATE"].includes(item.classification)));
	});
});

test("future canonical schema stops without rewrite", async () => {
	await withRepository({ ".wsagency/config.yaml": "schema_version: 2\n" }, async root => {
		const plan = planLegacyMigration(await discoverLegacySetup(root, machine));
		assert.match(plan.blockers[0], /update the WS package/i);
		assert.equal(plan.effects[0].classification, "BLOCKING_CONFLICT");
	});
});

test("cleanup is read-back gated, authorized, drift-safe, and repository-local", async () => {
	await withRepository({
		".claude/ws-project.yaml": "jira:\n  project: WCM\n  default_issue_type: Task\n",
		".claude/docs-config.yaml": "docs:\n  user_track: docs\n  dev_track: dev-docs\n  default_audience: ask\n  default_scope: repo\n  auto:\n    changelog_per_commit: false\n    adr_for_arch_changes: true\n",
	}, async root => {
		const discovery = await discoverLegacySetup(root, machine);
		const plan = planLegacyMigration(discovery, { resolutions: { "changelog.update_mode": "pull_request" } });
		await assert.rejects(() => applyLegacyCleanup(root, plan, "wrong", fullReadiness), /authorization/i);
		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, { ...fullReadiness, semanticReadBack: false }), /semanticReadBack/);
		await writeFile(path.join(root, ".claude/docs-config.yaml"), "authored drift\n", "utf8");
		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, fullReadiness), /drift/i);
		assert.equal(await readFile(path.join(root, ".claude/ws-project.yaml"), "utf8"), discovery.entries[".claude/ws-project.yaml"].content);
	});
});

test("verified cleanup deletes only known local sources and aligned rerun is prompt-free", async () => {
	await withRepository({ ".claude/ws-project.yaml": "jira:\n  project: WCM\n  default_issue_type: Task\n" }, async root => {
		const discovery = await discoverLegacySetup(root, machine);
		const plan = planLegacyMigration(discovery);
		const operations = await applyLegacyCleanup(root, plan, plan.hash, fullReadiness);
		assert.deepEqual(operations, [{ action: "delete", target: ".claude/ws-project.yaml" }]);
		await mkdir(path.join(root, ".wsagency"), { recursive: true });
		await writeFile(path.join(root, ".wsagency/config.yaml"), serializeCanonicalConfig(plan.config), "utf8");
		const rerun = planLegacyMigration(await discoverLegacySetup(root, machine));
		assert.equal(rerun.requiresConfirmation, false);
		assert.equal(rerun.report, "Valid canonical configuration wins. No migration changes required.");
	});
});
