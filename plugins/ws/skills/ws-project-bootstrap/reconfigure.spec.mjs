import assert from "node:assert/strict";
import test from "node:test";
import { acceptPartial, apply, plan, resume } from "./reconfigure.mjs";

const NOW_FIXTURE = 1_693_612_800_000;
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

function mockAdapters(overrides = {}) {
	let journal = null;
	let audit = null;
	const applied = [];
	const verified = [];
	const history = [];
	return {
		writeJournal: async (hash, state) => {
			journal = { hash, state };
			history.push(`journal:${state.phase}:${state.status}`);
		},
		readJournal: async () => journal,
		removeJournal: async () => {
			journal = null;
			history.push("removeJournal");
		},
		appendAudit: async record => {
			audit = record;
			history.push("appendAudit");
		},
		applyEffect: async effect => {
			applied.push(effect.id);
			history.push(`apply:${effect.id}`);
			return { identity: { id: `result:${effect.id}`, version: 1 } };
		},
		verifyEffect: async effect => {
			verified.push(effect.id);
			history.push(`verify:${effect.id}`);
			return true;
		},
		revalidateLocalFingerprints: async () => true,
		revalidateMachineFingerprints: async () => true,
		refetchRemoteFingerprint: async effect => effect.remoteFingerprint ?? effect.fingerprint ?? null,
		verifyCutover: async () => true,
		verifyCompletion: async () => true,
		validatePartialState: async () => ({ valid: true, ownershipReport: { repo: "partial" } }),
		now: () => NOW_FIXTURE,
		getJournal: () => journal,
		getAudit: () => audit,
		getApplied: () => applied,
		getVerified: () => verified,
		getHistory: () => history,
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
	assert.deepEqual(plan(BASE_CONFIG, HUB_SNAPSHOT, {}, runtimeChoices({ repositories: ["hub", "repo-1", "repo-1"] })).scope, ["hub", "repo-1"]);
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
	const adapters = mockAdapters();
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
	const adapters = mockAdapters();
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
	const local = mockAdapters({ revalidateLocalFingerprints: async () => false });
	const localFailure = await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, local);
	assert.equal(localFailure.success, false);
	assert.equal(localFailure.phase, "prepare");
	assert.deepEqual(local.getApplied(), []);
	assert.match(localFailure.report, /No rollback/);

	const machineDrift = mockAdapters({ revalidateMachineFingerprints: async () => false });
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
		const adapters = mockAdapters();
		const interrupted = await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters, { failAtPhase: phase });
		assert.equal(interrupted.success, false);
		assert.equal(interrupted.phase, phase);
		assert.ok(adapters.getJournal());
		const completedBeforeResume = [...adapters.getJournal().state.completedIds];
		const resumed = await resume(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, adapters);
		assert.equal(resumed.success, true);
		assert.equal(resumed.phase, "done");
		assert.equal(new Set(adapters.getApplied()).size, adapters.getApplied().length);
		assert.ok(completedBeforeResume.every(id => resumed.operationReport.completed.includes(id)));
		assert.equal(adapters.getJournal(), null);
	});
}

test("returned identities are journaled before a dependent effect runs", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
	const adapters = mockAdapters();
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
	const adapters = mockAdapters({ validatePartialState: async () => ({ valid: true, ownershipReport: { repo: "partial" } }) });
	await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters, { failAtPhase: "cleanup" });
	const accepted = await acceptPartial(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, adapters);
	assert.equal(accepted.ownershipReport.repo, "partial");
	assert.equal(adapters.getAudit().acceptedPartial, true);
	assert.equal(adapters.getJournal(), null);
	assert.ok(adapters.getHistory().indexOf("appendAudit") < adapters.getHistory().indexOf("removeJournal"));

	const invalid = mockAdapters({ validatePartialState: async () => ({ valid: false }) });
	await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, invalid, { failAtPhase: "cleanup" });
	await assert.rejects(() => acceptPartial(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, invalid), error => error.code === "ERR_INVALID_PARTIAL_STATE");
});

test("partial acceptance is unavailable before cutover progress", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
	const adapters = mockAdapters();
	await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters, { failAtPhase: "prepare" });
	await assert.rejects(() => acceptPartial(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, adapters), error => error.code === "ERR_NOT_ELIGIBLE_PARTIAL");
});

test("successful transaction verifies every effect and writes durable audit before journal removal", async () => {
	const choices = phasedChoices();
	const machine = phasedMachine();
	const planned = plan(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices);
	const adapters = mockAdapters();
	const applied = await apply(BASE_CONFIG, PHASED_SNAPSHOT, machine, choices, planned.hash, planned.effects, adapters);
	assert.equal(applied.success, true);
	assert.deepEqual(adapters.getVerified(), adapters.getApplied());
	assert.equal(adapters.getAudit().timestamp, NOW_FIXTURE);
	assert.deepEqual(adapters.getAudit().domains, ["runtime"]);
	assert.equal(adapters.getAudit().noRollback, true);
	assert.equal(adapters.getJournal(), null);
	assert.equal(applied.ownershipReport.repo, "owned");
	assert.ok(adapters.getHistory().indexOf("appendAudit") < adapters.getHistory().indexOf("removeJournal"));
});
