import crypto from "node:crypto";
import { validateCanonicalConfigObject } from "./config.mjs";

export function hashField(value) {
	if (value === undefined || value === null) return "hash_empty";
	return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
			mappings: Object.fromEntries(Object.entries(syncState.mappings || {}).map(([localId, mapping]) => [
				localId,
				{ ...mapping, fieldHashes: { ...(mapping.fieldHashes || {}) } }
			])),
			pendingOperations: (syncState.pendingOperations || []).map(pending => ({
				...pending,
				payload: { ...pending.payload }
			}))
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
		getTicket: async id => {
			logCall("getTicket", { id });
			return jiraAdapter.getTicket(id);
		},
		findTicketByCorrelation: typeof jiraAdapter.findTicketByCorrelation === "function"
			? async correlationId => {
				logCall("findTicketByCorrelation", { correlationId });
				return jiraAdapter.findTicketByCorrelation(correlationId);
			}
			: null,
		createTicket: async (fields, correlationId) => {
			logCall("createTicket", { fields, correlationId });
			return jiraAdapter.createTicket(fields, correlationId);
		},
		updateTicket: async (id, fields) => {
			logCall("updateTicket", { id, fields });
			return jiraAdapter.updateTicket(id, fields);
		},
		addComment: async (id, text) => {
			logCall("addComment", { id, text });
			return jiraAdapter.addComment(id, text);
		}
	};

	const sanitizePayload = payload => {
		const sanitized = { ...(payload || {}) };
		delete sanitized.localMetadata;
		delete sanitized.id;
		delete sanitized.claim;
		delete sanitized.claims;
		delete sanitized.shares;
		delete sanitized.map;
		delete sanitized.mapPointer;
		delete sanitized.agentState;
		return sanitized;
	};

	const mergeLocalFields = (localId, payload) => {
		const current = result.nextLocalStore[localId] || { id: localId, comments: [], localMetadata: {} };
		result.nextLocalStore[localId] = { ...current, ...payload };
	};

	const resolveConflicts = (pending, mapping, jiraTicket, updateLocal) => {
		const payload = { ...pending.payload };
		let blocked = false;
		if (pending.action !== "update" && pending.action !== "status") return { payload, blocked };

		for (const key of Object.keys(payload)) {
			const oldHash = mapping.fieldHashes?.[key] || "hash_empty";
			const jiraHash = hashField(jiraTicket[key]);
			const localHash = hashField(payload[key]);
			if (jiraHash === oldHash || localHash === oldHash || jiraHash === localHash) continue;

			const choice = conflictChoices.find(candidate => candidate.localId === pending.localId && candidate.field === key);
			if (!choice) {
				result.conflicts.push({
					localId: pending.localId,
					field: key,
					localValue: payload[key],
					jiraValue: jiraTicket[key]
				});
				result.blockers.push(`Conflict on ${key}`);
				blocked = true;
				continue;
			}
			if (choice.resolution === "jira") {
				payload[key] = jiraTicket[key];
			} else if (choice.resolution === "manual") {
				payload[key] = choice.manualValue;
			}
		}

		if (updateLocal && !blocked) mergeLocalFields(pending.localId, payload);
		return { payload, blocked };
	};

	const initialPendingCreates = new Set(
		result.nextSyncState.pendingOperations
			.filter(pending => pending.action === "create")
			.map(pending => pending.correlationId)
	);

	const reconcilePending = async () => {
		const operations = result.nextSyncState.pendingOperations;
		const pendingToKeep = [];
		for (let index = 0; index < operations.length; index++) {
			const pending = operations[index];
			try {
				const mapping = result.nextSyncState.mappings[pending.localId];
				if (pending.action === "create") {
					let jiraTicket = pending.returnedId ? await adapter.getTicket(pending.returnedId) : null;
					if (!jiraTicket && initialPendingCreates.has(pending.correlationId) && adapter.findTicketByCorrelation) {
						jiraTicket = await adapter.findTicketByCorrelation(pending.correlationId);
					}
					if (!jiraTicket) jiraTicket = await adapter.createTicket(pending.payload, pending.correlationId);
					result.nextSyncState.mappings[pending.localId] = {
						jiraId: jiraTicket.id,
						fieldHashes: hashTicketFields(pending.payload)
					};
				} else if (pending.action === "update" || pending.action === "status") {
					if (!mapping) throw new Error(`Missing Jira mapping for Local ticket ${pending.localId}`);
					const jiraTicket = await adapter.getTicket(mapping.jiraId);
					if (!jiraTicket) throw new Error(`Mapped Jira ticket ${mapping.jiraId} is unavailable`);
					const resolved = resolveConflicts(pending, mapping, jiraTicket, true);
					if (resolved.blocked) {
						pendingToKeep.push(pending, ...operations.slice(index + 1));
						result.nextSyncState.pendingOperations = pendingToKeep;
						return { conflict: true, outage: false };
					}
					const changed = Object.entries(resolved.payload).some(([key, value]) => hashField(value) !== hashField(jiraTicket[key]));
					if (changed) await adapter.updateTicket(mapping.jiraId, resolved.payload);
					mapping.fieldHashes = {
						...mapping.fieldHashes,
						...hashTicketFields(resolved.payload)
					};
				} else if (pending.action === "comment") {
					if (!mapping) throw new Error(`Missing Jira mapping for Local ticket ${pending.localId}`);
					await adapter.addComment(mapping.jiraId, pending.payload.text);
				}
			} catch {
				pendingToKeep.push(pending, ...operations.slice(index + 1));
				result.nextSyncState.pendingOperations = pendingToKeep;
				return { conflict: false, outage: true };
			}
		}
		result.nextSyncState.pendingOperations = pendingToKeep;
		return { conflict: false, outage: false };
	};

	const before = await reconcilePending();
	if (before.conflict || !operation) return result;

	const effectiveOperation = {
		...operation,
		payload: sanitizePayload(operation.payload)
	};
	const mapping = result.nextSyncState.mappings[effectiveOperation.localId];
	if (!before.outage && mapping) {
		try {
			const jiraTicket = await adapter.getTicket(mapping.jiraId);
			if (jiraTicket) {
				const resolved = resolveConflicts(effectiveOperation, mapping, jiraTicket, false);
				if (resolved.blocked) return result;
				effectiveOperation.payload = resolved.payload;
			}
		} catch {
			// Jira outages degrade synchronization, but do not block the Local operation.
		}
	}

	if (typeof operation.perform === "function") {
		const performedStore = await operation.perform(result.nextLocalStore, effectiveOperation);
		if (!performedStore || typeof performedStore !== "object") {
			throw new TypeError("Tracker operation perform() must return the resulting Local store.");
		}
		result.nextLocalStore = performedStore;
	} else if (effectiveOperation.action === "comment") {
		const current = result.nextLocalStore[effectiveOperation.localId] || {
			id: effectiveOperation.localId,
			comments: [],
			localMetadata: {}
		};
		const comments = [...(current.comments || []), {
			id: `c-${hashField({
				localId: effectiveOperation.localId,
				text: effectiveOperation.payload.text,
				count: current.comments?.length || 0
			}).slice(0, 12)}`,
			text: effectiveOperation.payload.text
		}];
		result.nextLocalStore[effectiveOperation.localId] = { ...current, comments };
	} else {
		mergeLocalFields(effectiveOperation.localId, effectiveOperation.payload);
	}

	result.nextSyncState.pendingOperations.push({
		correlationId: hashField({
			localId: effectiveOperation.localId,
			action: effectiveOperation.action,
			payload: effectiveOperation.payload
		}),
		localId: effectiveOperation.localId,
		action: effectiveOperation.action,
		payload: effectiveOperation.payload
	});
	await reconcilePending();
	return result;
}

export function hashTicketFields(fields) {
	const hashes = {};
	for (const [key, value] of Object.entries(fields)) {
		hashes[key] = hashField(value);
	}
	return hashes;
}
