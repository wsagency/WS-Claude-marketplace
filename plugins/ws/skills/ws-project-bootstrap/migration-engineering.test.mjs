import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkEngineeringCleanupEligibility, discoverEngineeringState, planEngineeringMigration } from "./migration-engineering.mjs";
import { getAdapterContent } from "./trackers.mjs";

const LEGACY_ROOT = new URL("./fixtures/pre-5-engineering/", import.meta.url);
const template = name => readFileSync(new URL(name, LEGACY_ROOT), "utf8");
const canonical = () => ({
	schema_version: 1,
	runtime: { session_discipline: "required", dangerous_git_guard: "enabled" },
});

for (const [file, primary, sync] of [
	["issue-tracker-local.md", "local", "disabled"],
	["issue-tracker-github.md", "github", "disabled"],
	["issue-tracker-gitlab.md", "gitlab", "disabled"],
	["issue-tracker-jira.md", "jira", "disabled"],
	["issue-tracker-local-jira.md", "local", "all_local_tickets"],
]) {
	test(`released ${file} migrates deterministically`, () => {
		const content = template(file).replaceAll("<PROJECT-KEY>", "WCM");
		const discovery = discoverEngineeringState({ "dev-docs/agents/issue-tracker.md": content });
		const plan = planEngineeringMigration(discovery, canonical());
		assert.equal(discovery.tracker.primary, primary);
		assert.equal(discovery.tracker.generated, true);
		assert.equal(discovery.tracker.sync, sync);
		assert.equal(plan.patch.tracker.primary, primary);
		assert.equal(plan.patch.tracker.pull_requests, "ignore");
		assert.equal(plan.blockers.length, 0);
		assert.ok(plan.effects.every(effect => ["order", "target", "kind", "classification", "reason", "before", "after", "diff", "fingerprint"].every(field => Object.hasOwn(effect, field))));
		const adapter = plan.effects.find(effect => effect.target === "dev-docs/agents/issue-tracker.md");
		assert.equal(adapter.classification, "UPDATE");
		assert.equal(adapter.after, getAdapterContent(primary));
		assert.notEqual(adapter.after, content);
		if (file.includes("jira")) assert.equal(plan.patch.jira.project, "WCM");
	});
}

test("customized known tracker guidance requires a valid reviewed lossless merge and then aligns", () => {
	const content = "# Team issue tracker\n\nUse GitHub Issues. Preserve component metadata and escalation notes.\n";
	const discovery = discoverEngineeringState({ "dev-docs/agents/issue-tracker.md": content });
	const blocked = planEngineeringMigration(discovery, canonical());
	assert.equal(blocked.patch.tracker.primary, "github");
	assert.match(blocked.blockers.join("\n"), /reviewed lossless merge/i);
	assert.equal(blocked.effects.find(effect => effect.target === "dev-docs/agents/issue-tracker.md").classification, "PRESERVE");

	const preserved = planEngineeringMigration(discovery, canonical(), { "adapter.tracker": "preserve" });
	assert.match(preserved.blockers.join("\n"), /remains preserved/i);
	assert.equal(preserved.effects.find(effect => effect.target === "dev-docs/agents/issue-tracker.md").after, content);

	const managed = getAdapterContent("github").trimEnd();
	const mergedContent = `${managed}\n\n## Preserved legacy guidance\n\n${content}`;
	const merged = planEngineeringMigration(discovery, canonical(), {
		"adapter.tracker": { action: "merge", content: mergedContent },
	});
	assert.equal(merged.blockers.length, 0);
	assert.equal(merged.effects.find(effect => effect.target === "dev-docs/agents/issue-tracker.md").classification, "UPDATE");
	assert.equal(merged.effects.find(effect => effect.target === "dev-docs/agents/issue-tracker.md").after, mergedContent);

	for (const resolution of [
		"replace",
		{ action: "merge", content: managed },
		{ action: "merge", content: `${managed}\n${managed}\n${content}` },
	]) {
		const invalid = planEngineeringMigration(discovery, canonical(), { "adapter.tracker": resolution });
		assert.match(invalid.blockers.join("\n"), /invalid reviewed tracker adapter merge/i);
		assert.equal(invalid.effects.find(effect => effect.target === "dev-docs/agents/issue-tracker.md").classification, "PRESERVE");
	}

	const aligned = planEngineeringMigration(
		discoverEngineeringState({ "dev-docs/agents/issue-tracker.md": mergedContent }),
		{ ...canonical(), tracker: { primary: "github", pull_requests: "ignore" } },
	);
	assert.equal(aligned.blockers.length, 0);
	assert.equal(aligned.effects.some(effect => effect.target === "dev-docs/agents/issue-tracker.md"), false);
});

test("unsupported custom tracker blocks before writes", () => {
	const discovery = discoverEngineeringState({ "dev-docs/agents/issue-tracker.md": "# Tracker\n\nUse the private Acme queue.\n" });
	const plan = planEngineeringMigration(discovery, canonical());
	assert.match(plan.blockers[0], /unsupported custom tracker/i);
	assert.equal(plan.effects.find(effect => effect.target === "config:tracker.primary").classification, "BLOCKING_CONFLICT");
});

test("custom triage labels and repository context layout survive conversion", () => {
	const customTriage = template("triage-labels.md")
		.replaceAll("`needs-triage`       | Maintainer", "`queue/inbox`        | Maintainer")
		.replaceAll("`needs-info`         | Waiting", "`queue/blocked`      | Waiting")
		.replaceAll("`ready-for-agent`    | Fully", "`queue/agent`        | Fully")
		.replaceAll("`ready-for-human`    | Requires", "`queue/human`        | Requires")
		.replaceAll("`wontfix`            | Will", "`queue/wontfix`      | Will");
	const discovery = discoverEngineeringState({
		"dev-docs/agents/triage-labels.md": customTriage,
		"dev-docs/agents/domain.md": template("domain.md"),
		"CONTEXT-MAP.md": "# Context map\n",
	});
	const plan = planEngineeringMigration(discovery, canonical());
	assert.deepEqual(plan.patch.triage.labels, {
		needs_triage: "queue/inbox",
		needs_info: "queue/blocked",
		ready_for_agent: "queue/agent",
		ready_for_human: "queue/human",
		wontfix: "queue/wontfix",
	});
	assert.equal(plan.patch.domain.layout, "multi_context");
	assert.equal(plan.effects.find(effect => effect.target === "dev-docs/agents/triage-labels.md").classification, "PRESERVE");
});

test("active local work is discovered without being discarded", () => {
	const discovery = discoverEngineeringState({
		"dev-docs/agents/issue-tracker.md": template("issue-tracker-local.md"),
		activeLocalWork: true,
	});
	assert.equal(discovery.activeLocalWork, true);
	assert.equal(planEngineeringMigration(discovery, canonical()).patch.tracker.primary, "local");
});

test("conflicting context blocks require explicit source resolution and preserve both files", () => {
	const discovery = discoverEngineeringState({
		"AGENTS.md": "# Project\n\n## Agent skills\nAgent-owned text\n",
		"CLAUDE.md": "# Project\n\n## Agent skills\nDifferent text\n",
	});
	const blocked = planEngineeringMigration(discovery, canonical());
	assert.match(blocked.blockers[0], /explicit merge choice/i);
	assert.equal(blocked.effects.filter(effect => effect.classification === "PRESERVE").length, 2);
	const resolved = planEngineeringMigration(discovery, canonical(), { "context.source": "agents" });
	assert.equal(resolved.blockers.length, 0);
});

test("canonical values outrank legacy values", () => {
	const current = { ...canonical(), tracker: { primary: "gitlab", pull_requests: "triage" } };
	const discovery = discoverEngineeringState({ "dev-docs/agents/issue-tracker.md": template("issue-tracker-local.md") });
	const plan = planEngineeringMigration(discovery, current);
	assert.deepEqual(plan.patch.tracker, current.tracker);
	assert.ok(!plan.effects.some(effect => effect.target === "config:tracker.primary"));
});

test("cleanup requires canonical, adapter, context, and conflict verification", () => {
	const plan = { blockers: [] };
	assert.deepEqual(checkEngineeringCleanupEligibility(plan, { status: "valid" }, { engineeringReady: true, contextReady: true }), { eligible: true, blockers: [] });
	const blocked = checkEngineeringCleanupEligibility({ blockers: ["unresolved"] }, { status: "invalid" }, { engineeringReady: false, contextReady: false });
	assert.equal(blocked.eligible, false);
	assert.deepEqual(blocked.blockers, ["Canonical configuration is invalid.", "Engineering adapters are not verified.", "Shared context is not verified.", "unresolved"]);
});
