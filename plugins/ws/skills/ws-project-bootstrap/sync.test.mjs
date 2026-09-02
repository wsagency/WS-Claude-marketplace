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

test("rejects synchronization unless Local/Jira all-ticket policy is ready", async () => {
	const jiraAdapter = new FakeJiraAdapter();
	const jiraPrimary = await runTrackerOperation({
		config: { ...CONFIG, tracker: { primary: "jira", pull_requests: "ignore" }, jira: { ...CONFIG.jira, sync: "disabled" } },
		localStore: {},
		syncState: { mappings: {}, pendingOperations: [] },
		operation: null,
		jiraAdapter
	});
	assert.equal(jiraPrimary.readiness.ready, false);
	assert.match(jiraPrimary.readiness.reason, /Local Markdown must be primary/);

	const noBinding = await runTrackerOperation({
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

	const result = await runTrackerOperation({
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
	const result = await runTrackerOperation({
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
	const result = await runTrackerOperation({
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
	const offline = await runTrackerOperation({
		config: CONFIG,
		localStore: {},
		syncState: { mappings: {}, pendingOperations: [] },
		operation: { action: "create", localId: "local-5", payload: { title: "Offline" } },
		jiraAdapter
	});
	assert.equal(offline.nextSyncState.pendingOperations.length, 1);

	jiraAdapter.simulateOutage(false);
	const recovered = await runTrackerOperation({
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

test("an after-pass failure preserves recoverable state", async () => {
	const jiraAdapter = new FakeJiraAdapter({ "WCM-6": { id: "WCM-6", title: "Before" } });
	const updateTicket = jiraAdapter.updateTicket.bind(jiraAdapter);
	jiraAdapter.updateTicket = async () => {
		throw new Error("transient write failure");
	};
	const failed = await runTrackerOperation({
		config: CONFIG,
		localStore: { "local-6": { id: "local-6", title: "Before" } },
		syncState: { mappings: { "local-6": mapping("WCM-6", { title: "Before" }) }, pendingOperations: [] },
		operation: { action: "update", localId: "local-6", payload: { title: "After" } },
		jiraAdapter
	});
	assert.equal(failed.nextLocalStore["local-6"].title, "After");
	assert.equal(failed.nextSyncState.pendingOperations.length, 1);

	jiraAdapter.updateTicket = updateTicket;
	const recovered = await runTrackerOperation({
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
	const created = await runTrackerOperation({
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
				agentState: { active: true }
			}
		},
		jiraAdapter
	});
	const createFields = created.externalCallLog.find(call => call.method === "createTicket").args.fields;
	assert.deepEqual(createFields, { title: "Private metadata" });

	const commented = await runTrackerOperation({
		config: CONFIG,
		localStore: created.nextLocalStore,
		syncState: created.nextSyncState,
		operation: { action: "comment", localId: "local-7", payload: { text: "Hello" } },
		jiraAdapter
	});
	assert.equal(commented.nextLocalStore["local-7"].comments[0].text, "Hello");
	assert.equal(jiraAdapter.existingData[created.nextSyncState.mappings["local-7"].jiraId].comments[0].text, "Hello");
});

test("aligned updates are post-pass no-ops and Jira conflict choices update Local", async () => {
	const jiraAdapter = new FakeJiraAdapter({ "WCM-8": { id: "WCM-8", title: "Remote" } });
	const jiraChoice = await runTrackerOperation({
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
