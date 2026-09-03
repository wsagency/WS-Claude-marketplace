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
			repositoryIdentity: "origin:github:github.com/wsagency/project",
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
	assert.equal(result.nextSyncState.repositoryIdentity, "origin:github:github.com/wsagency/project");
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

test("reuses a durably returned comment identity instead of posting it twice", async () => {
	const jiraAdapter = new FakeJiraAdapter({
		"WCM-6C": {
			id: "WCM-6C",
			version: 2,
			title: "Comment recovery",
			comments: [{ id: "comment-9", text: "Already accepted" }],
		},
	});
	const persistence = durablePersistence(
		{
			"local-6c": {
				id: "local-6c",
				title: "Comment recovery",
				comments: [{ id: "local-comment", text: "Already accepted" }],
			},
		},
		{
			mappings: {
				"local-6c": {
					...mapping("WCM-6C", { title: "Comment recovery", comments: [] }),
					jiraVersion: 1,
				},
			},
			pendingOperations: [{
				correlationId: "pending-comment",
				localId: "local-6c",
				action: "comment",
				payload: { text: "Already accepted" },
				returnedId: "comment-9",
				returnedVersion: 2,
			}],
		},
	);

	const recovered = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation: null,
		jiraAdapter,
		persistence,
	});

	assert.equal(jiraAdapter.getCallLog().some(call => call.method === "addComment"), false);
	assert.deepEqual(recovered.nextSyncState.pendingOperations, []);
	assert.deepEqual(
		persistence.localSnapshot()["local-6c"].comments,
		[{ id: "comment-9", text: "Already accepted" }],
	);
});

test("posts two intentional comments with identical text under distinct durable identities", async () => {
	const localId = "repeated-comment";
	const jiraId = "WCM-REPEATED";
	const localStore = {
		[localId]: { id: localId, title: "Repeated comment", comments: [] },
	};
	const syncState = {
		mappings: {
			[localId]: {
				...mapping(jiraId, { title: "Repeated comment", comments: [] }),
				jiraVersion: 1,
			},
		},
		pendingOperations: [],
	};
	const persistence = durablePersistence(localStore, syncState);
	const jiraAdapter = new FakeJiraAdapter({
		[jiraId]: { id: jiraId, version: 1, title: "Repeated comment", comments: [] },
	});
	const firstOperation = { action: "comment", intentId: "repeated-comment-1", localId, payload: { text: "Same text" } };
	const secondOperation = { action: "comment", intentId: "repeated-comment-2", localId, payload: { text: "Same text" } };

	await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation: firstOperation,
		jiraAdapter,
		persistence,
	});
	const second = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation: secondOperation,
		jiraAdapter,
		persistence,
	});

	const calls = jiraAdapter.getCallLog().filter(call => call.method === "addComment");
	assert.equal(calls.length, 2);
	assert.notEqual(calls[0].args.correlationId, calls[1].args.correlationId);
	assert.deepEqual(
		jiraAdapter.existingData[jiraId].comments.map(comment => comment.text),
		["Same text", "Same text"],
	);
	assert.deepEqual(
		second.nextLocalStore[localId].comments.map(comment => comment.text),
		["Same text", "Same text"],
	);
	assert.deepEqual(second.nextSyncState.pendingOperations, []);
});

test("requires caller-stable identities for comment operations", async () => {
	await assert.rejects(
		runOperation({
			config: CONFIG,
			localStore: {},
			syncState: { mappings: {}, pendingOperations: [] },
			operation: { action: "comment", localId: "missing-intent", payload: { text: "Unsafe retry" } },
			jiraAdapter: new FakeJiraAdapter(),
		}),
		/stable caller-generated intentId/,
	);
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
		operation: { action: "comment", intentId: "private-metadata-comment-1", localId: "local-7", payload: { text: "Hello" } },
		jiraAdapter
	});
	assert.equal(commented.nextLocalStore["local-7"].comments[0].text, "Hello");
	assert.equal(jiraAdapter.existingData[created.nextSyncState.mappings["local-7"].jiraId].comments[0].text, "Hello");
});

test("refuses the Local operation when prepared-intent persistence fails", async () => {
	const jiraAdapter = new FakeJiraAdapter();
	const persistence = durablePersistence({}, { mappings: {}, pendingOperations: [] });
	const persistSyncState = persistence.persistSyncState.bind(persistence);
	let failPreparedIntent = true;
	persistence.persistSyncState = async state => {
		if (failPreparedIntent && state.pendingOperations.some(pending => pending.phase === "prepared")) {
			failPreparedIntent = false;
			throw new Error("simulated prepared-intent persistence failure");
		}
		return persistSyncState(state);
	};
	let localCalls = 0;

	const result = await runOperation({
		config: CONFIG,
		localStore: {},
		syncState: { mappings: {}, pendingOperations: [] },
		operation: {
			action: "create",
			localId: "intent-first",
			payload: { title: "Intent first" },
			perform: store => {
				localCalls += 1;
				return { ...store, "intent-first": { id: "intent-first", title: "Intent first" } };
			},
		},
		jiraAdapter,
		persistence,
	});

	assert.equal(result.readiness.ready, false);
	assert.equal(localCalls, 0);
	assert.deepEqual(persistence.localSnapshot(), {});
	assert.deepEqual(persistence.syncSnapshot().pendingOperations, []);
	assert.deepEqual(jiraAdapter.getCallLog(), []);
});

test("a Local failure cancels its prepared intent before any Jira mutation", async () => {
	const jiraAdapter = new FakeJiraAdapter();
	const persistence = durablePersistence({}, { mappings: {}, pendingOperations: [] });

	await assert.rejects(
		runOperation({
			config: CONFIG,
			localStore: {},
			syncState: { mappings: {}, pendingOperations: [] },
			operation: {
				action: "create",
				localId: "local-failure",
				payload: { title: "Must stay Local" },
				perform: () => {
					throw new Error("simulated Local failure");
				},
			},
			jiraAdapter,
			persistence,
		}),
		/simulated Local failure/,
	);

	const syncWrites = persistence.events.filter(event => event.type === "persist-sync");
	assert.equal(syncWrites[0]?.state.pendingOperations[0]?.phase, "prepared");
	assert.deepEqual(persistence.syncSnapshot().pendingOperations, []);
	assert.deepEqual(persistence.localSnapshot(), {});
	assert.deepEqual(jiraAdapter.getCallLog(), []);

	const retryPass = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation: null,
		jiraAdapter,
		persistence,
	});
	assert.deepEqual(retryPass.externalCallLog, []);
});

test("resumes after the Local write without performing the Local operation twice", async () => {
	const jiraAdapter = new FakeJiraAdapter();
	const persistence = durablePersistence({}, { mappings: {}, pendingOperations: [] });
	const persistSyncState = persistence.persistSyncState.bind(persistence);
	let failPhaseAdvance = true;
	persistence.persistSyncState = async state => {
		if (failPhaseAdvance && state.pendingOperations.some(pending => pending.phase === "local_applied")) {
			failPhaseAdvance = false;
			throw new Error("simulated crash before phase advance");
		}
		return persistSyncState(state);
	};
	let localCalls = 0;
	const operation = {
		action: "create",
		localId: "local-crash-before-phase",
		payload: { title: "Recover Local write" },
		perform: store => {
			localCalls += 1;
			return {
				...store,
				"local-crash-before-phase": { id: "local-crash-before-phase", title: "Recover Local write" },
			};
		},
	};

	const interrupted = await runOperation({
		config: CONFIG,
		localStore: {},
		syncState: { mappings: {}, pendingOperations: [] },
		operation,
		jiraAdapter,
		persistence,
	});
	assert.equal(interrupted.readiness.ready, false);
	assert.equal(localCalls, 1);
	assert.equal(persistence.localSnapshot()["local-crash-before-phase"].title, "Recover Local write");
	assert.equal(persistence.syncSnapshot().pendingOperations[0]?.phase, "prepared");
	assert.equal(jiraAdapter.getCallLog().some(call => call.method === "createTicket"), false);

	const resumed = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation,
		jiraAdapter,
		persistence,
	});
	assert.equal(localCalls, 1);
	assert.equal(resumed.readiness.ready, true);
	assert.deepEqual(resumed.nextSyncState.pendingOperations, []);
	assert.equal(jiraAdapter.getCallLog().filter(call => call.method === "createTicket").length, 1);
});


test("retries a reconciled request by its original identity and persisted effective payload", async () => {
	const localId = "local-reconciled-request";
	const originalPayload = { title: "Local choice" };
	const effectivePayload = { title: "Jira choice" };
	const requestCorrelationId = hashField({ localId, action: "update", payload: originalPayload });
	const effectiveCorrelationId = hashField({ localId, action: "update", payload: effectivePayload });
	const jiraAdapter = new FakeJiraAdapter({
		"WCM-RECONCILED": { id: "WCM-RECONCILED", version: 2, title: effectivePayload.title },
	});
	const persistence = durablePersistence(
		{ [localId]: { id: localId, title: "Before" } },
		{
			mappings: {
				[localId]: {
					...mapping("WCM-RECONCILED", { title: "Before" }),
					jiraVersion: 1,
				},
			},
			pendingOperations: [],
		},
	);
	const readSyncState = persistence.readSyncState.bind(persistence);
	let interruptAfterReplacement = true;
	persistence.readSyncState = async () => {
		const pending = persistence.syncSnapshot().pendingOperations[0];
		if (
			interruptAfterReplacement &&
			pending?.requestCorrelationId === requestCorrelationId &&
			pending.correlationId === effectiveCorrelationId
		) {
			interruptAfterReplacement = false;
			throw new Error("simulated crash after reconciliation");
		}
		return readSyncState();
	};
	const seenPayloads = [];
	let localCalls = 0;
	const operation = {
		action: "update",
		localId,
		payload: originalPayload,
		perform: (store, effective) => {
			localCalls += 1;
			seenPayloads.push(structuredClone(effective.payload));
			return { ...store, [localId]: { ...store[localId], ...effective.payload } };
		},
	};

	const interrupted = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation,
		jiraAdapter,
		persistence,
		conflictChoices: [{ localId, field: "title", resolution: "jira" }],
	});
	assert.equal(interrupted.readiness.ready, false);
	assert.equal(localCalls, 0);
	assert.deepEqual(persistence.syncSnapshot().pendingOperations[0], {
		correlationId: effectiveCorrelationId,
		requestCorrelationId,
		localId,
		action: "update",
		payload: effectivePayload,
		localPatch: effectivePayload,
		phase: "prepared",
		localBeforeHash: hashField({ id: localId, title: "Before" }),
		requiresLocalVerification: false,
	});

	const resumed = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation,
		jiraAdapter,
		persistence,
		conflictChoices: [{ localId, field: "title", resolution: "jira" }],
	});
	assert.equal(resumed.readiness.ready, true);
	assert.equal(localCalls, 1);
	assert.deepEqual(seenPayloads, [effectivePayload]);
	assert.deepEqual(resumed.nextSyncState.pendingOperations, []);
	assert.equal(persistence.localSnapshot()[localId].title, effectivePayload.title);
});

test("passes the persisted effective payload to Local recovery verification", async () => {
	const localId = "local-effective-verification";
	const requestPayload = { title: "Requested title" };
	const effectivePayload = { title: "Reconciled title" };
	const requestCorrelationId = hashField({ localId, action: "update", payload: requestPayload });
	const jiraAdapter = new FakeJiraAdapter({
		"WCM-VERIFY": { id: "WCM-VERIFY", version: 2, title: effectivePayload.title },
	});
	const persistence = durablePersistence(
		{ [localId]: { id: localId, title: effectivePayload.title } },
		{
			mappings: {
				[localId]: {
					...mapping("WCM-VERIFY", { title: effectivePayload.title }),
					jiraVersion: 2,
				},
			},
			pendingOperations: [{
				correlationId: hashField({ localId, action: "update", payload: effectivePayload }),
				requestCorrelationId,
				localId,
				action: "update",
				payload: effectivePayload,
				phase: "prepared",
				localBeforeHash: hashField({ id: localId, title: "Before" }),
				requiresLocalVerification: true,
			}],
		},
	);
	let localCalls = 0;
	let verifiedPayload;

	const recovered = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation: {
			action: "update",
			localId,
			payload: requestPayload,
			perform: store => {
				localCalls += 1;
				return store;
			},
			isLocalApplied: (_store, effective) => {
				verifiedPayload = structuredClone(effective.payload);
				return true;
			},
		},
		jiraAdapter,
		persistence,
	});

	assert.equal(recovered.readiness.ready, true);
	assert.equal(localCalls, 0);
	assert.deepEqual(verifiedPayload, effectivePayload);
	assert.deepEqual(recovered.nextSyncState.pendingOperations, []);
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

	await invoke({ action: "comment", intentId: "durable-comment-1", localId: "local-durable", payload: { text: "Durable comment" } });
	assert.equal(persistence.syncSnapshot().mappings["local-durable"].jiraVersion, 3);
	assert.deepEqual(
		persistence.localSnapshot()["local-durable"].comments,
		jiraAdapter.existingData[jiraId].comments,
	);
	assert.equal(
		persistence.syncSnapshot().mappings["local-durable"].fieldHashes.comments,
		hashField(jiraAdapter.existingData[jiraId].comments),
	);

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

test("recovers an accepted comment without posting it twice when its result was not journaled", async () => {
	const localId = "local-comment-crash";
	const jiraId = "WCM-COMMENT";
	const jiraAdapter = new FakeJiraAdapter({
		[jiraId]: { id: jiraId, version: 1, title: "Comment recovery", comments: [] },
	});
	const persistence = durablePersistence(
		{ [localId]: { id: localId, title: "Comment recovery", comments: [] } },
		{
			mappings: {
				[localId]: {
					...mapping(jiraId, { title: "Comment recovery", comments: [] }),
					jiraVersion: 1,
				},
			},
			pendingOperations: [],
		},
	);
	const addComment = jiraAdapter.addComment.bind(jiraAdapter);
	let interruptAfterAcceptance = true;
	jiraAdapter.addComment = async (...args) => {
		const comment = await addComment(...args);
		if (interruptAfterAcceptance) {
			interruptAfterAcceptance = false;
			throw new Error("connection dropped after Jira accepted the comment");
		}
		return comment;
	};

	const interrupted = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation: { action: "comment", intentId: "accepted-comment-1", localId, payload: { text: "Accepted once" } },
		jiraAdapter,
		persistence,
	});
	assert.equal(interrupted.readiness.ready, true);
	assert.equal(persistence.syncSnapshot().pendingOperations[0]?.phase, "local_applied");
	assert.equal(persistence.syncSnapshot().pendingOperations[0]?.returnedId, undefined);
	assert.equal(jiraAdapter.existingData[jiraId].comments.length, 1);

	const resumed = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation: null,
		jiraAdapter,
		persistence,
	});
	assert.deepEqual(resumed.nextSyncState.pendingOperations, []);
	assert.equal(jiraAdapter.existingData[jiraId].comments.length, 1);
	assert.equal(jiraAdapter.getCallLog().filter(call => call.method === "addComment").length, 2);
	assert.deepEqual(
		persistence.localSnapshot()[localId].comments,
		[{ id: jiraAdapter.existingData[jiraId].comments[0].id, text: "Accepted once" }],
	);
});

test("retries a completed comment intent without duplicating the remote comment", async () => {
	const localId = "local-comment-completion-crash";
	const jiraId = "WCM-COMMENT-COMPLETION";
	const jiraAdapter = new FakeJiraAdapter({
		[jiraId]: { id: jiraId, version: 1, title: "Comment completion", comments: [] },
	});
	const persistence = durablePersistence(
		{ [localId]: { id: localId, title: "Comment completion", comments: [] } },
		{
			mappings: {
				[localId]: {
					...mapping(jiraId, { title: "Comment completion", comments: [] }),
					jiraVersion: 1,
				},
			},
			pendingOperations: [],
		},
	);
	const readSyncState = persistence.readSyncState.bind(persistence);
	let failCompletionReadBack = true;
	persistence.readSyncState = async () => {
		const state = await readSyncState();
		if (
			failCompletionReadBack
			&& state.pendingOperations.length === 0
			&& state.mappings[localId]?.jiraVersion === 2
		) {
			failCompletionReadBack = false;
			throw new Error("response lost after durable completion");
		}
		return state;
	};
	const operation = {
		action: "comment",
		intentId: "comment-completion-crash-1",
		localId,
		payload: { text: "Exactly once" },
	};

	const interrupted = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation,
		jiraAdapter,
		persistence,
	});
	assert.equal(interrupted.readiness.ready, false);
	assert.equal(jiraAdapter.existingData[jiraId].comments.length, 1);
	assert.equal(persistence.syncSnapshot().pendingOperations.length, 0);

	const retried = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation,
		jiraAdapter,
		persistence,
	});
	const calls = jiraAdapter.getCallLog().filter(call => call.method === "addComment");
	assert.equal(retried.readiness.ready, true);
	assert.equal(jiraAdapter.existingData[jiraId].comments.length, 1);
	assert.equal(calls.length, 2);
	assert.equal(calls[0].args.correlationId, calls[1].args.correlationId);
	assert.deepEqual(persistence.localSnapshot()[localId].comments, [
		{ id: jiraAdapter.existingData[jiraId].comments[0].id, text: "Exactly once" },
	]);
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

test("recovers when a journaled Jira pull and Local operation persist before read-back", async () => {
	const localId = "local-pull-crash";
	const jiraId = "WCM-PULL-CRASH";
	const localStore = {
		[localId]: { id: localId, title: "Before", status: "open" },
	};
	const syncState = {
		mappings: {
			[localId]: {
				...mapping(jiraId, { title: "Before", status: "open" }),
				jiraVersion: 1,
			},
		},
		pendingOperations: [],
	};
	const jiraAdapter = new FakeJiraAdapter({
		[jiraId]: { id: jiraId, version: 2, title: "Remote title", status: "open" },
	});
	const persistence = durablePersistence(localStore, syncState);
	const readLocalStore = persistence.readLocalStore.bind(persistence);
	let failReadBack = true;
	persistence.readLocalStore = async () => {
		const snapshot = persistence.localSnapshot();
		if (failReadBack && snapshot[localId]?.status === "done") {
			failReadBack = false;
			throw new Error("simulated crash after Local persistence");
		}
		return readLocalStore();
	};
	let localCalls = 0;
	const operation = {
		action: "status",
		localId,
		payload: { status: "done" },
		perform: (store, effective) => {
			localCalls += 1;
			return {
				...store,
				[localId]: { ...store[localId], status: effective.payload.status },
			};
		},
		isLocalApplied: store => store[localId]?.status === "done",
	};

	const interrupted = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation,
		jiraAdapter,
		persistence,
	});
	assert.equal(interrupted.readiness.ready, false);
	assert.equal(localCalls, 1);
	assert.equal(persistence.localSnapshot()[localId].title, "Remote title");
	assert.equal(persistence.localSnapshot()[localId].status, "done");
	assert.deepEqual(persistence.syncSnapshot().pendingOperations[0].localPatch, {
		title: "Remote title",
	});
	assert.equal(persistence.syncSnapshot().pendingOperations[0].phase, "prepared");
	assert.equal(jiraAdapter.existingData[jiraId].status, "open");

	const resumed = await runOperation({
		config: CONFIG,
		localStore: persistence.localSnapshot(),
		syncState: persistence.syncSnapshot(),
		operation,
		jiraAdapter,
		persistence,
	});
	assert.equal(resumed.readiness.ready, true);
	assert.equal(localCalls, 1);
	assert.equal(resumed.nextLocalStore[localId].title, "Remote title");
	assert.equal(jiraAdapter.existingData[jiraId].status, "done");
	assert.deepEqual(resumed.nextSyncState.pendingOperations, []);
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
