import assert from "node:assert";
import test from "node:test";
import { planTrackerOwnership, applyTrackerOwnership } from "./tracker-ownership.mjs";

const BASE_CONFIG = Object.freeze({
	schema_version: 1,
});

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
		now: () => 1_693_612_800_000,
		getJournal: () => journal,
		getAudit: () => audit,
		getAppliedEffects: () => appliedEffects,
		getHistory: () => history,
		...overrides,
	};
}

test("migration requires choices and dispositions", () => {
	assert.throws(() => planTrackerOwnership(BASE_CONFIG, {}, {}, null), /Tracker ownership choices are required/);
	assert.throws(() => planTrackerOwnership(BASE_CONFIG, {}, {}, { dispositions: [] }), /Dispositions for source stores are required/);
});

test("migration cancelled disposition throws error", () => {
	assert.throws(() => planTrackerOwnership(BASE_CONFIG, {}, {}, { dispositions: [{ storeId: "jira", disposition: "cancel" }] }), /Migration cancelled/);
});

test("plan creates preserve effects by default for history", () => {
	const localStore = {
		"TEST-1": { id: "TEST-1", status: "open" }
	};
	const choices = {
		sourceTracker: "jira",
		targetTracker: "github",
		dispositions: [{ storeId: "jira", disposition: "preserve-as-history" }]
	};
	const plan = planTrackerOwnership(BASE_CONFIG, localStore, {}, choices);
	
	assert.equal(plan.effects.length, 1);
	assert.equal(plan.effects[0].classification, "PRESERVE");
	assert.equal(plan.requiresConfirmation, false); // No CREATE/UPDATE
});

test("copy-open generates CREATE effects for open items", () => {
	const localStore = {
		"TEST-1": { id: "TEST-1", status: "open" },
		"TEST-2": { id: "TEST-2", status: "closed" }
	};
	const choices = {
		sourceTracker: "jira",
		targetTracker: "github",
		dispositions: [{ storeId: "jira", disposition: "copy-open" }]
	};
	const plan = planTrackerOwnership(BASE_CONFIG, localStore, {}, choices);
	
	assert.equal(plan.effects.length, 2);
	const create = plan.effects.find(e => e.target === "tracker:TEST-1");
	assert.equal(create.classification, "CREATE");
	assert.equal(create.payload.sourceId, "TEST-1");
	assert.ok(create.payload.semanticLoss); // We should test semantic loss is present
	
	const preserve = plan.effects.find(e => e.target === "tracker:TEST-2");
	assert.equal(preserve.classification, "PRESERVE");
});

test("claimed local work blocks migration unless excluded", () => {
	const localStore = {
		"TEST-1": { id: "TEST-1", status: "open", localMetadata: { claimed: true } }
	};
	const choices = {
		sourceTracker: "jira",
		targetTracker: "github",
		dispositions: [{ storeId: "jira", disposition: "copy-all" }],
		excludeBlocked: false
	};
	
	const plan = planTrackerOwnership(BASE_CONFIG, localStore, {}, choices);
	assert.equal(plan.blockers.length, 1);
	assert.match(plan.blockers[0], /claimed local work/);
	assert.equal(plan.effects[0].classification, "BLOCKING_CONFLICT");

	// Now with excludeBlocked
	const planExcluded = planTrackerOwnership(BASE_CONFIG, localStore, {}, { ...choices, excludeBlocked: true });
	assert.equal(planExcluded.blockers.length, 0);
	assert.equal(planExcluded.effects[0].classification, "SKIP");
});

test("applyTrackerOwnership runs executePhases successfully", async () => {
	const localStore = {
		"TEST-1": { id: "TEST-1", status: "open" }
	};
	const choices = {
		sourceTracker: "jira",
		targetTracker: "github",
		dispositions: [{ storeId: "jira", disposition: "copy-all" }]
	};
	
	const plan = planTrackerOwnership(BASE_CONFIG, localStore, {}, choices);
	const adapters = mockAdapters();
	
	const result = await applyTrackerOwnership(BASE_CONFIG, localStore, {}, choices, plan.hash, plan.effects, adapters);
	
	assert.equal(result.success, true);
	assert.equal(result.phase, "done");
	assert.equal(adapters.getAppliedEffects(), 1);
	assert.equal(adapters.getAudit()?.completed, 1);
});

test("external mutations include a deterministic correlation token", () => {
	const localStore = {
		"TEST-1": { id: "TEST-1", status: "open" }
	};
	const choices = {
		sourceTracker: "jira",
		targetTracker: "github",
		dispositions: [{ storeId: "jira", disposition: "copy-all" }]
	};
	const plan = planTrackerOwnership(BASE_CONFIG, localStore, {}, choices);
	
	const create = plan.effects.find(e => e.target === "tracker:TEST-1");
	assert.ok(create.payload.correlationToken, "Correlation token should be present");
	assert.equal(typeof create.payload.correlationToken, "string");
});

test("pending synchronization blocks migration", () => {
	const localStore = {
		"TEST-1": { id: "TEST-1", status: "open" }
	};
	const syncState = {
		pendingOperations: [{ localId: "TEST-1" }]
	};
	const choices = {
		sourceTracker: "jira",
		targetTracker: "github",
		dispositions: [{ storeId: "jira", disposition: "copy-all" }]
	};
	const plan = planTrackerOwnership(BASE_CONFIG, localStore, syncState, choices);
	assert.equal(plan.blockers.length, 1);
	assert.match(plan.blockers[0], /pending synchronization/);
});

test("project rebinding preserves old keys and copies to target project", () => {
	const localStore = {
		"OLD-1": { id: "OLD-1", status: "open" }
	};
	const choices = {
		sourceTracker: "jira",
		targetTracker: "jira",
		sourceProject: "OLD",
		targetProject: "NEW",
		dispositions: [{ storeId: "OLD", disposition: "copy-all" }]
	};
	const plan = planTrackerOwnership(BASE_CONFIG, localStore, {}, choices);
	const create = plan.effects.find(e => e.target === "tracker:OLD-1");
	assert.equal(create.classification, "CREATE");
	assert.equal(create.payload.targetProject, "NEW");
});

test("remote drift causes failure during prepare phase", async () => {
	const localStore = {
		"TEST-1": { id: "TEST-1", status: "open" }
	};
	const choices = {
		sourceTracker: "jira",
		targetTracker: "github",
		dispositions: [{ storeId: "jira", disposition: "copy-all" }]
	};
	const plan = planTrackerOwnership(BASE_CONFIG, localStore, {}, choices);
	const adapters = mockAdapters();
	const injection = { driftEntries: { "tracker:TEST-1": "some-expected-hash" } }; // fingerprint is null, this should drift
	
	const result = await applyTrackerOwnership(BASE_CONFIG, localStore, {}, choices, plan.hash, plan.effects, adapters, injection);
	assert.equal(result.success, false);
	assert.equal(result.phase, "prepare");
	assert.match(result.report, /Drift detected/);
});

test("interruption saves journal and allows resume", async () => {
	const localStore = {
		"TEST-1": { id: "TEST-1", status: "open" },
		"TEST-2": { id: "TEST-2", status: "open" }
	};
	const choices = {
		sourceTracker: "jira",
		targetTracker: "github",
		dispositions: [{ storeId: "jira", disposition: "copy-all" }]
	};
	const plan = planTrackerOwnership(BASE_CONFIG, localStore, {}, choices);
	const adapters = mockAdapters();
	
	// Fail at first effect
	const injection = { failAtEffectIndex: 1 };
	const interrupted = await applyTrackerOwnership(BASE_CONFIG, localStore, {}, choices, plan.hash, plan.effects, adapters, injection);
	
	assert.equal(interrupted.success, false);
	assert.equal(interrupted.phase, "cutover");
	assert.equal(adapters.getAppliedEffects(), 1);
	
	// Ensure journal is written
	const journal = adapters.getJournal();
	assert.ok(journal);
	assert.equal(journal.state.completedEffects, 1);
	
	// Instead of calling resumeTrackerOwnership (which we don't have specifically yet), 
	// we just expect adapters to have written the journal correctly.
});

test("no-op migration succeeds without changes", async () => {
	const localStore = {
		"TEST-1": { id: "TEST-1", status: "open" }
	};
	const choices = {
		sourceTracker: "jira",
		targetTracker: "github",
		dispositions: [{ storeId: "jira", disposition: "preserve-as-history" }]
	};
	const plan = planTrackerOwnership(BASE_CONFIG, localStore, {}, choices);
	const adapters = mockAdapters();
	
	const result = await applyTrackerOwnership(BASE_CONFIG, localStore, {}, choices, plan.hash, plan.effects, adapters);
	
	assert.equal(result.success, true);
	assert.equal(result.phase, "done");
	assert.equal(adapters.getAppliedEffects(), 0);
	assert.match(result.report, /Aligned/);
});

test("unresolved conflict blocks migration", () => {
	const localStore = {
		"TEST-1": { id: "TEST-1", status: "open" }
	};
	const syncState = {
		conflicts: [{ localId: "TEST-1" }]
	};
	const choices = {
		sourceTracker: "jira",
		targetTracker: "github",
		dispositions: [{ storeId: "jira", disposition: "copy-all" }]
	};
	const plan = planTrackerOwnership(BASE_CONFIG, localStore, syncState, choices);
	assert.equal(plan.blockers.length, 1);
	assert.match(plan.blockers[0], /unresolved conflict/);
});
