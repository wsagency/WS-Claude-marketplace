import assert from "node:assert/strict";
import test from "node:test";
import {
	applyTrackerOwnership,
	planTrackerOwnership,
	resumeTrackerOwnership,
} from "./tracker-ownership.mjs";

const BASE_CONFIG = Object.freeze({
	schema_version: 1,
	tracker: Object.freeze({ primary: "local", pull_requests: "ignore" }),
});

function choices(disposition = "copy-all", overrides = {}) {
	return {
		fields: ["tracker.primary"],
		values: { "tracker.primary": "github" },
		sourceTracker: "jira",
		targetTracker: "github",
		sourceStores: ["OLD"],
		dispositions: [{ storeId: "OLD", disposition }],
		...overrides,
	};
}

function ticket(id, overrides = {}) {
	return {
		id,
		storeId: "OLD",
		title: `Ticket ${id}`,
		description: "Authored description",
		acceptanceCriteria: ["Observable result"],
		status: "open",
		comments: ["Authored comment"],
		priority: "high",
		type: "story",
		version: 3,
		updatedAt: "2026-09-01T12:00:00Z",
		url: `https://jira.example.test/browse/${id}`,
		...overrides,
	};
}

function mockAdapters(overrides = {}) {
	let journal = null;
	let audit = null;
	const applied = [];
	const history = [];
	return {
		writeJournal: async (hash, state) => {
			journal = { hash, state };
			history.push(`journal:${state.phase}`);
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
		revalidateLocalFingerprints: async () => true,
		revalidateMachineFingerprints: async () => true,
		refetchRemoteFingerprint: async effect => effect.remoteFingerprint,
		applyEffect: async effect => {
			applied.push(effect.id);
			history.push(`apply:${effect.id}`);
			return effect.payload?.operation === "create_tracker_copy" ? { identity: { key: `NEW-${applied.length}`, version: 1 } } : undefined;
		},
		verifyEffect: async () => true,
		verifyCutover: async () => true,
		verifyCompletion: async () => true,
		validatePartialState: async () => ({ valid: true }),
		now: () => 1_693_612_800_000,
		getJournal: () => journal,
		getAudit: () => audit,
		getApplied: () => applied,
		getHistory: () => history,
		...overrides,
	};
}

test("every existing store requires one explicit supported disposition and cancel leaves ownership unchanged", () => {
	const store = { "OLD-1": ticket("OLD-1"), "SECOND-1": ticket("SECOND-1", { storeId: "SECOND" }) };
	assert.throws(() => planTrackerOwnership(BASE_CONFIG, store, {}, { ...choices(), sourceStores: ["OLD", "SECOND"], dispositions: [{ storeId: "OLD", disposition: "copy-all" }] }), error => error.code === "ERR_MISSING_DISPOSITIONS");
	assert.throws(() => planTrackerOwnership(BASE_CONFIG, store, {}, {
		...choices(),
		dispositions: [
			{ storeId: "OLD", disposition: "cancel" },
			{ storeId: "SECOND", disposition: "preserve-as-history" },
		],
	}), error => error.code === "ERR_MIGRATION_CANCELLED");
	assert.throws(() => planTrackerOwnership(BASE_CONFIG, store, {}, {
		...choices(),
		dispositions: [
			{ storeId: "OLD", disposition: "unknown" },
			{ storeId: "SECOND", disposition: "preserve-as-history" },
		],
	}), error => error.code === "ERR_INVALID_DISPOSITION");
});

test("preserve-as-history, copy-selected, copy-open, and copy-all dispositions are deterministic", () => {
	const store = {
		"OLD-1": ticket("OLD-1"),
		"OLD-2": ticket("OLD-2", { status: "done" }),
	};
	const preserved = planTrackerOwnership(BASE_CONFIG, store, {}, choices("preserve-as-history", {
		fields: ["tracker.primary"], values: { "tracker.primary": "local" }, sourceTracker: "local", targetTracker: "local",
	}));
	assert.equal(preserved.effects.filter(effect => effect.classification === "CREATE").length, 0);
	assert.equal(preserved.sourcePreservation.length, 2);

	const selected = planTrackerOwnership(BASE_CONFIG, store, {}, choices("copy-selected", {
		dispositions: [{ storeId: "OLD", disposition: "copy-selected", selectedItemIds: ["OLD-2"] }],
	}));
	assert.deepEqual(selected.effects.filter(effect => effect.payload?.operation === "create_tracker_copy").map(effect => effect.payload.sourceId), ["OLD-2"]);

	const open = planTrackerOwnership(BASE_CONFIG, store, {}, choices("copy-open"));
	assert.deepEqual(open.effects.filter(effect => effect.payload?.operation === "create_tracker_copy").map(effect => effect.payload.sourceId), ["OLD-1"]);

	const all = planTrackerOwnership(BASE_CONFIG, store, {}, choices("copy-all"));
	assert.deepEqual(all.effects.filter(effect => effect.payload?.operation === "create_tracker_copy").map(effect => effect.payload.sourceId), ["OLD-1", "OLD-2"]);
});

test("copies preserve source links, list semantic loss, and never plan source mutation", () => {
	const store = {
		"OLD-1": ticket("OLD-1", { localMetadata: { claimed: false }, customField: "must remain at source" }),
	};
	const planned = planTrackerOwnership(BASE_CONFIG, store, {}, choices());
	const copy = planned.effects.find(effect => effect.payload?.operation === "create_tracker_copy");
	assert.equal(copy.payload.sourceLink, "https://jira.example.test/browse/OLD-1");
	assert.deepEqual(copy.payload.semanticLoss, ["customField", "localMetadata"]);
	assert.deepEqual(Object.keys(copy.payload.fields).sort(), ["acceptanceCriteria", "comments", "description", "priority", "status", "title", "type"]);
	assert.ok(planned.effects.some(effect => effect.target === "tracker-source:OLD:OLD-1" && effect.classification === "PRESERVE"));
	assert.equal(planned.effects.some(effect => effect.target === "tracker-source:OLD:OLD-1" && ["UPDATE", "DELETE"].includes(effect.classification)), false);
});

test("claimed work, unresolved conflicts, and pending sync block only affected copies unless explicitly excluded", () => {
	const store = {
		"OLD-1": ticket("OLD-1", { localMetadata: { claimed: true } }),
		"OLD-2": ticket("OLD-2"),
		"OLD-3": ticket("OLD-3"),
	};
	const sync = {
		conflicts: [{ localId: "OLD-2" }],
		pendingOperations: [{ localId: "OLD-3" }],
	};
	const blocked = planTrackerOwnership(BASE_CONFIG, store, sync, choices());
	assert.equal(blocked.blockers.length, 3);
	assert.equal(blocked.requiresConfirmation, false);
	assert.equal(blocked.effects.filter(effect => effect.payload?.operation === "create_tracker_copy").length, 0);

	const excluded = planTrackerOwnership(BASE_CONFIG, store, sync, choices("copy-all", { excludedItemIds: ["OLD-1", "OLD-2", "OLD-3"] }));
	assert.equal(excluded.blockers.length, 0);
	assert.equal(excluded.effects.filter(effect => effect.classification === "SKIP").length, 3);
	assert.equal(excluded.sourcePreservation.length, 3);
});

test("Jira project rebinding preserves old keys as inactive history and creates verified copies instead of moving", () => {
	const store = { "OLD-1": ticket("OLD-1") };
	const planned = planTrackerOwnership(BASE_CONFIG, store, {}, choices("copy-all", {
		targetTracker: "jira",
		sourceProject: "OLD",
		targetProject: "NEW",
		sourceStores: ["OLD"],
		dispositions: [{ storeId: "OLD", disposition: "copy-all" }],
		values: { "tracker.primary": "jira" },
	}));
	const copy = planned.effects.find(effect => effect.payload?.operation === "create_tracker_copy");
	assert.equal(copy.payload.targetProject, "NEW");
	assert.equal(copy.payload.sourceId, "OLD-1");
	const cutover = planned.effects.find(effect => effect.payload?.operation === "activate_tracker_ownership");
	assert.equal(cutover.payload.preserveOldKeysAsInactiveHistory, true);
	assert.equal(planned.effects.some(effect => /move|delete|close|reassign/.test(effect.payload?.operation || "")), false);
});

test("external creates use stable correlations and journal each returned identity before ownership cutover", async () => {
	const store = { "OLD-1": ticket("OLD-1"), "OLD-2": ticket("OLD-2") };
	const planned = planTrackerOwnership(BASE_CONFIG, store, {}, choices());
	const repeated = planTrackerOwnership(BASE_CONFIG, store, {}, choices());
	const tokens = planned.effects.filter(effect => effect.payload?.operation === "create_tracker_copy").map(effect => effect.payload.correlationToken);
	assert.deepEqual(tokens, repeated.effects.filter(effect => effect.payload?.operation === "create_tracker_copy").map(effect => effect.payload.correlationToken));
	assert.equal(new Set(tokens).size, 2);

	const adapters = mockAdapters();
	await applyTrackerOwnership(BASE_CONFIG, store, {}, choices(), planned.hash, planned.effects, adapters, { failAtPhase: "cutover" });
	const journal = adapters.getJournal().state;
	const creates = planned.effects.filter(effect => effect.payload?.operation === "create_tracker_copy");
	for (const effect of creates) assert.ok(journal.returnedIdentities[effect.id]?.key);
	assert.equal(adapters.getApplied().some(id => id === "cutover:tracker-ownership:activate"), false);
});

test("remote identity/version/mapped-field drift is re-fetched immediately before mutation and stops writes", async () => {
	const store = { "OLD-1": ticket("OLD-1") };
	const planned = planTrackerOwnership(BASE_CONFIG, store, {}, choices("copy-all", { remoteFingerprints: { "OLD-1": { identity: "candidate", version: 1, mappedFieldHash: "v1" } } }));
	let refetches = 0;
	const adapters = mockAdapters({
		refetchRemoteFingerprint: async () => {
			refetches += 1;
			return { identity: "candidate", version: 2, mappedFieldHash: "drift" };
		},
	});
	const result = await applyTrackerOwnership(BASE_CONFIG, store, {}, choices("copy-all", { remoteFingerprints: { "OLD-1": { identity: "candidate", version: 1, mappedFieldHash: "v1" } } }), planned.hash, planned.effects, adapters);
	assert.equal(result.success, false);
	assert.equal(refetches, 1);
	assert.deepEqual(adapters.getApplied(), []);
	assert.match(result.report, /Remote drift/);
});

test("interruption resumes without duplicate remote creates and verifies final ownership before audit cleanup", async () => {
	const store = { "OLD-1": ticket("OLD-1"), "OLD-2": ticket("OLD-2") };
	const selectedChoices = choices();
	const planned = planTrackerOwnership(BASE_CONFIG, store, {}, selectedChoices);
	const adapters = mockAdapters();
	const interrupted = await applyTrackerOwnership(BASE_CONFIG, store, {}, selectedChoices, planned.hash, planned.effects, adapters, { failAtPhase: "cutover" });
	assert.equal(interrupted.success, false);
	const createsBefore = adapters.getApplied().filter(id => id.startsWith("prepare:remote:"));
	const resumed = await resumeTrackerOwnership(BASE_CONFIG, store, {}, selectedChoices, adapters);
	assert.equal(resumed.success, true);
	assert.deepEqual(adapters.getApplied().filter(id => id.startsWith("prepare:remote:")), createsBefore);
	assert.ok(adapters.getApplied().includes("cutover:tracker-ownership:activate"));
	assert.equal(adapters.getAudit().status, "completed");
	assert.ok(adapters.getHistory().indexOf("appendAudit") < adapters.getHistory().indexOf("removeJournal"));
});

test("canonical ownership verification failure keeps the journal and prevents cleanup completion", async () => {
	const store = { "OLD-1": ticket("OLD-1") };
	const planned = planTrackerOwnership(BASE_CONFIG, store, {}, choices());
	const adapters = mockAdapters({ verifyCompletion: async () => false });
	const result = await applyTrackerOwnership(BASE_CONFIG, store, {}, choices(), planned.hash, planned.effects, adapters);
	assert.equal(result.success, false);
	assert.ok(adapters.getJournal());
	assert.equal(adapters.getAudit(), null);
	assert.match(result.report, /ownership|mappings|adapters|readiness|source preservation/i);
});

test("aligned preserve-as-history ownership is a no-op with no journal", async () => {
	const store = { "OLD-1": ticket("OLD-1", { storeId: "local" }) };
	const selectedChoices = choices("preserve-as-history", {
		fields: ["tracker.primary"],
		values: { "tracker.primary": "local" },
		sourceTracker: "local",
		targetTracker: "local",
		sourceStores: ["local"],
		dispositions: [{ storeId: "local", disposition: "preserve-as-history" }],
	});
	const planned = planTrackerOwnership(BASE_CONFIG, store, {}, selectedChoices);
	const adapters = mockAdapters();
	const result = await applyTrackerOwnership(BASE_CONFIG, store, {}, selectedChoices, planned.hash, planned.effects, adapters);
	assert.equal(planned.requiresConfirmation, false);
	assert.equal(result.success, true);
	assert.deepEqual(adapters.getHistory(), []);
});
