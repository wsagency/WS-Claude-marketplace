import assert from "node:assert/strict";
import test from "node:test";
import {
	acceptPartial,
	apply,
	plan,
	resume,
	createReconfigurePlan,
	applyConfirmedPlan,
	resumeConfirmedPlan,
} from "./reconfigure.mjs";
import { createMockReconfigureAdapters, RECONFIGURE_NOW_FIXTURE } from "./reconfigure.test-support.mjs";

const BASE_CONFIG = Object.freeze({
	schema_version: 1,
	runtime: Object.freeze({ session_discipline: "required", dangerous_git_guard: "enabled" }),
});

const LOCAL_JIRA_SYNC_CONFIG = Object.freeze({
	schema_version: 1,
	tracker: Object.freeze({ primary: "local", pull_requests: "ignore" }),
	jira: Object.freeze({ project: "WS", default_issue_type: "Task", sync: "all_local_tickets" }),
});

const FULL_CONFIG = Object.freeze({
	schema_version: 1,
	tracker: Object.freeze({ primary: "local", pull_requests: "ignore" }),
	changelog: Object.freeze({ update_mode: "pull_request", path: "CHANGELOG.md", skip_types: ["docs", "chore"] }),
	runtime: Object.freeze({ session_discipline: "required", dangerous_git_guard: "enabled" }),
	jira: Object.freeze({ project: "WS", default_issue_type: "Task", sync: "all_local_tickets" }),
	docs: Object.freeze({
		user_track: "docs",
		dev_track: "dev-docs",
		default_audience: "ask",
		default_scope: "repo",
		adr_for_arch_changes: true,
	}),
});

const PARTIAL_DOCS_CONFIG = Object.freeze({
	schema_version: 1,
	docs: Object.freeze({
		user_track: "docs",
		dev_track: "dev-docs",
		default_audience: "ask",
		default_scope: "repo",
		adr_for_arch_changes: true,
	}),
});

const HUB_SNAPSHOT = Object.freeze({
	shape: "hub_root",
	entries: {},
	repositories: [
		{ id: "hub", type: "hub", present: true },
		{ id: "repo-1", type: "working", present: true },
		{ id: "absent", type: "working", present: false },
		{ id: "input-data", type: "input", present: true },
		{ id: "explained", type: "output", present: true },
	],
});

function runtimeChoices(overrides = {}) {
	return {
		domains: ["runtime"],
		fields: ["runtime.dangerous_git_guard"],
		values: { "runtime.dangerous_git_guard": "disabled" },
		...overrides,
	};
}


function phasedMachine() {
	return {
		sessionDisciplineDelivered: false,
		sessionDisciplineFingerprint: "session-v1",
		sharedGuardsOwnedBy: ["repo"],
		sharedGuardExactGenerated: true,
		sharedGuardFingerprint: "guard-v1",
	};
}

function phasedChoices() {
	return runtimeChoices({
		fields: ["runtime.session_discipline", "runtime.dangerous_git_guard"],
		values: { "runtime.session_discipline": "required", "runtime.dangerous_git_guard": "disabled" },
		authorizeOwnedCleanup: true,
	});
}

const PHASED_SNAPSHOT = {
	shape: "standalone",
	repositoryId: "repo",
	entries: {
		"config:runtime.session_discipline": { fingerprint: "config-v1" },
		"config:runtime.dangerous_git_guard": { fingerprint: "config-v1" },
		"managed:AGENTS.md": { fingerprint: "agents-v1" },
	},
};

test("strict-valid v1 baseline gates route missing, legacy, older, future, and malformed state", () => {
	const snapshot = { shape: "standalone", entries: {} };
	const choices = runtimeChoices();
	assert.throws(() => plan(null, snapshot, {}, choices), error => error.code === "ERR_MISSING_CONFIG" && /ordinary \/ws-setup/.test(error.message));
	assert.throws(() => plan({ schema: "legacy" }, snapshot, {}, choices), error => error.code === "ERR_LEGACY_CONFIG" && /migration/.test(error.message));
	assert.throws(() => plan({ schema_version: 0 }, snapshot, {}, choices), error => error.code === "ERR_OLDER_SCHEMA");
	assert.throws(() => plan({ schema_version: 2 }, snapshot, {}, choices), error => error.code === "ERR_FUTURE_SCHEMA" && /Update/.test(error.message));
	assert.throws(() => plan({ schema_version: 1, runtime: { dangerous_git_guard: "enabled" } }, snapshot, {}, choices), error => error.code === "ERR_MALFORMED_CONFIG");
});

test("proposed canonical state rejects invalid cross-field tracker and Jira combinations", () => {
	assert.throws(
		() => plan(LOCAL_JIRA_SYNC_CONFIG, { shape: "standalone", entries: {} }, {}, {
			domains: ["tracker"],
			fields: ["tracker.primary"],
			values: { "tracker.primary": "jira" },
		}),
		error => error.code === "ERR_INVALID_PROPOSED_CONFIG" && /synchronization disabled/.test(error.message),
	);
	assert.throws(
		() => plan({
			...LOCAL_JIRA_SYNC_CONFIG,
			tracker: { primary: "github", pull_requests: "ignore" },
			jira: { ...LOCAL_JIRA_SYNC_CONFIG.jira, sync: "disabled" },
		}, { shape: "standalone", entries: {} }, {}, {
			domains: ["tracker"],
			fields: ["jira.sync"],
			values: { "jira.sync": "all_local_tickets" },
		}),
		error => error.code === "ERR_INVALID_PROPOSED_CONFIG" && /Local primary/.test(error.message),
	);
});

test("valid simultaneous cross-field repair and valid partial no-op remain plannable", () => {
	const repaired = plan(LOCAL_JIRA_SYNC_CONFIG, { shape: "standalone", entries: {} }, {}, {
		domains: ["tracker"],
		fields: ["tracker.primary", "jira.sync"],
		values: { "tracker.primary": "jira", "jira.sync": "disabled" },
	});
	assert.equal(repaired.requiresConfirmation, true);
	const partial = plan(PARTIAL_DOCS_CONFIG, { shape: "standalone", entries: {} }, {}, {
		domains: ["documentation"],
		fields: ["docs.default_audience"],
		values: { "docs.default_audience": "ask" },
	});
	assert.equal(partial.requiresConfirmation, false);
});

test("standalone and hub sub-repository stay current while hub root defaults to eligible hub alone", () => {
	const choices = runtimeChoices();
	assert.deepEqual(plan(BASE_CONFIG, { shape: "standalone", repositoryId: "repo-1" }, {}, choices).scope, ["repo-1"]);
	assert.deepEqual(plan(BASE_CONFIG, { shape: "hub_subrepository", repositoryId: "repo-2" }, {}, choices).scope, ["repo-2"]);
	assert.deepEqual(plan(BASE_CONFIG, HUB_SNAPSHOT, {}, choices).scope, ["hub"]);
	const qualifiedSnapshot = {
		...HUB_SNAPSHOT,
		repositoryStates: { hub: { entries: {} }, "repo-1": { entries: {} } },
	};
	assert.deepEqual(
		plan(
			{ hub: BASE_CONFIG, "repo-1": BASE_CONFIG },
			qualifiedSnapshot,
			{},
			runtimeChoices({ repositories: ["hub", "repo-1", "repo-1"] }),
		).scope,
		["hub", "repo-1"],
	);
	assert.throws(
		() => plan(BASE_CONFIG, HUB_SNAPSHOT, {}, runtimeChoices({ repositories: ["hub", "repo-1"] })),
		error => ["ERR_UNQUALIFIED_REPOSITORY_STATE", "ERR_MISSING_CONFIG"].includes(error.code),
	);
});

test("hub scope rejects unknown, input, output, absent, and undiscovered repository targets before effects", () => {
	for (const repository of ["unknown", "input-data", "explained", "absent"]) {
		assert.throws(
			() => plan(BASE_CONFIG, HUB_SNAPSHOT, {}, runtimeChoices({ repositories: [repository] })),
			error => error.code === "ERR_INELIGIBLE_REPOSITORY_SCOPE" && error.message.includes(repository),
		);
	}
	assert.throws(
		() => plan(BASE_CONFIG, { shape: "hub_root", entries: {} }, {}, runtimeChoices()),
		error => error.code === "ERR_INVALID_HUB_SCOPE",
	);
});

test("multi-domain and all selections normalize to the complete three-domain contract", () => {
	const fields = ["tracker.pull_requests", "docs.default_audience", "runtime.dangerous_git_guard"];
	const values = {
		"tracker.pull_requests": "triage",
		"docs.default_audience": "dev",
		"runtime.dangerous_git_guard": "disabled",
	};
	const multi = plan(FULL_CONFIG, { shape: "standalone", repositoryId: "repo", entries: {} }, {}, {
		domains: ["runtime", "tracker", "documentation", "tracker"],
		fields,
		values,
	});
	const all = plan(FULL_CONFIG, { shape: "standalone", repositoryId: "repo", entries: {} }, {}, {
		domains: ["all"],
		fields,
		values,
	});
	assert.deepEqual(multi.domains, ["tracker", "documentation", "runtime"]);
	assert.deepEqual(all.domains, multi.domains);
	assert.equal(all.hash, multi.hash);
	assert.equal(all.choicesHash, multi.choicesHash);
	assert.equal(multi.effects.find(effect => effect.target === "config:jira.sync").classification, "PRESERVE");
	assert.throws(
		() => plan(FULL_CONFIG, { shape: "standalone", entries: {} }, {}, {
			domains: ["runtime"],
			fields: ["docs.default_audience"],
			values: { "docs.default_audience": "dev" },
		}),
		error => error.code === "ERR_FIELD_OUTSIDE_DOMAINS",
	);
	assert.throws(
		() => plan(BASE_CONFIG, { shape: "standalone", entries: {} }, {}, {
			domain: "runtime",
			fields: ["runtime.dangerous_git_guard"],
			values: { "runtime.dangerous_git_guard": "disabled" },
		}),
		error => error.code === "ERR_INVALID_DOMAINS",
	);
});

test("selected fields patch minimally and report every unselected field, artifact, and dependency", () => {
	const result = plan(BASE_CONFIG, PHASED_SNAPSHOT, {}, runtimeChoices());
	assert.equal(result.effects.find(effect => effect.target === "config:runtime.dangerous_git_guard")?.classification, "UPDATE");
	assert.equal(result.effects.find(effect => effect.target === "config:runtime.session_discipline")?.classification, "PRESERVE");
	assert.equal(result.effects.find(effect => effect.target === "managed:AGENTS.md")?.classification, "PRESERVE");
	assert.deepEqual(result.dependencyClosure.map(item => item.field), ["runtime.session_discipline"]);
	assert.equal(result.dependencyClosure[0].resolution, "retained-compatible");
	assert.equal(result.requiresConfirmation, true);
});

test("invalid concrete selection and cancelled dependency closure leave the proposal unapplied", () => {
	assert.throws(() => plan(BASE_CONFIG, { shape: "standalone" }, {}, runtimeChoices({ fields: ["tracker.primary"] })), error => error.code === "ERR_FIELD_OUTSIDE_DOMAINS");
	assert.throws(() => plan(BASE_CONFIG, { shape: "standalone" }, {}, runtimeChoices({ values: {} })), error => error.code === "ERR_MISSING_PROPOSED_VALUE");
	assert.throws(() => plan(BASE_CONFIG, { shape: "standalone" }, {}, runtimeChoices({ cancelDependent: true })), error => error.code === "ERR_DEPENDENT_CANCELLED");
});

test("shared runtime protection is preserved unless cleanup is exact, repository-owned, and authorized", () => {
	const shared = plan(BASE_CONFIG, { shape: "standalone", repositoryId: "repo" }, {
		sharedGuardsOwnedBy: ["repo", "other"], sharedGuardExactGenerated: true, sharedGuardFingerprint: "guard-v1",
	}, runtimeChoices({ authorizeOwnedCleanup: true }));
	assert.equal(shared.effects.find(effect => effect.target === "machine:sharedGuard")?.classification, "PRESERVE");

	const unauthorized = plan(BASE_CONFIG, { shape: "standalone", repositoryId: "repo" }, {
		sharedGuardsOwnedBy: ["repo"], sharedGuardExactGenerated: true, sharedGuardFingerprint: "guard-v1",
	}, runtimeChoices());
	assert.equal(unauthorized.effects.find(effect => effect.target === "machine:sharedGuard")?.classification, "PRESERVE");

	const owned = plan(BASE_CONFIG, { shape: "standalone", repositoryId: "repo" }, phasedMachine(), phasedChoices());
	const cleanup = owned.effects.find(effect => effect.target === "machine:sharedGuard");
	assert.equal(cleanup.classification, "DELETE");
	assert.equal(cleanup.phase, "cleanup");
});

test("aligned reconfiguration requires no confirmation and writes no journal or audit", async () => {
	const choices = runtimeChoices({ values: { "runtime.dangerous_git_guard": "enabled" } });
	const result = plan(BASE_CONFIG, { shape: "standalone", repositoryId: "repo-noop" }, {}, choices);
	const adapters = createMockReconfigureAdapters();
	assert.equal(result.requiresConfirmation, false);
	const applied = await apply(BASE_CONFIG, { shape: "standalone", repositoryId: "repo-noop" }, {}, choices, result.hash, result.effects, adapters);
	assert.equal(applied.phase, "done");
	assert.equal(applied.ownershipReport["repo-noop"], "aligned");
	assert.deepEqual(adapters.getHistory(), []);
});

test("journal is secret-free, typed by scope/fingerprints/items/correlation, and blocks a second transaction", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
	const adapters = createMockReconfigureAdapters();
	const interrupted = await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters, { failAtPhase: "prepare" });
	assert.equal(interrupted.success, false);
	const state = adapters.getJournal().state;
	assert.deepEqual(state.scope, ["repo"]);
	assert.deepEqual(state.domains, ["runtime"]);
	assert.deepEqual(Object.keys(state.fingerprints).sort(), ["local", "machine", "remote"]);
	assert.deepEqual(state.operations.map(operation => operation.id), planned.effects.filter(effect => ["CREATE", "UPDATE", "DELETE"].includes(effect.classification)).map(effect => effect.id));
	assert.ok(Array.isArray(state.correlationTokens));
	assert.doesNotMatch(JSON.stringify(state), /"(before|after|diff|payload|content|value|token|password|secret)"\s*:/i);
	await assert.rejects(() => apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters), error => error.code === "ERR_JOURNAL_EXISTS");
});

test("local and machine drift stop in prepare before the first mutation without rollback", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
	const local = createMockReconfigureAdapters({ revalidateLocalFingerprints: async () => false });
	const localFailure = await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, local);
	assert.equal(localFailure.success, false);
	assert.equal(localFailure.phase, "prepare");
	assert.deepEqual(local.getApplied(), []);
	assert.match(localFailure.report, /No rollback/);

	const machineDrift = createMockReconfigureAdapters({ revalidateMachineFingerprints: async () => false });
	const machineFailure = await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, machineDrift);
	assert.equal(machineFailure.success, false);
	assert.deepEqual(machineDrift.getApplied(), []);
	assert.match(machineFailure.report, /Machine fingerprint drift/);
});

for (const phase of ["prepare", "cutover", "cleanup"]) {
	test(`interruption in ${phase} persists exact progress and resumes the confirmed remainder`, async () => {
		const choices = phasedChoices();
		const machine = phasedMachine();
		const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
		const adapters = createMockReconfigureAdapters();
		const interrupted = await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters, { failAtPhase: phase });
		assert.equal(interrupted.success, false);
		assert.equal(interrupted.phase, phase);
		assert.ok(adapters.getJournal());
		const completedBeforeResume = [...adapters.getJournal().state.verifiedIds];
		const resumed = await resume(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, adapters);
		assert.equal(resumed.success, true);
		assert.equal(resumed.phase, "done");
		assert.equal(new Set(adapters.getApplied()).size, adapters.getApplied().length);
		assert.ok(completedBeforeResume.every(id => resumed.operationReport.completed.includes(id)));
		assert.equal(adapters.getJournal(), null);
	});
}

test("resume re-verifies an applied effect before any dependent execution", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
	const prepare = planned.effects.find(effect => effect.phase === "prepare" && ["CREATE", "UPDATE", "DELETE"].includes(effect.classification));
	assert.ok(prepare);
	const later = planned.effects.find(effect => effect.phase === "cutover" && ["CREATE", "UPDATE", "DELETE"].includes(effect.classification));
	assert.ok(later);
	const adapters = createMockReconfigureAdapters();

	const interrupted = await apply(
		BASE_CONFIG,
		PHASED_SNAPSHOT,
		machine,
		choices,
		planned.hash,
		planned.effects,
		adapters,
		{ failAfterApplyAtEffectId: prepare.id },
	);
	assert.equal(interrupted.success, false);
	const state = adapters.getJournal().state;
	assert.equal(state.schemaVersion, 3);
	assert.equal(state.planHash, planned.hash);
	assert.deepEqual(state.appliedIds, [prepare.id]);
	assert.deepEqual(state.verifiedIds, []);
	assert.equal(adapters.getHistory().includes(`verify:${prepare.id}`), false);
	assert.equal(adapters.getApplied().includes(later.id), false);

	const resumeHistoryStart = adapters.getHistory().length;
	const resumed = await resume(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, adapters);
	assert.equal(resumed.success, true);
	const resumeHistory = adapters.getHistory().slice(resumeHistoryStart);
	assert.ok(resumeHistory.indexOf(`verify:${prepare.id}`) < resumeHistory.indexOf(`apply:${later.id}`));
	assert.equal(adapters.getApplied().filter(id => id === prepare.id).length, 1);
});

test("verification failure leaves later work pending and prevents cleanup", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
	const failedEffect = planned.effects.find(effect => effect.phase === "cutover" && ["CREATE", "UPDATE", "DELETE"].includes(effect.classification));
	assert.ok(failedEffect);
	const cleanupIds = planned.effects
		.filter(effect => effect.phase === "cleanup" && ["CREATE", "UPDATE", "DELETE"].includes(effect.classification))
		.map(effect => effect.id);
	assert.ok(cleanupIds.length > 0);
	let failVerification = true;
	const adapters = createMockReconfigureAdapters({
		verifyEffect: async effect => !failVerification || effect.id !== failedEffect.id,
	});

	const failed = await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters);
	assert.equal(failed.success, false);
	assert.deepEqual(failed.operationReport.failed, [failedEffect.id]);
	assert.ok(cleanupIds.every(id => failed.operationReport.pending.includes(id)));
	assert.ok(cleanupIds.every(id => !adapters.getApplied().includes(id)));
	assert.ok(adapters.getJournal().state.appliedIds.includes(failedEffect.id));
	assert.equal(adapters.getJournal().state.verifiedIds.includes(failedEffect.id), false);

	failVerification = false;
	const resumeHistoryStart = adapters.getHistory().length;
	const resumed = await resume(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, adapters);
	assert.equal(resumed.success, true);
	const resumeHistory = adapters.getHistory().slice(resumeHistoryStart);
	const firstCleanupApply = resumeHistory.findIndex(item => cleanupIds.some(id => item === `apply:${id}`));
	assert.ok(resumeHistory.indexOf(`verify:${failedEffect.id}`) < firstCleanupApply);
	assert.equal(adapters.getApplied().filter(id => id === failedEffect.id).length, 1);
});

test("returned identities are journaled before a dependent effect runs", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
	const adapters = createMockReconfigureAdapters();
	await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters, { failAtPhase: "cutover" });
	const prepareId = planned.effects.find(effect => effect.phase === "prepare" && effect.classification === "CREATE").id;
	assert.deepEqual(adapters.getJournal().state.returnedIdentities[prepareId], { id: `result:${prepareId}`, version: 1 });
	const journalIndex = adapters.getHistory().findLastIndex(item => item.startsWith("journal:cutover"));
	const cutoverApplyIndex = adapters.getHistory().findIndex(item => item.startsWith("apply:cutover"));
	assert.ok(journalIndex >= 0);
	assert.equal(cutoverApplyIndex, -1);
});

test("reviewed partial acceptance requires valid retained state, forbids completed deletion, and audits before cleanup", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
	const adapters = createMockReconfigureAdapters({ validatePartialState: async () => ({ valid: true, ownershipReport: { repo: "partial" } }) });
	await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters, { failAtPhase: "cleanup" });
	const accepted = await acceptPartial(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, adapters);
	assert.equal(accepted.ownershipReport.repo, "partial");
	assert.equal(adapters.getAudit().acceptedPartial, true);
	assert.equal(adapters.getJournal(), null);
	assert.ok(adapters.getHistory().indexOf("appendAudit") < adapters.getHistory().indexOf("removeJournal"));

	const invalid = createMockReconfigureAdapters({ validatePartialState: async () => ({ valid: false }) });
	await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, invalid, { failAtPhase: "cleanup" });
	await assert.rejects(() => acceptPartial(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, invalid), error => error.code === "ERR_INVALID_PARTIAL_STATE");
});

test("partial acceptance is unavailable before cutover progress", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
	const adapters = createMockReconfigureAdapters();
	await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters, { failAtPhase: "prepare" });
	await assert.rejects(() => acceptPartial(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, adapters), error => error.code === "ERR_NOT_ELIGIBLE_PARTIAL");
});

test("successful transaction verifies every effect and writes durable audit before journal removal", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
	const adapters = createMockReconfigureAdapters();
	const applied = await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters);
	assert.equal(applied.success, true);
	assert.deepEqual(adapters.getVerified(), adapters.getApplied());
	assert.equal(adapters.getAudit().timestamp, RECONFIGURE_NOW_FIXTURE);
	assert.deepEqual(adapters.getAudit().domains, ["runtime"]);
	assert.equal(adapters.getAudit().noRollback, true);
	assert.equal(adapters.getJournal(), null);
	assert.equal(applied.ownershipReport.repo, "owned");
	assert.ok(adapters.getHistory().indexOf("appendAudit") < adapters.getHistory().indexOf("removeJournal"));
});

test("dependent external effects revalidate their preserved local sources immediately before application", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	let localChecks = 0;
	const adapters = createMockReconfigureAdapters({
		revalidateLocalFingerprints: async (expected) => {
			if (Object.keys(expected).some(id => id.startsWith("preserve:"))) {
				localChecks++;
				if (localChecks > 1) return false;
			}
			return true;
		},
	});
	const contribution = {
		effects: [
			{
				id: "preserve:local:source",
				target: "local:source",
				classification: "PRESERVE",
				kind: "state",
				phase: "prepare",
				fingerprint: "old-local",
			},
			{
				id: "remote:effect:1",
				target: "remote:tracker:issue:1",
				classification: "UPDATE",
				kind: "record",
				phase: "cutover",
				dependencies: ["preserve:local:source"],
			}
		]
	};
	const planned = createReconfigurePlan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, contribution);
	const failure = await applyConfirmedPlan(planned, { config: BASE_CONFIG, snapshot: PHASED_SNAPSHOT, machine, choices }, adapters);
	assert.equal(adapters.getApplied().includes("remote:effect:1"), false);
	assert.match(failure.report, /Local drift detected for source/);
});

test("dependent external effects revalidate their preserved remote sources immediately before application", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const contribution = {
		effects: [
			{
				id: "preserve:remote:source",
				target: "remote:tracker:issue:2",
				classification: "PRESERVE",
				kind: "record",
				phase: "prepare",
				remoteFingerprint: "old-remote",
			},
			{
				id: "remote:effect:2",
				target: "remote:tracker:issue:3",
				classification: "UPDATE",
				kind: "record",
				phase: "cutover",
				dependencies: ["preserve:remote:source"],
			}
		]
	};
	const planned = createReconfigurePlan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, contribution);
	const adapters = createMockReconfigureAdapters({
		refetchRemoteFingerprint: async (effect) => {
			if (effect.id === "preserve:remote:source") return "stale";
			return effect.remoteFingerprint ?? effect.fingerprint ?? null;
		}
	});
	const failure = await applyConfirmedPlan(planned, { config: BASE_CONFIG, snapshot: PHASED_SNAPSHOT, machine, choices }, adapters);
	assert.equal(failure.success, false);
	assert.equal(adapters.getApplied().includes("remote:effect:2"), false);
	assert.match(failure.report, /Remote drift detected/);
});

test("two-repository hub plans keep configs, effects, fingerprints, resume state, and audits repository-qualified", async () => {
	const configs = {
		hub: { schema_version: 1, runtime: { session_discipline: "required", dangerous_git_guard: "enabled" } },
		"repo-1": { schema_version: 1, runtime: { session_discipline: "required", dangerous_git_guard: "disabled" } },
	};
	const snapshot = {
		...HUB_SNAPSHOT,
		repositoryStates: {
			hub: { entries: { "config:runtime.dangerous_git_guard": { fingerprint: "hub-config-v1" } } },
			"repo-1": { entries: { "config:runtime.dangerous_git_guard": { fingerprint: "repo-config-v7" } } },
		},
	};
	const choices = runtimeChoices({
		repositories: ["hub", "repo-1"],
		repositoryChoices: {
			hub: { values: { "runtime.dangerous_git_guard": "disabled" } },
			"repo-1": { values: { "runtime.dangerous_git_guard": "enabled" } },
		},
	});
	const planned = plan(configs, snapshot, {}, choices);
	const hubEffect = planned.effects.find(effect => effect.repositoryId === "hub" && effect.target === "config:runtime.dangerous_git_guard");
	const repositoryEffect = planned.effects.find(effect => effect.repositoryId === "repo-1" && effect.target === "config:runtime.dangerous_git_guard");
	assert.match(hubEffect.diff, /"enabled" -> "disabled"/);
	assert.match(repositoryEffect.diff, /"disabled" -> "enabled"/);
	assert.notEqual(planned.repositoryConfigs.hub.configDigest, planned.repositoryConfigs["repo-1"].configDigest);
	assert.deepEqual(planned.fingerprintsByRepository.hub.local[hubEffect.id], "hub-config-v1");
	assert.deepEqual(planned.fingerprintsByRepository["repo-1"].local[repositoryEffect.id], "repo-config-v7");

	const adapters = createMockReconfigureAdapters();
	const interrupted = await apply(configs, snapshot, {}, choices, planned.hash, planned.effects, adapters, { failAtPhase: "cutover" });
	assert.equal(interrupted.success, false);
	assert.deepEqual(Object.keys(adapters.getJournal().state.repositoryConfigs).sort(), ["hub", "repo-1"]);
	const resumed = await resume(configs, snapshot, {}, choices, adapters);
	assert.equal(resumed.success, true);
	assert.ok(adapters.getAudit().repositories.hub.completed.includes(hubEffect.id));
	assert.ok(adapters.getAudit().repositories["repo-1"].completed.includes(repositoryEffect.id));
	assert.equal(resumed.ownershipReport.hub, "owned");
	assert.equal(resumed.ownershipReport["repo-1"], "owned");
});

test("absent Jira sections and optional leaves are selectable only through a complete valid proposal", () => {
	const config = {
		schema_version: 1,
		tracker: { primary: "local", pull_requests: "ignore" },
	};
	const snapshot = { shape: "standalone", repositoryId: "repo", entries: {} };
	const choices = {
		domains: ["tracker"],
		fields: ["jira.project", "jira.default_issue_type", "jira.sync"],
		values: {
			"jira.project": "WS",
			"jira.default_issue_type": "Task",
			"jira.sync": "disabled",
		},
	};
	const enabled = plan(config, snapshot, {}, choices);
	assert.ok(choices.fields.every(field => enabled.effects.some(effect => effect.target === `config:${field}` && effect.classification === "UPDATE")));
	assert.throws(
		() => plan(config, snapshot, {}, {
			...choices,
			fields: ["jira.project"],
			values: { "jira.project": "WS" },
		}),
		error => error.code === "ERR_INCOMPLETE_SECTION_ENABLEMENT",
	);
	const withJira = {
		...config,
		jira: { project: "WS", default_issue_type: "Task", sync: "disabled" },
	};
	const optionalLeaf = plan(withJira, snapshot, {}, {
		domains: ["tracker"],
		fields: ["jira.board"],
		values: { "jira.board": 42 },
	});
	assert.equal(optionalLeaf.effects.find(effect => effect.target === "config:jira.board").classification, "UPDATE");
});

test("local drift introduced between phases stops immediately before the next local mutation", async () => {
	const choices = runtimeChoices({ values: { "runtime.dangerous_git_guard": "enabled" } });
	const contribution = {
		effects: [
			{
				id: "prepare:local:first",
				target: "local:first",
				kind: "state",
				classification: "CREATE",
				phase: "prepare",
				reason: "Prepare local state.",
				diff: "created",
				fingerprint: null,
			},
			{
				id: "cutover:local:second",
				target: "local:second",
				kind: "state",
				classification: "UPDATE",
				phase: "cutover",
				reason: "Cut over local state.",
				diff: "updated",
				fingerprint: "second-v1",
				dependencies: ["prepare:local:first"],
			},
		],
	};
	const planned = createReconfigurePlan(BASE_CONFIG, PHASED_SNAPSHOT, {}, choices, contribution);
	const adapters = createMockReconfigureAdapters({
		revalidateLocalFingerprints: async (_expected, _plan, effect) => !effect || effect.id !== "cutover:local:second",
	});
	const result = await applyConfirmedPlan(planned, {}, adapters);
	assert.equal(result.success, false);
	assert.ok(adapters.getApplied().includes("prepare:local:first"));
	assert.equal(adapters.getApplied().includes("cutover:local:second"), false);
	assert.match(result.report, /Local fingerprint drift/);
});

test("fresh post-failure discovery resumes the persisted authorized remainder", async () => {
	const choices = phasedChoices();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, phasedMachine(), choices);
	const adapters = createMockReconfigureAdapters();
	const interrupted = await apply(
		BASE_CONFIG,
		PHASED_SNAPSHOT,
		phasedMachine(),
		choices,
		planned.hash,
		planned.effects,
		adapters,
		{ failAtPhase: "cleanup" },
	);
	assert.equal(interrupted.success, false);
	const freshConfig = {
		schema_version: 1,
		runtime: { session_discipline: "required", dangerous_git_guard: "disabled" },
	};
	const freshSnapshot = {
		...PHASED_SNAPSHOT,
		entries: {
			...PHASED_SNAPSHOT.entries,
			"config:runtime.dangerous_git_guard": { fingerprint: "config-v2" },
		},
	};
	const freshMachine = { ...phasedMachine(), sessionDisciplineDelivered: true };
	const resumed = await resume(freshConfig, freshSnapshot, freshMachine, choices, adapters);
	assert.equal(resumed.success, true);
	assert.equal(resumed.hash, planned.hash);
	assert.equal(adapters.getAudit().planHash, planned.hash);
});

test("an unjournaled remote create is recovered by correlation before retry", async () => {
	const choices = runtimeChoices({ values: { "runtime.dangerous_git_guard": "enabled" } });
	const remoteEffect = {
		id: "prepare:remote:copy",
		target: "remote:jira:copy:1",
		kind: "state",
		classification: "CREATE",
		phase: "prepare",
		reason: "Create a correlated copy.",
		diff: "created",
		fingerprint: null,
		remoteFingerprint: null,
		correlationToken: "correlation-1",
		payload: { operation: "create_copy", external: true, correlationToken: "correlation-1" },
	};
	const planned = createReconfigurePlan(BASE_CONFIG, PHASED_SNAPSHOT, {}, choices, { effects: [remoteEffect] });
	let remoteCreates = 0;
	let recoveries = 0;
	const adapters = createMockReconfigureAdapters({
		applyEffect: async effect => {
			if (effect.id === remoteEffect.id) remoteCreates++;
			return { identity: { id: "WS-101", version: 3, hash: "copy-hash" } };
		},
		recoverRemoteResultByCorrelation: async token => {
			recoveries++;
			assert.equal(token, "correlation-1");
			return { identity: { id: "WS-101", version: 3, hash: "copy-hash" } };
		},
	});
	const interrupted = await applyConfirmedPlan(planned, {}, adapters, { failAfterApplyBeforeJournalAtEffectId: remoteEffect.id });
	assert.equal(interrupted.success, false);
	assert.equal(remoteCreates, 1);
	assert.equal(adapters.getJournal().state.appliedIds.includes(remoteEffect.id), false);
	const resumed = await resumeConfirmedPlan(planned, {}, adapters);
	assert.equal(resumed.success, true);
	assert.equal(remoteCreates, 1);
	assert.equal(recoveries, 1);
	assert.equal(adapters.getAudit().repositories.repo.verifiedResults[remoteEffect.id].identity.id, "WS-101");
});
