import assert from "node:assert";
import test from "node:test";
import { acceptPartial, apply, plan, resume } from "./reconfigure.mjs";

const NOW_FIXTURE = 1_693_612_800_000;
const BASE_CONFIG = Object.freeze({
	schema_version: 1,
	runtime: Object.freeze({
		session_discipline: "required",
		dangerous_git_guard: "enabled",
	}),
});

function runtimeChoices(overrides = {}) {
	return {
		domain: "runtime",
		fields: ["runtime.dangerous_git_guard"],
		values: { "runtime.dangerous_git_guard": "disabled" },
		...overrides,
	};
}

function mockAdapters(overrides = {}) {
	let journal = null;
	let audit = null;
	let appliedEffects = 0;
	const history = [];
	return {
		writeJournal: async (hash, state) => {
			journal = { hash, state };
			history.push("writeJournal");
		},
		readJournal: async () => journal,
		removeJournal: async () => {
			journal = null;
			history.push("removeJournal");
		},
		writeAudit: async record => {
			audit = record;
			history.push("writeAudit");
		},
		applyEffect: async () => {
			appliedEffects += 1;
			history.push("applyEffect");
		},
		revalidateFingerprints: async () => true,
		now: () => NOW_FIXTURE,
		getJournal: () => journal,
		getAudit: () => audit,
		getAppliedEffects: () => appliedEffects,
		getHistory: () => history,
		...overrides,
	};
}

test("reconfigure gates missing, legacy, older, future, and malformed canonical state", () => {
	const snapshot = { shape: "standalone", entries: {} };
	const choices = runtimeChoices();

	assert.throws(() => plan(null, snapshot, {}, choices), error => error.code === "ERR_MISSING_CONFIG");
	assert.throws(() => plan({ schema: "legacy" }, snapshot, {}, choices), error => error.code === "ERR_LEGACY_CONFIG");
	assert.throws(() => plan({ schema_version: 0 }, snapshot, {}, choices), error => error.code === "ERR_OLDER_SCHEMA");
	assert.throws(() => plan({ schema_version: 2 }, snapshot, {}, choices), error => error.code === "ERR_FUTURE_SCHEMA");
	assert.throws(
		() => plan({ schema_version: 1, runtime: { dangerous_git_guard: "enabled" } }, snapshot, {}, choices),
		error => error.code === "ERR_MALFORMED_CONFIG",
	);
});

test("standalone and hub-sub-repository scopes stay current while hub roots require explicit selection", () => {
	const choices = runtimeChoices();
	assert.deepEqual(plan(BASE_CONFIG, { shape: "standalone", repositoryId: "repo-1" }, {}, choices).scope, ["repo-1"]);
	assert.deepEqual(plan(BASE_CONFIG, { shape: "hub_subrepository", repositoryId: "repo-2" }, {}, choices).scope, ["repo-2"]);
	assert.throws(
		() => plan(BASE_CONFIG, { shape: "hub_root" }, {}, choices),
		error => error.code === "ERR_MISSING_REPO_SELECTION",
	);
	assert.deepEqual(
		plan(BASE_CONFIG, { shape: "hub_root" }, {}, runtimeChoices({ repositories: ["hub", "repo-1", "repo-1"] })).scope,
		["hub", "repo-1"],
	);
});

test("selected canonical fields update while unselected fields and artifacts are preserved", () => {
	const result = plan(
		BASE_CONFIG,
		{ shape: "standalone", entries: { "managed:AGENTS.md": { fingerprint: "agents-v1" } } },
		{},
		runtimeChoices(),
	);

	assert.equal(result.effects.find(effect => effect.target === "config:runtime.dangerous_git_guard")?.classification, "UPDATE");
	assert.equal(result.effects.find(effect => effect.target === "config:runtime.session_discipline")?.classification, "PRESERVE");
	assert.equal(result.effects.find(effect => effect.target === "managed:AGENTS.md")?.classification, "PRESERVE");
	assert.deepEqual(result.dependencyClosure, ["runtime.session_discipline"]);
	assert.equal(result.requiresConfirmation, true);
});

test("field selection is strict and cancelling required dependency closure cancels the proposal", () => {
	assert.throws(
		() => plan(BASE_CONFIG, { shape: "standalone" }, {}, runtimeChoices({ fields: ["tracker.primary"] })),
		error => error.code === "ERR_FIELD_OUTSIDE_DOMAIN",
	);
	assert.throws(
		() => plan(BASE_CONFIG, { shape: "standalone" }, {}, runtimeChoices({ values: {} })),
		error => error.code === "ERR_MISSING_PROPOSED_VALUE",
	);
	assert.throws(
		() => plan(BASE_CONFIG, { shape: "standalone" }, {}, runtimeChoices({ cancelDependent: true })),
		error => error.code === "ERR_DEPENDENT_CANCELLED",
	);
});

test("shared runtime protection is preserved and exact repository-owned delivery may be cleaned", () => {
	const shared = plan(
		BASE_CONFIG,
		{ shape: "standalone", repositoryId: "repo-a" },
		{ sharedGuardsOwnedBy: ["repo-a", "repo-b"] },
		runtimeChoices(),
	);
	assert.equal(shared.effects.find(effect => effect.target === "machine:sharedGuard")?.classification, "PRESERVE");

	const owned = plan(
		BASE_CONFIG,
		{ shape: "standalone", repositoryId: "repo-a" },
		{ sharedGuardsOwnedBy: ["repo-a"] },
		runtimeChoices(),
	);
	assert.equal(owned.effects.find(effect => effect.target === "machine:sharedGuard")?.classification, "UPDATE");
});

test("aligned reconfiguration requires no confirmation and writes nothing", async () => {
	const choices = runtimeChoices({
		values: { "runtime.dangerous_git_guard": "enabled" },
	});
	const result = plan(BASE_CONFIG, { shape: "standalone", repositoryId: "repo-noop" }, {}, choices);
	const adapters = mockAdapters();

	assert.equal(result.requiresConfirmation, false);
	const applied = await apply(BASE_CONFIG, { shape: "standalone", repositoryId: "repo-noop" }, {}, choices, result.hash, result.effects, adapters);
	assert.equal(applied.phase, "done");
	assert.equal(applied.ownershipReport["repo-noop"], "aligned");
	assert.deepEqual(adapters.getHistory(), []);
});

test("apply rejects stale authorization, an active journal, and fingerprint drift before writes", async () => {
	const snapshot = {
		shape: "standalone",
		repositoryId: "repo-1",
		entries: { "config:runtime.dangerous_git_guard": { fingerprint: "config-v1" } },
	};
	const choices = runtimeChoices();
	const result = plan(BASE_CONFIG, snapshot, {}, choices);

	await assert.rejects(
		() => apply(BASE_CONFIG, snapshot, {}, choices, "wrong-hash", result.effects, mockAdapters()),
		error => error.code === "ERR_PLAN_MISMATCH",
	);

	const active = mockAdapters({ readJournal: async () => ({ hash: "active", state: {} }) });
	await assert.rejects(
		() => apply(BASE_CONFIG, snapshot, {}, choices, result.hash, result.effects, active),
		error => error.code === "ERR_JOURNAL_EXISTS",
	);

	const drifted = mockAdapters({ revalidateFingerprints: async () => false });
	const failed = await apply(BASE_CONFIG, snapshot, {}, choices, result.hash, result.effects, drifted);
	assert.equal(failed.success, false);
	assert.equal(failed.phase, "prepare");
	assert.equal(drifted.getAppliedEffects(), 0);
});

test("interrupted cutover stops without rollback, resumes, and permits reviewed partial acceptance", async () => {
	const snapshot = { shape: "standalone", repositoryId: "repo-1", entries: {} };
	const choices = runtimeChoices();
	const machine = { sharedGuardsOwnedBy: ["repo-1"] };
	const result = plan(BASE_CONFIG, snapshot, machine, choices);
	const adapters = mockAdapters();

	const interrupted = await apply(BASE_CONFIG, snapshot, machine, choices, result.hash, result.effects, adapters, { failAtEffectIndex: 1 });
	assert.equal(interrupted.success, false);
	assert.equal(interrupted.phase, "cutover");
	assert.equal(adapters.getAppliedEffects(), 1);
	assert.equal(adapters.getJournal()?.state.completedEffects, 1);
	assert.doesNotMatch(JSON.stringify(adapters.getJournal()), /enabled|disabled|token|password/i);

	const resumed = await resume(BASE_CONFIG, snapshot, machine, choices, adapters, { failAtPhase: "cleanup" });
	assert.equal(resumed.success, false);
	assert.equal(resumed.phase, "cleanup");
	assert.equal(adapters.getAppliedEffects(), 2);

	const accepted = await acceptPartial(BASE_CONFIG, snapshot, machine, choices, adapters);
	assert.equal(accepted.ownershipReport["repo-1"], "partial");
	assert.equal(adapters.getAudit()?.acceptedPartial, true);
	assert.equal(adapters.getJournal(), null);
	assert.ok(adapters.getHistory().indexOf("writeAudit") < adapters.getHistory().indexOf("removeJournal"));
});

test("partial acceptance is unavailable before any cutover operation completes", async () => {
	const snapshot = { shape: "standalone", entries: {} };
	const choices = runtimeChoices();
	const result = plan(BASE_CONFIG, snapshot, {}, choices);
	const adapters = mockAdapters();

	await apply(BASE_CONFIG, snapshot, {}, choices, result.hash, result.effects, adapters, { failAtPhase: "prepare" });
	await assert.rejects(
		() => acceptPartial(BASE_CONFIG, snapshot, {}, choices, adapters),
		error => error.code === "ERR_NOT_ELIGIBLE_PARTIAL",
	);
});

test("successful cutover audits before journal removal and reports owned state", async () => {
	const snapshot = { shape: "standalone", repositoryId: "repo-happy", entries: {} };
	const choices = runtimeChoices();
	const machine = { sharedGuardsOwnedBy: ["repo-happy"] };
	const result = plan(BASE_CONFIG, snapshot, machine, choices);
	const adapters = mockAdapters();

	const applied = await apply(BASE_CONFIG, snapshot, machine, choices, result.hash, result.effects, adapters);

	assert.equal(applied.success, true);
	assert.equal(applied.phase, "done");
	assert.equal(adapters.getAppliedEffects(), 2);
	assert.equal(adapters.getAudit()?.completed, 2);
	assert.equal(adapters.getAudit()?.timestamp, NOW_FIXTURE);
	assert.equal(adapters.getJournal(), null);
	assert.equal(applied.ownershipReport["repo-happy"], "owned");
	assert.ok(adapters.getHistory().indexOf("writeAudit") < adapters.getHistory().indexOf("removeJournal"));
});
