import test from "node:test";
import assert from "node:assert/strict";
import { auditBackfill, planBackfill, executeBackfill } from "./backfill-jira.mjs";
import { FakeJiraAdapter } from "./test-support/fake-jira-adapter.mjs";
import { hashField } from "./sync.mjs";

function clone(value) {
	return structuredClone(value);
}

function durablePersistence(initialState, hooks = {}) {
	let durable = clone(initialState);
	let persistCount = 0;
	let readCount = 0;
	const events = [];
	return {
		events,
		snapshot: () => clone(durable),
		async persistSyncState(state) {
			persistCount += 1;
			events.push({ type: "persist", state: clone(state) });
			if (hooks.beforePersist) await hooks.beforePersist({ state, persistCount, durable: clone(durable) });
			durable = clone(state);
		},
		async readSyncState() {
			readCount += 1;
			events.push({ type: "read", state: clone(durable) });
			if (hooks.readOverride) {
				const overridden = hooks.readOverride({ state: clone(durable), readCount });
				if (overridden) return overridden;
			}
			return clone(durable);
		}
	};
}

function backfillItem(localId, correlationToken, title = localId) {
	return { localId, correlationToken, mappedFields: { title, status: "open" } };
}

test("auditBackfill classifies valid, missing, stale, and duplicated mappings", async () => {
	const localTickets = {
		"LOCAL-1": { id: "LOCAL-1" },
		"LOCAL-2": { id: "LOCAL-2" },
		"LOCAL-4": { id: "LOCAL-4" },
		"LOCAL-5": { id: "LOCAL-5" }
	};
	const syncState = {
		mappings: {
			"LOCAL-1": { jiraId: "PROJ-1" },
			"LOCAL-2": { jiraId: "PROJ-2" },
			"LOCAL-3": { jiraId: "PROJ-3" },
			"LOCAL-4": { jiraId: "PROJ-4" },
			"LOCAL-5": { jiraId: "PROJ-4" }
		},
		pendingOperations: []
	};
	const jiraAdapter = new FakeJiraAdapter({
		"PROJ-1": { id: "PROJ-1" },
		"PROJ-3": { id: "PROJ-3" },
		"PROJ-4": { id: "PROJ-4" }
	});
	const audit = await auditBackfill(localTickets, syncState, jiraAdapter);
	assert.deepEqual(audit.valid.map(item => item.localId), ["LOCAL-1", "LOCAL-4"]);
	assert.deepEqual(audit.stale.map(item => item.localId), ["LOCAL-2"]);
	assert.deepEqual(audit.missing.map(item => item.localId), ["LOCAL-3"]);
	assert.deepEqual(audit.duplicated, [{ localId: "LOCAL-5", jiraId: "PROJ-4", otherLocalId: "LOCAL-4" }]);
});

test("planBackfill includes open and done tickets with deterministic correlations", () => {
	const localTickets = {
		"LOCAL-1": { id: "LOCAL-1", title: "Mapped", status: "open" },
		"LOCAL-2": { id: "LOCAL-2", title: "Open", status: "open", type: "Bug", localMetadata: { custom: true } },
		"LOCAL-3": { id: "LOCAL-3", title: "Done", status: "done" }
	};
	const syncState = { mappings: { "LOCAL-1": { jiraId: "TKT-1" } }, pendingOperations: [] };
	const first = planBackfill(localTickets, syncState, { jira: { project: "TKT", default_issue_type: "Task" } });
	const second = planBackfill(localTickets, syncState, { jira: { project: "TKT", default_issue_type: "Task" } });
	assert.deepEqual(first, second);
	assert.deepEqual(first.unmapped.map(item => item.localId), ["LOCAL-2", "LOCAL-3"]);
	assert.equal(first.unmapped[0].proposedType, "Bug");
	assert.deepEqual(first.unmapped[0].unsupportedFields, ["custom"]);
	assert.equal(first.unmapped[1].proposedType, "Task");
	assert.notEqual(first.unmapped[0].correlationToken, first.unmapped[1].correlationToken);
});

test("planBackfill retains unmapped tickets with pending create intents for recovery", () => {
	const localTickets = { "LOCAL-1": { id: "LOCAL-1", title: "Recover", status: "open" } };
	const pendingOperations = [{
		correlationId: hashField("LOCAL-1:TKT"),
		localId: "LOCAL-1",
		action: "create",
		payload: { title: "Recover" },
	}];
	const plan = planBackfill(
		localTickets,
		{ mappings: {}, pendingOperations },
		{ jira: { project: "TKT", default_issue_type: "Task" } },
	);
	assert.deepEqual(plan.unmapped.map(item => item.localId), ["LOCAL-1"]);
	assert.equal(plan.unmapped[0].correlationToken, pendingOperations[0].correlationId);
});

test("every create is followed by durable returned-key journaling, mapping persistence, and read-back", async () => {
	const syncState = { mappings: {}, pendingOperations: [] };
	const persistence = durablePersistence(syncState);
	const jiraAdapter = new FakeJiraAdapter();
	const order = [];
	const createTicket = jiraAdapter.createTicket.bind(jiraAdapter);
	jiraAdapter.createTicket = async (fields, correlationId) => {
		order.push(`create:${correlationId}`);
		return createTicket(fields, correlationId);
	};
	const persistSyncState = persistence.persistSyncState.bind(persistence);
	persistence.persistSyncState = async state => {
		const returned = state.pendingOperations.find(operation => operation.returnedId);
		const mapped = Object.entries(state.mappings)[0];
		order.push(returned ? `persist-returned:${returned.returnedId}` : mapped ? `persist-mapping:${mapped[0]}:${mapped[1].jiraId}` : "persist-intent");
		return persistSyncState(state);
	};
	const readSyncState = persistence.readSyncState.bind(persistence);
	persistence.readSyncState = async () => {
		const state = await readSyncState();
		const mapped = Object.entries(state.mappings).at(-1);
		order.push(mapped && state.pendingOperations.length === 0 ? `read-mapping:${mapped[0]}:${mapped[1].jiraId}` : "read-journal");
		return state;
	};

	const result = await executeBackfill({
		plan: { unmapped: [backfillItem("LOCAL-1", "corr-1"), backfillItem("LOCAL-2", "corr-2")] },
		syncState,
		jiraAdapter,
		persistence
	});
	assert.deepEqual(result.completed, ["LOCAL-1", "LOCAL-2"]);
	assert.equal(result.errors.length, 0);
	const firstMappingRead = order.findIndex(event => event.startsWith("read-mapping:LOCAL-1:"));
	const secondCreate = order.indexOf("create:corr-2");
	assert.ok(firstMappingRead >= 0 && firstMappingRead < secondCreate, order.join(" -> "));
	assert.ok(order.some(event => event.startsWith("persist-returned:PROJ-1")));
	assert.equal(persistence.snapshot().mappings["LOCAL-2"].jiraId, "PROJ-2");
});

test("outage leaves a durably verified correlation intent and stops sequential creation", async () => {
	const syncState = { mappings: {}, pendingOperations: [] };
	const persistence = durablePersistence(syncState);
	const jiraAdapter = new FakeJiraAdapter();
	jiraAdapter.simulateOutage(true);
	const result = await executeBackfill({
		plan: { unmapped: [backfillItem("LOCAL-1", "corr-1"), backfillItem("LOCAL-2", "corr-2")] },
		syncState,
		jiraAdapter,
		persistence
	});
	assert.deepEqual(result.pending, ["LOCAL-1", "LOCAL-2"]);
	assert.equal(result.errors.length, 1);
	assert.deepEqual(persistence.snapshot().pendingOperations.map(operation => operation.correlationId), ["corr-1"]);
	assert.equal(jiraAdapter.getCallLog().filter(call => call.method === "createTicket").length, 0);
});

test("mapping read-back failure after persistence blocks the next create", async () => {
	const syncState = { mappings: {}, pendingOperations: [] };
	let corrupted = false;
	const persistence = durablePersistence(syncState, {
		readOverride: ({ state }) => {
			if (!corrupted && state.mappings["LOCAL-1"] && state.pendingOperations.length === 0) {
				corrupted = true;
				return { mappings: {}, pendingOperations: [] };
			}
			return null;
		}
	});
	const jiraAdapter = new FakeJiraAdapter();
	const plan = { unmapped: [backfillItem("LOCAL-1", "corr-1"), backfillItem("LOCAL-2", "corr-2")] };
	const failed = await executeBackfill({ plan, syncState, jiraAdapter, persistence });
	assert.deepEqual(failed.completed, []);
	assert.deepEqual(failed.pending, ["LOCAL-1", "LOCAL-2"]);
	assert.equal(failed.errors[0].error, "Durable sync-state read-back verification failed");
	assert.equal(jiraAdapter.getCallLog().filter(call => call.method === "createTicket").length, 1);
	assert.equal(persistence.snapshot().mappings["LOCAL-1"].jiraId, "PROJ-1");

	const resumed = await executeBackfill({ plan, syncState: persistence.snapshot(), jiraAdapter, persistence });
	assert.deepEqual(resumed.completed, ["LOCAL-1", "LOCAL-2"]);
	assert.equal(jiraAdapter.getCallLog().filter(call => call.method === "createTicket").length, 2);
});

test("crash after remote create resumes by correlation without a duplicate create", async () => {
	const syncState = { mappings: {}, pendingOperations: [] };
	let crashOnce = true;
	const persistence = durablePersistence(syncState, {
		beforePersist: ({ state }) => {
			if (crashOnce && state.pendingOperations.some(operation => operation.returnedId)) {
				crashOnce = false;
				throw new Error("simulated crash before returned identity became durable");
			}
		}
	});
	const jiraAdapter = new FakeJiraAdapter();
	const plan = { unmapped: [backfillItem("LOCAL-1", "corr-resume", "Recovered")] };
	const interrupted = await executeBackfill({ plan, syncState, jiraAdapter, persistence });
	assert.equal(interrupted.errors.length, 1);
	assert.equal(jiraAdapter.getCallLog().filter(call => call.method === "createTicket").length, 1);
	assert.equal(persistence.snapshot().pendingOperations[0].correlationId, "corr-resume");
	assert.equal(persistence.snapshot().pendingOperations[0].returnedId, undefined);

	const resumed = await executeBackfill({ plan, syncState: persistence.snapshot(), jiraAdapter, persistence });
	assert.deepEqual(resumed.completed, ["LOCAL-1"]);
	assert.equal(resumed.nextSyncState.mappings["LOCAL-1"].jiraId, "PROJ-1");
	assert.equal(jiraAdapter.getCallLog().filter(call => call.method === "createTicket").length, 1);
	assert.ok(jiraAdapter.getCallLog().some(call => call.method === "findTicketByCorrelation"));
});
