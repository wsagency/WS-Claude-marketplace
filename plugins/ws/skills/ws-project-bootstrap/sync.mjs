import crypto from "node:crypto";
import { validateCanonicalConfigObject } from "./config.mjs";

export function hashField(value) {
	if (value === undefined || value === null) return "hash_empty";
	return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class FakeJiraAdapterTemplate {
	constructor(initialData = {}) {
		this.existingData = initialData;
		this.outage = false;
		this.callLog = [];
		this.idCounter = 1;
	}

	simulateOutage(active) {
		this.outage = active;
	}

	getCallLog() {
		return this.callLog;
	}

	async getTicket(id) {
		this.callLog.push({ method: "getTicket", args: { id } });
		if (this.outage) throw new Error("Jira is unreachable");
		return this.existingData[id] || null;
	}

	async createTicket(fields, correlationId) {
		this.callLog.push({ method: "createTicket", args: { fields, correlationId } });
		if (this.outage) throw new Error("Jira is unreachable");
		const id = `PROJ-${this.idCounter++}`;
		const ticket = { id, ...fields };
		this.existingData[id] = ticket;
		this.callLog[this.callLog.length - 1].args.resultId = id;
		return ticket;
	}

	async updateTicket(id, fields) {
		this.callLog.push({ method: "updateTicket", args: { id, fields } });
		if (this.outage) throw new Error("Jira is unreachable");
		if (this.existingData[id]) {
			this.existingData[id] = { ...this.existingData[id], ...fields };
		}
	}

	async addComment(id, text) {
		this.callLog.push({ method: "addComment", args: { id, text } });
		if (this.outage) throw new Error("Jira is unreachable");
		const commentId = `comment-${this.idCounter++}`;
		if (this.existingData[id]) {
			this.existingData[id].comments = this.existingData[id].comments || [];
			this.existingData[id].comments.push({ id: commentId, text });
		}
		return { id: commentId };
	}
}

export async function runTrackerOperation({
	config,
	localStore,
	syncState,
	operation,
	jiraAdapter,
	conflictChoices = []
}) {
	const result = {
		nextLocalStore: { ...localStore },
		nextSyncState: {
			mappings: { ...syncState.mappings },
			pendingOperations: [...syncState.pendingOperations]
		},
		externalCallLog: [],
		blockers: [],
		conflicts: [],
		readiness: { ready: true }
	};

	const validation = validateCanonicalConfigObject(config);
	if (validation.status !== "valid") {
		result.readiness = { ready: false, reason: "Canonical project policy must be strict-valid." };
		return result;
	}
	if (config.tracker?.primary !== "local") {
		result.readiness = { ready: false, reason: "Local Markdown must be primary." };
		return result;
	}
	if (!config.jira?.project || config.jira.sync !== "all_local_tickets") {
		result.readiness = { ready: false, reason: "An explicit ready Jira binding required with all-ticket synchronization." };
		return result;
	}

	const logCall = (method, args) => {
		result.externalCallLog.push({ method, args });
	};

	const adapter = {
		getTicket: async (id) => { logCall("getTicket", { id }); return jiraAdapter.getTicket(id); },
		createTicket: async (fields, corrId) => { logCall("createTicket", { fields, correlationId: corrId }); return jiraAdapter.createTicket(fields, corrId); },
		updateTicket: async (id, fields) => { logCall("updateTicket", { id, fields }); return jiraAdapter.updateTicket(id, fields); },
		addComment: async (id, text) => { logCall("addComment", { id, text }); return jiraAdapter.addComment(id, text); }
	};

	// 1. Process Pending Operations
	const pendingToKeep = [];
	const ops = result.nextSyncState.pendingOperations;
	for (let i = 0; i < ops.length; i++) {
		const pending = ops[i];
		try {
			const mapping = result.nextSyncState.mappings[pending.localId];
			if (pending.action === "update" || pending.action === "status") {
				if (mapping) {
					await adapter.updateTicket(mapping.jiraId, pending.payload);
					result.nextSyncState.mappings[pending.localId].fieldHashes = {
						...result.nextSyncState.mappings[pending.localId].fieldHashes,
						...hashTicketFields(pending.payload)
					};
				}
			} else if (pending.action === "create") {
				const jiraTicket = await adapter.createTicket(pending.payload, pending.correlationId);
				result.nextSyncState.mappings[pending.localId] = {
					jiraId: jiraTicket.id,
					fieldHashes: hashTicketFields(pending.payload)
				};
			} else if (pending.action === "comment") {
				if (mapping) {
					await adapter.addComment(mapping.jiraId, pending.payload.text);
				}
			}
		} catch (err) {
			pendingToKeep.push(...ops.slice(i));
			break; // Stop on first error (outage)
		}
	}
	result.nextSyncState.pendingOperations = pendingToKeep;

	if (!operation) {
		return result;
	}

	const { action, localId, payload } = operation;
	const mapping = result.nextSyncState.mappings[localId];
	
	// Exclude localMetadata from sync payload
	const syncPayload = { ...payload };
	delete syncPayload.localMetadata;
	delete syncPayload.id;

	let jiraTicket = null;
	if (mapping) {
		try {
			jiraTicket = await adapter.getTicket(mapping.jiraId);
		} catch (err) {
			// Outage
		}
	}

	// 2. Conflict Detection (if updating mapped ticket)
	if (mapping && jiraTicket && (action === "update" || action === "status")) {
		for (const key of Object.keys(syncPayload)) {
			const oldHash = mapping.fieldHashes[key] || "hash_empty";
			const currentJiraHash = hashField(jiraTicket[key]);
			const currentLocalHash = hashField(syncPayload[key]);

			if (currentJiraHash !== oldHash && currentLocalHash !== oldHash && currentJiraHash !== currentLocalHash) {
				const choice = conflictChoices.find(c => c.localId === localId && c.field === key);
				if (choice) {
					if (choice.resolution === "jira") {
						syncPayload[key] = jiraTicket[key];
					} else if (choice.resolution === "manual") {
						syncPayload[key] = choice.manualValue;
					}
					// if "local", keep syncPayload[key]
				} else {
					result.conflicts.push({
						localId,
						field: key,
						localValue: syncPayload[key],
						jiraValue: jiraTicket[key]
					});
					result.blockers.push(`Conflict on ${key}`);
				}
			}
		}
	}

	if (result.conflicts.length > 0) {
		return result; // Stop before overwrite
	}

	// 3. Aligned no-op check
	let isNoOp = false;
	if (mapping && jiraTicket && (action === "update" || action === "status")) {
		isNoOp = true;
		for (const [key, value] of Object.entries(syncPayload)) {
			if (hashField(value) !== hashField(jiraTicket[key])) {
				isNoOp = false;
				break;
			}
		}
	}

	// 4. Synchronize resulting local change
	const correlationId = hashField({ localId, action, payload: syncPayload });
	try {
		if (action === "create") {
			const created = await adapter.createTicket(syncPayload, correlationId);
			result.nextSyncState.mappings[localId] = {
				jiraId: created.id,
				fieldHashes: hashTicketFields(syncPayload)
			};
		} else if (action === "update" || action === "status") {
			if (mapping) {
				if (!isNoOp) {
					await adapter.updateTicket(mapping.jiraId, syncPayload);
				}
				result.nextSyncState.mappings[localId].fieldHashes = {
					...result.nextSyncState.mappings[localId].fieldHashes,
					...hashTicketFields(syncPayload)
				};
			}
		} else if (action === "comment") {
			if (mapping) {
				await adapter.addComment(mapping.jiraId, syncPayload.text);
			}
		}
	} catch (err) {
		result.nextSyncState.pendingOperations.push({
			correlationId,
			localId,
			action,
			payload: syncPayload
		});
	}
	
	// 5. Local Operation execution
	let nextLocalStoreEntry = result.nextLocalStore[localId] || { id: localId, comments: [], localMetadata: {} };
	if (action === "create" || action === "update" || action === "status") {
		nextLocalStoreEntry = { ...nextLocalStoreEntry, ...syncPayload };
	} else if (action === "comment") {
		nextLocalStoreEntry.comments = nextLocalStoreEntry.comments || [];
		nextLocalStoreEntry.comments.push({ id: `c-${Date.now()}`, text: syncPayload.text });
	}
	
	result.nextLocalStore[localId] = nextLocalStoreEntry;

	return result;
}

function hashTicketFields(fields) {
	const hashes = {};
	for (const [key, value] of Object.entries(fields)) {
		if (key !== 'id' && key !== 'localMetadata') {
			hashes[key] = hashField(value);
		}
	}
	return hashes;
}
