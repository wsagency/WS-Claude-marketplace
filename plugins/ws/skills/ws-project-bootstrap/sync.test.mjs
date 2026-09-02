import test from "node:test";
import assert from "node:assert/strict";
import { runTrackerOperation, FakeJiraAdapterTemplate, hashField } from "./sync.mjs";

test("rejects synchronization if config is Jira-primary or lacks Jira binding", async () => {
	const result = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "jira", pull_requests: "ignore" }, jira: { project: "PROJ", default_issue_type: "Task", sync: "disabled" } },
		localStore: {},
		syncState: { mappings: {}, pendingOperations: [] },
		operation: null,
		jiraAdapter: new FakeJiraAdapterTemplate()
	});
	assert.equal(result.readiness.ready, false);
	assert.match(result.readiness.reason, /Local Markdown must be primary/);

	const result2 = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "local", pull_requests: "ignore" } },
		localStore: {},
		syncState: { mappings: {}, pendingOperations: [] },
		operation: null,
		jiraAdapter: new FakeJiraAdapterTemplate()
	});
	assert.equal(result2.readiness.ready, false);
	assert.match(result2.readiness.reason, /explicit ready Jira binding required/);
});

test("creates ticket in Jira, hashes fields, and ignores local metadata", async () => {
	const adapter = new FakeJiraAdapterTemplate();
	const localStore = {
		"loc-1": {
			id: "loc-1",
			title: "Test Ticket",
			description: "Desc",
			status: "open",
			type: "bug",
			comments: [],
			localMetadata: { claims: ["me"], sessionShares: 1 }
		}
	};
	const result = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "local", pull_requests: "ignore" }, jira: { project: "PROJ", default_issue_type: "Task", sync: "all_local_tickets" } },
		localStore,
		syncState: { mappings: {}, pendingOperations: [] },
		operation: { action: "create", localId: "loc-1", payload: localStore["loc-1"] },
		jiraAdapter: adapter
	});

	assert.equal(result.readiness.ready, true);
	assert.equal(result.externalCallLog.length, 1);
	assert.equal(result.externalCallLog[0].method, "createTicket");
	assert.equal(result.externalCallLog[0].args.fields.title, "Test Ticket");
	assert.equal(result.externalCallLog[0].args.fields.localMetadata, undefined); // never leaves repo
	
	const jiraId = result.nextSyncState.mappings["loc-1"].jiraId;
	assert.ok(result.nextSyncState.mappings["loc-1"]);
	assert.equal(result.nextSyncState.mappings["loc-1"].jiraId, jiraId);
	assert.ok(result.nextSyncState.mappings["loc-1"].fieldHashes.title);
});

test("synchronizes pending operations before local action", async () => {
	const adapter = new FakeJiraAdapterTemplate();
	const syncState = {
		mappings: {
			"loc-2": { jiraId: "PROJ-2", fieldHashes: { title: "old-hash" } }
		},
		pendingOperations: [
			{ correlationId: "c1", localId: "loc-2", action: "update", payload: { title: "Pending Title" } }
		]
	};
	const localStore = {
		"loc-2": {
			id: "loc-2",
			title: "Newest Title",
			description: "Desc",
			status: "open",
			comments: [],
			localMetadata: {}
		}
	};
	adapter.existingData["PROJ-2"] = {
		id: "PROJ-2",
		title: "Pending Title",
		description: "Desc",
		status: "open",
		comments: []
	};

	const result = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "local", pull_requests: "ignore" }, jira: { project: "PROJ", default_issue_type: "Task", sync: "all_local_tickets" } },
		localStore,
		syncState,
		operation: { action: "update", localId: "loc-2", payload: { title: "Newest Title" } },
		jiraAdapter: adapter
	});

	assert.equal(result.readiness.ready, true);
	const calls = result.externalCallLog;
	assert.equal(calls[0].method, "updateTicket");
	assert.equal(calls[0].args.fields.title, "Pending Title");
	assert.equal(calls[1].method, "getTicket");
	assert.equal(calls[2].method, "updateTicket");
	assert.equal(calls[2].args.fields.title, "Newest Title");
	
	assert.equal(result.nextSyncState.pendingOperations.length, 0);
});

test("stops on semantic conflict when both sides change a mapped field", async () => {
	const adapter = new FakeJiraAdapterTemplate();
	const syncState = {
		mappings: {
			"loc-3": { jiraId: "PROJ-3", fieldHashes: { title: "hash1" } }
		},
		pendingOperations: []
	};
	const localStore = {
		"loc-3": {
			id: "loc-3",
			title: "Local Changed Title",
			description: "Desc",
			status: "open",
			comments: [],
			localMetadata: {}
		}
	};
	adapter.existingData["PROJ-3"] = {
		id: "PROJ-3",
		title: "Jira Changed Title",
		description: "Desc",
		status: "open",
		comments: []
	};

	const result = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "local", pull_requests: "ignore" }, jira: { project: "PROJ", default_issue_type: "Task", sync: "all_local_tickets" } },
		localStore,
		syncState,
		operation: { action: "update", localId: "loc-3", payload: { title: "Local Changed Title" } },
		jiraAdapter: adapter
	});

	assert.equal(result.blockers.length, 1);
	assert.equal(result.conflicts.length, 1);
	assert.equal(result.conflicts[0].field, "title");
	assert.equal(result.conflicts[0].localValue, "Local Changed Title");
	assert.equal(result.conflicts[0].jiraValue, "Jira Changed Title");
	assert.equal(result.externalCallLog.length, 1);
	assert.equal(result.externalCallLog[0].method, "getTicket");
});

test("outage permits local operation and records pending sync", async () => {
	const adapter = new FakeJiraAdapterTemplate();
	adapter.simulateOutage(true);
	const localStore = {
		"loc-4": {
			id: "loc-4",
			title: "Offline Title",
			description: "Desc",
			status: "open",
			comments: [],
			localMetadata: {}
		}
	};

	const result = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "local", pull_requests: "ignore" }, jira: { project: "PROJ", default_issue_type: "Task", sync: "all_local_tickets" } },
		localStore,
		syncState: { mappings: {}, pendingOperations: [] },
		operation: { action: "create", localId: "loc-4", payload: localStore["loc-4"] },
		jiraAdapter: adapter
	});

	assert.equal(result.readiness.ready, true);
	assert.equal(result.nextSyncState.pendingOperations.length, 1);
	assert.equal(result.nextSyncState.pendingOperations[0].action, "create");
});

test("resolves conflict with manual choice", async () => {
	const adapter = new FakeJiraAdapterTemplate();
	const syncState = {
		mappings: {
			"loc-5": { jiraId: "PROJ-5", fieldHashes: { title: "hash1" } }
		},
		pendingOperations: []
	};
	const localStore = {
		"loc-5": {
			id: "loc-5",
			title: "Local Title",
			description: "Desc",
			status: "open",
			comments: [],
			localMetadata: {}
		}
	};
	adapter.existingData["PROJ-5"] = {
		id: "PROJ-5",
		title: "Jira Title",
		description: "Desc",
		status: "open",
		comments: []
	};

	const result = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "local", pull_requests: "ignore" }, jira: { project: "PROJ", default_issue_type: "Task", sync: "all_local_tickets" } },
		localStore,
		syncState,
		operation: { action: "update", localId: "loc-5", payload: { title: "Local Title" } },
		jiraAdapter: adapter,
		conflictChoices: [{ localId: "loc-5", field: "title", resolution: "manual", manualValue: "Merged Title" }]
	});

	assert.equal(result.blockers.length, 0);
	assert.equal(result.conflicts.length, 0);
	assert.equal(result.nextLocalStore["loc-5"].title, "Merged Title");
	assert.equal(result.externalCallLog.length, 2);
	assert.equal(result.externalCallLog[1].method, "updateTicket");
	assert.equal(result.externalCallLog[1].args.fields.title, "Merged Title");
});

test("comment synchronizes correctly without conflict detection", async () => {
	const adapter = new FakeJiraAdapterTemplate();
	const syncState = {
		mappings: { "loc-6": { jiraId: "PROJ-6", fieldHashes: { title: "hash" } } },
		pendingOperations: []
	};
	adapter.existingData["PROJ-6"] = { id: "PROJ-6", title: "Title" };

	const result = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "local", pull_requests: "ignore" }, jira: { project: "PROJ", default_issue_type: "Task", sync: "all_local_tickets" } },
		localStore: { "loc-6": { id: "loc-6", comments: [] } },
		syncState,
		operation: { action: "comment", localId: "loc-6", payload: { text: "Hello" } },
		jiraAdapter: adapter
	});
	
	assert.equal(result.externalCallLog.length, 2);
	assert.equal(result.externalCallLog[1].method, "addComment");
	assert.equal(result.nextLocalStore["loc-6"].comments.length, 1);
	assert.equal(result.nextLocalStore["loc-6"].comments[0].text, "Hello");
});

test("status synchronizes correctly with conflict detection", async () => {
	const adapter = new FakeJiraAdapterTemplate();
	const syncState = {
		mappings: { "loc-7": { jiraId: "PROJ-7", fieldHashes: { status: hashField("open") } } },
		pendingOperations: []
	};
	adapter.existingData["PROJ-7"] = { id: "PROJ-7", status: "open_changed" };

	const result = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "local", pull_requests: "ignore" }, jira: { project: "PROJ", default_issue_type: "Task", sync: "all_local_tickets" } },
		localStore: { "loc-7": { id: "loc-7", status: "open" } },
		syncState,
		operation: { action: "status", localId: "loc-7", payload: { status: "closed" } },
		jiraAdapter: adapter
	});
	
	assert.equal(result.externalCallLog.length, 1); // getTicket only because conflict blocks update
	assert.equal(result.externalCallLog[0].method, "getTicket");
	assert.equal(result.conflicts.length, 1);
});

test("aligned no-op skips external update when Jira matches local", async () => {
	const adapter = new FakeJiraAdapterTemplate();
	const syncState = {
		mappings: { "loc-8": { jiraId: "PROJ-8", fieldHashes: { title: "hash" } } },
		pendingOperations: []
	};
	adapter.existingData["PROJ-8"] = { id: "PROJ-8", title: "Same Title" };

	const result = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "local", pull_requests: "ignore" }, jira: { project: "PROJ", default_issue_type: "Task", sync: "all_local_tickets" } },
		localStore: { "loc-8": { id: "loc-8", title: "Old Title" } },
		syncState,
		operation: { action: "update", localId: "loc-8", payload: { title: "Same Title" } },
		jiraAdapter: adapter
	});
	
	assert.equal(result.externalCallLog.length, 1); 
	assert.equal(result.externalCallLog[0].method, "getTicket");
	assert.equal(result.nextLocalStore["loc-8"].title, "Same Title");
});

test("resolves conflict with local or jira choices", async () => {
	const adapterLocal = new FakeJiraAdapterTemplate();
	const syncStateLocal = {
		mappings: { "loc-9": { jiraId: "PROJ-9", fieldHashes: { title: "hash1" } } },
		pendingOperations: []
	};
	adapterLocal.existingData["PROJ-9"] = { id: "PROJ-9", title: "Jira Title" };

	const resultLocal = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "local", pull_requests: "ignore" }, jira: { project: "PROJ", default_issue_type: "Task", sync: "all_local_tickets" } },
		localStore: { "loc-9": { id: "loc-9", title: "Old Title" } },
		syncState: syncStateLocal,
		operation: { action: "update", localId: "loc-9", payload: { title: "Local Title" } },
		jiraAdapter: adapterLocal,
		conflictChoices: [{ localId: "loc-9", field: "title", resolution: "local" }]
	});

	assert.equal(resultLocal.conflicts.length, 0);
	assert.equal(resultLocal.nextLocalStore["loc-9"].title, "Local Title");

	const adapterJira = new FakeJiraAdapterTemplate();
	const syncStateJira = {
		mappings: { "loc-9": { jiraId: "PROJ-9", fieldHashes: { title: "hash1" } } },
		pendingOperations: []
	};
	adapterJira.existingData["PROJ-9"] = { id: "PROJ-9", title: "Jira Title" };

	const resultJira = await runTrackerOperation({
		config: { schema_version: 1, tracker: { primary: "local", pull_requests: "ignore" }, jira: { project: "PROJ", default_issue_type: "Task", sync: "all_local_tickets" } },
		localStore: { "loc-9": { id: "loc-9", title: "Old Title" } },
		syncState: syncStateJira,
		operation: { action: "update", localId: "loc-9", payload: { title: "Local Title" } },
		jiraAdapter: adapterJira,
		conflictChoices: [{ localId: "loc-9", field: "title", resolution: "jira" }]
	});

	assert.equal(resultJira.conflicts.length, 0);
	assert.equal(resultJira.nextLocalStore["loc-9"].title, "Jira Title");
});