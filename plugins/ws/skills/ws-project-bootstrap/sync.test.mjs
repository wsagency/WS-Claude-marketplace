import test from "node:test";
import assert from "node:assert/strict";
import { runTrackerOperation, hashField } from "./sync.mjs";
import { FakeJiraAdapter } from "./test-support/fake-jira-adapter.mjs";

const CONFIG = Object.freeze({
	schema_version: 1,
	tracker: { primary: "local", pull_requests: "ignore" },
	jira: { project: "WCM", default_issue_type: "Task", sync: "all_local_tickets" }
});

function mapping(jiraId, fields) {
	return {
		jiraId,
		fieldHashes: Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, hashField(value)]))
	};
}
function durablePersistence(localStore, syncState, events = []) {
	let durableLocalStore = structuredClone(localStore);
	let durableSyncState = structuredClone(syncState);
	return {
		events,
		localSnapshot: () => structuredClone(durableLocalStore),
		syncSnapshot: () => structuredClone(durableSyncState),
		async persistLocalStore(store) {
			durableLocalStore = structuredClone(store);
			events.push({ type: "persist-local", store: structuredClone(store) });
		},
		async readLocalStore() {
			events.push({ type: "read-local", store: structuredClone(durableLocalStore) });
			return structuredClone(durableLocalStore);
		},
		async persistSyncState(state) {
			durableSyncState = structuredClone(state);
			events.push({ type: "persist-sync", state: structuredClone(state) });
		},
		async readSyncState() {
			events.push({ type: "read-sync", state: structuredClone(durableSyncState) });
			return structuredClone(durableSyncState);
		},
	};
}

async function runOperation(args) {
	return runTrackerOperation({
		...args,
		persistence: args.persistence ?? durablePersistence(args.localStore, args.syncState),
	});
}


test("rejects synchronization unless Local/Jira all-ticket policy is ready", async () => {
	const jiraAdapter = new FakeJiraAdapter();
	const jiraPrimary = await runOperation({
		config: { ...CONFIG, tracker: { primary: "jira", pull_requests: "ignore" }, jira: { ...CONFIG.jira, sync: "disabled" } },
		localStore: {},
		syncState: { mappings: {}, pendingOperations: [] },
		operation: null,
		jiraAdapter
	});
	assert.equal(jiraPrimary.readiness.ready, false);
	assert.match(jiraPrimary.readiness.reason, /Local Markdown must be primary/);

	const noBinding = await runOperation({
		config: { schema_version: 1, tracker: CONFIG.tracker },
		localStore: {},
		syncState: { mappings: {}, pendingOperations: [] },
		operation: null,
		jiraAdapter
	});
	assert.equal(noBinding.readiness.ready, false);
	assert.match(noBinding.readiness.reason, /explicit ready Jira binding required/);
});

test("reconciles before, performs the Local operation once, then reconciles after", async () => {
	const jiraAdapter = new FakeJiraAdapter({
		"WCM-1": { id: "WCM-1", title: "Before" },
		"WCM-2": { id: "WCM-2", title: "Current" }
	});
	const order = [];
	let localPerformed = false;
	let localCalls = 0;
	const getTicket = jiraAdapter.getTicket.bind(jiraAdapter);
	jiraAdapter.getTicket = async id => {
		order.push(`${localPerformed ? "post" : "pre"}:get:${id}`);
		return getTicket(id);
	};
	const updateTicket = jiraAdapter.updateTicket.bind(jiraAdapter);
	jiraAdapter.updateTicket = async (id, fields) => {
		order.push(`${localPerformed ? "post" : "pre"}:update:${id}`);
		return updateTicket(id, fields);
	};

	const result = await runOperation({
		config: CONFIG,
		localStore: { "local-2": { id: "local-2", title: "Current" } },
		syncState: {
			mappings: {
				"local-1": mapping("WCM-1", { title: "Before" }),
				"local-2": mapping("WCM-2", { title: "Current" })
			},
			pendingOperations: [{
				correlationId: "pending-1",
				localId: "local-1",
				action: "update",
				payload: { title: "Pending" }
			}]
		},
		operation: {
			action: "update",
			localId: "local-2",
			payload: { title: "After" },
			perform: (store, operation) => {
				localCalls += 1;
				localPerformed = true;
				order.push("local");
				return { ...store, [operation.localId]: { ...store[operation.localId], ...operation.payload } };
			}
		},
		jiraAdapter
	});

	assert.equal(localCalls, 1);
	assert.deepEqual(order, [
		"pre:get:WCM-1",
		"pre:update:WCM-1",
		"pre:get:WCM-2",
		"local",
		"post:get:WCM-2",
		"post:update:WCM-2"
	]);
	assert.equal(result.nextLocalStore["local-2"].title, "After");
	assert.equal(result.nextSyncState.pendingOperations.length, 0);
});

test("same-field title and status conflicts stop before either overwrite", async () => {
	const jiraAdapter = new FakeJiraAdapter({
		"WCM-3": { id: "WCM-3", title: "Remote", status: "remote-status" }
	});
	let localCalls = 0;
	const result = await runOperation({
		config: CONFIG,
		localStore: { "local-3": { id: "local-3", title: "Before", status: "open" } },
		syncState: {
			mappings: { "local-3": mapping("WCM-3", { title: "Before", status: "open" }) },
			pendingOperations: []
		},
		operation: {
			action: "update",
			localId: "local-3",
			payload: { title: "Local", status: "closed" },
			perform: store => {
				localCalls += 1;
				return store;
			}
		},
		jiraAdapter
	});

	assert.equal(localCalls, 0);
	assert.deepEqual(result.conflicts.map(conflict => conflict.field), ["title", "status"]);
	assert.equal(result.nextLocalStore["local-3"].title, "Before");
	assert.deepEqual(jiraAdapter.getCallLog().map(call => call.method), ["getTicket"]);
});

test("a pre-pass outage permits one Local operation and retains old and new pending intent", async () => {
	const jiraAdapter = new FakeJiraAdapter();
	jiraAdapter.simulateOutage(true);
	let localCalls = 0;
	const result = await runOperation({
		config: CONFIG,
		localStore: { "local-4": { id: "local-4", title: "Before" } },
		syncState: {
			mappings: { "local-4": mapping("WCM-4", { title: "Before" }) },
			pendingOperations: [{ correlationId: "older", localId: "older", action: "create", payload: { title: "Older" } }]
		},
		operation: {
			action: "update",
			localId: "local-4",
			payload: { title: "Offline" },
			perform: (store, operation) => {
				localCalls += 1;
				return { ...store, [operation.localId]: { ...store[operation.localId], ...operation.payload } };
			}
		},
		jiraAdapter
	});

	assert.equal(localCalls, 1);
	assert.equal(result.nextLocalStore["local-4"].title, "Offline");
	assert.deepEqual(result.nextSyncState.pendingOperations.map(pending => pending.localId), ["older", "local-4"]);
});

test("the next operation retries outage-pending work first", async () => {
	const jiraAdapter = new FakeJiraAdapter();
	jiraAdapter.simulateOutage(true);
	const offline = await runOperation({
		config: CONFIG,
		localStore: {},
		syncState: { mappings: {}, pendingOperations: [] },
		operation: { action: "create", localId: "local-5", payload: { title: "Offline" } },
		jiraAdapter
	});
	assert.equal(offline.nextSyncState.pendingOperations.length, 1);

	jiraAdapter.simulateOutage(false);
	const recovered = await runOperation({
		config: CONFIG,
		localStore: offline.nextLocalStore,
		syncState: offline.nextSyncState,
		operation: { action: "update", localId: "local-5", payload: { title: "Recovered" } },
		jiraAdapter
	});
	assert.equal(recovered.nextSyncState.pendingOperations.length, 0);
	assert.equal(jiraAdapter.existingData[recovered.nextSyncState.mappings["local-5"].jiraId].title, "Recovered");
	const recoveryMethods = recovered.externalCallLog.map(call => call.method);
	assert.deepEqual(recoveryMethods.slice(0, 2), ["findTicketByCorrelation", "createTicket"]);
});

test("unmapped pending updates, statuses, and comments remain queued without remote mutation", async t => {
	for (const [action, payload] of [
		["update", { title: "Pending title" }],
		["status", { status: "done" }],
		["comment", { text: "Pending comment" }],
	]) {
		await t.test(action, async () => {
			const jiraAdapter = new FakeJiraAdapter();
			const pendingOperations = [{
				correlationId: `pending-${action}`,
				localId: "unmapped-local",
				action,
				payload,
			}];
			const result = await runOperation({
				config: CONFIG,
				localStore: {},
				syncState: { mappings: {}, pendingOperations },
				operation: null,
				jiraAdapter,
			});
			assert.deepEqual(result.nextSyncState.pendingOperations, pendingOperations);
			assert.deepEqual(result.externalCallLog, []);
			assert.deepEqual(jiraAdapter.getCallLog(), []);
		});
	}
});

test("an after-pass failure preserves recoverable state", async () => {
	const jiraAdapter = new FakeJiraAdapter({ "WCM-6": { id: "WCM-6", title: "Before" } });
	const updateTicket = jiraAdapter.updateTicket.bind(jiraAdapter);
	jiraAdapter.updateTicket = async () => {
		throw new Error("transient write failure");
	};
	const failed = await runOperation({
		config: CONFIG,
		localStore: { "local-6": { id: "local-6", title: "Before" } },
		syncState: { mappings: { "local-6": mapping("WCM-6", { title: "Before" }) }, pendingOperations: [] },
		operation: { action: "update", localId: "local-6", payload: { title: "After" } },
		jiraAdapter
	});
	assert.equal(failed.nextLocalStore["local-6"].title, "After");
	assert.equal(failed.nextSyncState.pendingOperations.length, 1);

	jiraAdapter.updateTicket = updateTicket;
	const recovered = await runOperation({
		config: CONFIG,
		localStore: failed.nextLocalStore,
		syncState: failed.nextSyncState,
		operation: null,
		jiraAdapter
	});
	assert.equal(recovered.nextSyncState.pendingOperations.length, 0);
	assert.equal(jiraAdapter.existingData["WCM-6"].title, "After");
});

test("create and comment synchronization never disclose Local workflow metadata", async () => {
	const jiraAdapter = new FakeJiraAdapter();
	const created = await runOperation({
		config: CONFIG,
		localStore: {},
		syncState: { mappings: {}, pendingOperations: [] },
		operation: {
			action: "create",
			localId: "local-7",
			payload: {
				title: "Private metadata",
				localMetadata: { claimed: true },
				claims: ["agent"],
				shares: ["session"],
				mapPointer: "secret",
				agentState: { active: true },
				unrecognizedPrivateState: { mustNeverLeaveRepository: true },
			}
		},
		jiraAdapter
	});
	const createFields = created.externalCallLog.find(call => call.method === "createTicket").args.fields;
	assert.deepEqual(createFields, { title: "Private metadata" });

	const commented = await runOperation({
		config: CONFIG,
		localStore: created.nextLocalStore,
		syncState: created.nextSyncState,
		operation: { action: "comment", localId: "local-7", payload: { text: "Hello" } },
		jiraAdapter
	});
	assert.equal(commented.nextLocalStore["local-7"].comments[0].text, "Hello");
	assert.equal(jiraAdapter.existingData[created.nextSyncState.mappings["local-7"].jiraId].comments[0].text, "Hello");
});

test("durably journals each remote intent and returned version before the next mutation", async () => {
	const jiraAdapter = new FakeJiraAdapter();
	const persistence = durablePersistence({}, { mappings: {}, pendingOperations: [] });
	const observed = [];
	const assertDurableIntent = action => {
		const pending = persistence.syncSnapshot().pendingOperations[0];
		assert.deepEqual(
			persistence.events.slice(-2).map(event => event.type),
			["persist-sync", "read-sync"],
		);
		assert.equal(pending?.action, action);
		observed.push(action);
	};
	const createTicket = jiraAdapter.createTicket.bind(jiraAdapter);
	jiraAdapter.createTicket = async (...args) => {
		assertDurableIntent("create");
		return createTicket(...args);
	};
	const updateTicket = jiraAdapter.updateTicket.bind(jiraAdapter);
	jiraAdapter.updateTicket = async (...args) => {
		assertDurableIntent("update");
		return updateTicket(...args);
	};
	const addComment = jiraAdapter.addComment.bind(jiraAdapter);
	jiraAdapter.addComment = async (...args) => {
		assertDurableIntent("comment");
		return addComment(...args);
	};
	const updateStatus = jiraAdapter.updateStatus.bind(jiraAdapter);
	jiraAdapter.updateStatus = async (...args) => {
		assertDurableIntent("status");
		return updateStatus(...args);
	};
	const invoke = operation => runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation,
		jiraAdapter,
		persistence,
	});

	const created = await invoke({
		action: "create",
		localId: "local-durable",
		payload: { title: "Durable", status: "open" },
	});
	const jiraId = created.nextSyncState.mappings["local-durable"].jiraId;
	assert.equal(persistence.syncSnapshot().mappings["local-durable"].jiraVersion, 1);
	assert.equal(persistence.syncSnapshot().pendingOperations.length, 0);

	await invoke({ action: "update", localId: "local-durable", payload: { title: "Updated" } });
	assert.equal(persistence.syncSnapshot().mappings["local-durable"].jiraVersion, 2);
	assert.equal(persistence.syncSnapshot().mappings["local-durable"].fieldHashes.title, hashField("Updated"));

	await invoke({ action: "comment", localId: "local-durable", payload: { text: "Durable comment" } });
	assert.equal(persistence.syncSnapshot().mappings["local-durable"].jiraVersion, 3);

	await invoke({ action: "status", localId: "local-durable", payload: { status: "done" } });
	assert.equal(persistence.syncSnapshot().mappings["local-durable"].jiraVersion, 4);
	assert.equal(persistence.syncSnapshot().mappings["local-durable"].fieldHashes.status, hashField("done"));
	assert.equal(jiraAdapter.existingData[jiraId].status, "done");
	assert.deepEqual(observed, ["create", "update", "comment", "status"]);
});

test("recovers a create that crashed after Jira accepted it by correlation", async () => {
	const jiraAdapter = new FakeJiraAdapter();
	const persistence = durablePersistence({}, { mappings: {}, pendingOperations: [] });
	const createTicket = jiraAdapter.createTicket.bind(jiraAdapter);
	let createCalls = 0;
	let crashAfterCreate = true;
	jiraAdapter.createTicket = async (...args) => {
		createCalls += 1;
		const ticket = await createTicket(...args);
		if (crashAfterCreate) {
			crashAfterCreate = false;
			throw new Error("connection dropped after Jira accepted the create");
		}
		return ticket;
	};

	const interrupted = await runOperation({
		config: CONFIG,
		localStore: {},
		syncState: { mappings: {}, pendingOperations: [] },
		operation: { action: "create", localId: "local-crash", payload: { title: "Recover me" } },
		jiraAdapter,
		persistence,
	});
	assert.equal(interrupted.nextSyncState.pendingOperations.length, 1);
	assert.equal(persistence.syncSnapshot().pendingOperations[0].returnedId, undefined);

	const resumed = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation: null,
		jiraAdapter,
		persistence,
	});
	assert.equal(createCalls, 1);
	assert.equal(resumed.nextSyncState.pendingOperations.length, 0);
	assert.equal(resumed.nextSyncState.mappings["local-crash"].jiraId, "PROJ-1");
	assert.ok(resumed.externalCallLog.some(call => call.method === "findTicketByCorrelation"));
});

test("pulls Jira-only mapped changes before applying the Local operation", async () => {
	const localStore = {
		"local-pull": { id: "local-pull", title: "Before", status: "open", localMetadata: { claim: "private" } },
	};
	const syncState = {
		mappings: {
			"local-pull": {
				...mapping("WCM-20", { title: "Before", status: "open" }),
				jiraVersion: 1,
			},
		},
		pendingOperations: [],
	};
	const jiraAdapter = new FakeJiraAdapter({
		"WCM-20": { id: "WCM-20", version: 2, title: "Remote title", status: "open" },
	});
	const persistence = durablePersistence(localStore, syncState);
	const result = await runOperation({
		config: CONFIG,
		localStore,
		syncState,
		operation: { action: "status", localId: "local-pull", payload: { status: "done" } },
		jiraAdapter,
		persistence,
	});

	assert.equal(result.nextLocalStore["local-pull"].title, "Remote title");
	assert.deepEqual(result.nextLocalStore["local-pull"].localMetadata, { claim: "private" });
	assert.equal(result.nextSyncState.mappings["local-pull"].fieldHashes.title, hashField("Remote title"));
	assert.equal(jiraAdapter.existingData["WCM-20"].status, "done");
});

test("aligned updates are post-pass no-ops and Jira conflict choices update Local", async () => {
	const jiraAdapter = new FakeJiraAdapter({ "WCM-8": { id: "WCM-8", title: "Remote" } });
	const jiraChoice = await runOperation({
		config: CONFIG,
		localStore: { "local-8": { id: "local-8", title: "Before" } },
		syncState: { mappings: { "local-8": mapping("WCM-8", { title: "Before" }) }, pendingOperations: [] },
		operation: { action: "update", localId: "local-8", payload: { title: "Local" } },
		jiraAdapter,
		conflictChoices: [{ localId: "local-8", field: "title", resolution: "jira" }]
	});
	assert.equal(jiraChoice.nextLocalStore["local-8"].title, "Remote");
	assert.equal(jiraChoice.externalCallLog.filter(call => call.method === "updateTicket").length, 0);
});
