import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyLegacyCleanup, discoverLegacySetup, planLegacyMigration } from "./migration.mjs";
import { serializeCanonicalConfig } from "./config.mjs";
import { getAdapterContent } from "./trackers.mjs";

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
const managedContext = "<!-- WS-AGENT-SKILLS:START -->\n## Agent skills\n<!-- WS-AGENT-SKILLS:END -->\n";

async function writeRepositoryFile(root, target, content) {
	await mkdir(path.dirname(path.join(root, target)), { recursive: true });
	await writeFile(path.join(root, target), content, "utf8");
}

async function materializeMigrationEvidence(root, plan) {
	await writeRepositoryFile(root, ".wsagency/config.yaml", serializeCanonicalConfig(plan.config));
	await writeRepositoryFile(root, "dev-docs/agents/issue-tracker.md", getAdapterContent(plan.config.tracker.primary));
	await writeRepositoryFile(root, "dev-docs/agents/triage-labels.md", await readFile(new URL("./templates/triage-labels.md", import.meta.url), "utf8"));
	await writeRepositoryFile(root, "dev-docs/agents/domain.md", await readFile(new URL("./templates/domain.md", import.meta.url), "utf8"));
	await writeRepositoryFile(root, "AGENTS.md", managedContext);
	await writeRepositoryFile(root, "CLAUDE.md", "@AGENTS.md\n");
	await writeRepositoryFile(root, plan.config.domain.layout === "multi_context" ? "CONTEXT-MAP.md" : "CONTEXT.md", "# Domain context\n");
	if (plan.config.docs) {
		await mkdir(path.join(root, plan.config.docs.user_track), { recursive: true });
		await mkdir(path.join(root, plan.config.docs.dev_track), { recursive: true });
		await writeRepositoryFile(root, plan.config.changelog.path, "# Changelog\n");
	}
}

async function withLocalJiraCleanup(tickets, run) {
	const releasedAdapter = (await readFile(new URL("./fixtures/pre-5-engineering/issue-tracker-local-jira.md", import.meta.url), "utf8")).replaceAll("<PROJECT-KEY>", "WCM");
	await withRepository({
		".claude/ws-project.yaml": "jira:\n  project: WCM\n  default_issue_type: Task\n",
		"dev-docs/agents/issue-tracker.md": releasedAdapter,
		...tickets,
	}, async root => {
		const plan = planLegacyMigration(await discoverLegacySetup(root, machine));
		assert.equal(plan.blockers.length, 0);
		assert.equal(plan.config.jira.sync, "all_local_tickets");
		await mkdir(path.join(root, "dev-docs/tickets/open"), { recursive: true });
		await mkdir(path.join(root, "dev-docs/tickets/done"), { recursive: true });
		await materializeMigrationEvidence(root, plan);
		await run(root, plan);
	});
}

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

test("released adapters remain authorized replacements while customized adapters remain preserved", async () => {
	const released = (await readFile(new URL("./fixtures/pre-5-engineering/issue-tracker-jira.md", import.meta.url), "utf8")).replaceAll("<PROJECT-KEY>", "WCM");
	await withRepository({ "dev-docs/agents/issue-tracker.md": released }, async root => {
		const plan = planLegacyMigration(await discoverLegacySetup(root, machine));
		const adapter = plan.effects.find(effect => effect.target === "dev-docs/agents/issue-tracker.md");
		assert.equal(adapter.classification, "UPDATE");
		assert.equal(adapter.after, getAdapterContent("jira"));
		assert.notEqual(adapter.before, adapter.after);

		await writeRepositoryFile(root, ".wsagency/config.yaml", serializeCanonicalConfig(plan.config));
		const resumed = planLegacyMigration(await discoverLegacySetup(root, machine));
		assert.equal(resumed.effects.find(effect => effect.target === "dev-docs/agents/issue-tracker.md").classification, "UPDATE");
		assert.equal(resumed.effects.find(effect => effect.target === ".wsagency/config.yaml").classification, "NO-OP");
	});
	const customized = "# Team issue tracker\n\nUse GitHub Issues. Preserve component metadata and escalation notes.\n";
	await withRepository({ "dev-docs/agents/issue-tracker.md": customized }, async root => {
		const plan = planLegacyMigration(await discoverLegacySetup(root, machine));
		const adapter = plan.effects.find(effect => effect.target === "dev-docs/agents/issue-tracker.md");
		assert.equal(plan.blockers.length, 0);
		assert.equal(adapter.classification, "PRESERVE");
		assert.equal(adapter.after, customized);
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

		await materializeMigrationEvidence(root, resumed);
		assert.deepEqual(await applyLegacyCleanup(root, resumed, resumed.hash, machine), [{ action: "delete", target: ".claude/ws-project.yaml" }]);
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

test("legacy discovery refuses sources reached through an external symlink", async () => {
	const external = await mkdtemp(path.join(tmpdir(), "ws-migration-external-"));
	try {
		await writeFile(path.join(external, "ws-project.yaml"), "jira:\n  project: OUTSIDE\n", "utf8");
		await withRepository({}, async root => {
			await symlink(external, path.join(root, ".claude"), "dir");
			const discovery = await discoverLegacySetup(root, machine);
			assert.equal(discovery.entries[".claude/ws-project.yaml"].kind, "blocked");
			const plan = planLegacyMigration(discovery);
			assert.ok(plan.blockers.length > 0);
			assert.ok(!plan.effects.some(effect => effect.target === ".claude/ws-project.yaml" && effect.classification === "UPDATE"));
			assert.equal(await readFile(path.join(external, "ws-project.yaml"), "utf8"), "jira:\n  project: OUTSIDE\n");
		});
	} finally {
		await rm(external, { recursive: true, force: true });
	}
});

test("cleanup derives every gate from current repository state before deletion", async () => {
	await withRepository({
		".claude/ws-project.yaml": "jira:\n  project: WCM\n  default_issue_type: Task\n",
		".claude/docs-config.yaml": "docs:\n  user_track: docs\n  dev_track: dev-docs\n  default_audience: ask\n  default_scope: repo\n  auto:\n    changelog_per_commit: false\n    adr_for_arch_changes: true\n",
	}, async root => {
		const discovery = await discoverLegacySetup(root, machine);
		const plan = planLegacyMigration(discovery, { resolutions: { "changelog.update_mode": "pull_request" } });
		await assert.rejects(() => applyLegacyCleanup(root, plan, "wrong", machine), /authorization/i);
		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, machine), /canonical configuration is missing/i);
		assert.equal(await readFile(path.join(root, ".claude/ws-project.yaml"), "utf8"), discovery.entries[".claude/ws-project.yaml"].content);

		await materializeMigrationEvidence(root, plan);
		const adapterTarget = "dev-docs/agents/issue-tracker.md";
		await rm(path.join(root, adapterTarget));
		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, machine), /migrated adapter/i);
		await writeRepositoryFile(root, adapterTarget, getAdapterContent(plan.config.tracker.primary));

		await rm(path.join(root, "AGENTS.md"));
		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, machine), /shared context/i);
		await writeRepositoryFile(root, "AGENTS.md", managedContext);

		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, { ...machine, dangerousGitGuard: false }), /active runtime delivery/i);

		await rm(path.join(root, plan.config.docs.user_track), { recursive: true });
		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, machine), /selected documentation path/i);
		await mkdir(path.join(root, plan.config.docs.user_track), { recursive: true });

		await writeFile(path.join(root, ".claude/docs-config.yaml"), "authored drift\n", "utf8");
		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, machine), /drift/i);
		assert.equal(await readFile(path.join(root, ".claude/ws-project.yaml"), "utf8"), discovery.entries[".claude/ws-project.yaml"].content);
	});
});

test("verified cleanup deletes only known local sources and aligned rerun is prompt-free", async () => {
	await withRepository({ ".claude/ws-project.yaml": "jira:\n  project: WCM\n  default_issue_type: Task\n" }, async root => {
		const discovery = await discoverLegacySetup(root, machine);
		const plan = planLegacyMigration(discovery);
		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, machine), /canonical configuration is missing/i);
		await materializeMigrationEvidence(root, plan);
		const operations = await applyLegacyCleanup(root, plan, plan.hash, machine);
		assert.deepEqual(operations, [{ action: "delete", target: ".claude/ws-project.yaml" }]);
		const rerun = planLegacyMigration(await discoverLegacySetup(root, machine));
		assert.equal(rerun.requiresConfirmation, false);
		assert.equal(rerun.report, "Valid canonical configuration wins. No migration changes required.");
		assert.deepEqual(await applyLegacyCleanup(root, rerun, rerun.hash, machine), []);
	});
});

test("Jira cleanup accepts completed mappings across open and done tickets", async () => {
	await withLocalJiraCleanup({
		"dev-docs/tickets/open/WCM-101.md": "# Open ticket\n\njira: WCM-101\n",
		"dev-docs/tickets/done/WCM-102.md": "# Done ticket\n\njira: WCM-102\n",
	}, async (root, plan) => {
		assert.deepEqual(await applyLegacyCleanup(root, plan, plan.hash, machine), [{ action: "delete", target: ".claude/ws-project.yaml" }]);
	});
});

test("Jira cleanup accepts durable pending correlation and returned ID evidence", async () => {
	await withLocalJiraCleanup({
		"dev-docs/tickets/open/pending-correlation.md": `# Pending ticket\n\njira_sync: pending\njira_correlation: ${"a".repeat(64)}\n`,
		"dev-docs/tickets/done/pending-returned-id.md": "# Returned ticket\n\njira_sync: pending\njira_returned_id: WCM-103\n",
	}, async (root, plan) => {
		assert.deepEqual(await applyLegacyCleanup(root, plan, plan.hash, machine), [{ action: "delete", target: ".claude/ws-project.yaml" }]);
	});
});

test("Jira cleanup blocks an unmapped Local ticket", async () => {
	await withLocalJiraCleanup({
		"dev-docs/tickets/open/unmapped.md": "# Unmapped ticket\n\nNo Jira recovery metadata.\n",
	}, async (root, plan) => {
		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, machine), /unmapped.*durable Jira recovery evidence/i);
		assert.equal(await readFile(path.join(root, ".claude/ws-project.yaml"), "utf8"), "jira:\n  project: WCM\n  default_issue_type: Task\n");
	});
});

test("Jira cleanup derives recovery evidence from current ticket state", async () => {
	await withLocalJiraCleanup({
		"dev-docs/tickets/open/drifted.md": "# Initially mapped ticket\n\njira: WCM-104\n",
	}, async (root, plan) => {
		await writeFile(path.join(root, "dev-docs/tickets/open/drifted.md"), "# Mapping removed after planning\n", "utf8");
		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, machine), /unmapped.*durable Jira recovery evidence/i);
		assert.equal(await readFile(path.join(root, ".claude/ws-project.yaml"), "utf8"), "jira:\n  project: WCM\n  default_issue_type: Task\n");
	});
});

test("Jira cleanup rejects malformed durable recovery evidence", async () => {
	await withLocalJiraCleanup({
		"dev-docs/tickets/open/malformed.md": "# Malformed ticket\n\njira_sync: pending\njira_correlation: short-lived-token\n",
	}, async (root, plan) => {
		await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, machine), /malformed jira_correlation evidence/i);
	});
});

test("Jira cleanup fails closed for non-file and symlinked Markdown ticket entries", async t => {
	for (const kind of ["directory", "symlink"]) {
		await t.test(kind, async () => {
			await withLocalJiraCleanup({
				"dev-docs/tickets/open/unsafe.md": "# Initially mapped ticket\n\njira: WCM-105\n",
			}, async (root, plan) => {
				const target = path.join(root, "dev-docs/tickets/open/unsafe.md");
				await rm(target);
				if (kind === "directory") await mkdir(target);
				else await symlink(path.join(root, ".claude/ws-project.yaml"), target);
				await assert.rejects(() => applyLegacyCleanup(root, plan, plan.hash, machine), /unreadable, not a file, or symlinked/i);
			});
		});
	}
});
