import crypto from "node:crypto";
import { validateCanonicalConfigObject } from "./config.mjs";

export const MAPPED_TICKET_FIELDS = Object.freeze([
	"title",
	"description",
	"acceptanceCriteria",
	"status",
	"priority",
	"type",
	"comments",
]);

export function hashField(value) {
	if (value === undefined || value === null) return "hash_empty";
	return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function sanitizeTicketFields(fields) {
	const sanitized = {};
	for (const field of MAPPED_TICKET_FIELDS) {
		if (Object.hasOwn(fields || {}, field)) sanitized[field] = fields[field];
	}
	return sanitized;
}
function sanitizeOperationPayload(action, payload) {
	if (action === "comment") return { text: payload?.text };
	if (action === "status") return { status: payload?.status };
	return sanitizeTicketFields(payload);
}


function cloneLocalStore(store) {
	return Object.fromEntries(Object.entries(store || {}).map(([localId, ticket]) => [
		localId,
		structuredClone(ticket),
	]));
}

function cloneSyncState(state) {
	return {
		mappings: Object.fromEntries(Object.entries(state?.mappings || {}).map(([localId, mapping]) => [
			localId,
			{ ...mapping, fieldHashes: { ...(mapping.fieldHashes || {}) } },
		])),
		pendingOperations: (state?.pendingOperations || []).map(pending => ({
			...pending,
			payload: structuredClone(sanitizeOperationPayload(pending.action, pending.payload)),
		})),
	};
}

function pendingMatches(candidate, expected) {
	return candidate.correlationId === expected.correlationId &&
		candidate.localId === expected.localId &&
		candidate.action === expected.action &&
		hashField(candidate.payload) === hashField(expected.payload);
}

class DurabilityError extends Error {
	constructor(message, cause) {
		super(message, { cause });
		this.name = "DurabilityError";
	}
}

export async function runTrackerOperation({
	config,
	localStore,
	syncState,
	operation,
	jiraAdapter,
	persistence,
	conflictChoices = [],
}) {
	const result = {
		nextLocalStore: cloneLocalStore(localStore),
		nextSyncState: cloneSyncState(syncState),
		externalCallLog: [],
		blockers: [],
		conflicts: [],
		readiness: { ready: true },
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
	const requiredPersistence = ["persistSyncState", "readSyncState", "persistLocalStore", "readLocalStore"];
	const missingPersistence = requiredPersistence.filter(name => typeof persistence?.[name] !== "function");
	if (missingPersistence.length > 0) {
		result.readiness = {
			ready: false,
			reason: `Durable Local/Jira synchronization requires ${missingPersistence.join(", ")}.`,
		};
		return result;
	}
	if (typeof jiraAdapter?.findTicketByCorrelation !== "function") {
		result.readiness = { ready: false, reason: "The Jira adapter must support correlation recovery." };
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
		findTicketByCorrelation: async correlationId => {
			logCall("findTicketByCorrelation", { correlationId });
			return jiraAdapter.findTicketByCorrelation(correlationId);
		},
		createTicket: async (fields, correlationId) => {
			logCall("createTicket", { fields, correlationId });
			return jiraAdapter.createTicket(fields, correlationId);
		},
		updateTicket: async (id, fields) => {
			logCall("updateTicket", { id, fields });
			return jiraAdapter.updateTicket(id, fields);
		},
		updateStatus: async (id, status) => {
			logCall("updateStatus", { id, status });
			if (typeof jiraAdapter.updateStatus !== "function") {
				throw new Error("The Jira adapter does not support status transitions.");
			}
			return jiraAdapter.updateStatus(id, status);
		},
		addComment: async (id, text) => {
			logCall("addComment", { id, text });
			return jiraAdapter.addComment(id, text);
		},
	};

	const replaceSyncState = state => {
		const cloned = cloneSyncState(state);
		result.nextSyncState.mappings = cloned.mappings;
		result.nextSyncState.pendingOperations = cloned.pendingOperations;
	};
	const replaceLocalStore = store => {
		result.nextLocalStore = cloneLocalStore(store);
	};
	const persistSyncAndReadBack = async verify => {
		try {
			await persistence.persistSyncState(cloneSyncState(result.nextSyncState));
			const persisted = cloneSyncState(await persistence.readSyncState());
			if (!verify(persisted)) throw new Error("read-back did not contain the expected state");
			replaceSyncState(persisted);
		} catch (error) {
			throw new DurabilityError("Durable sync-state read-back verification failed.", error);
		}
	};
	const persistLocalAndReadBack = async verify => {
		try {
			await persistence.persistLocalStore(cloneLocalStore(result.nextLocalStore));
			const persisted = cloneLocalStore(await persistence.readLocalStore());
			if (!verify(persisted)) throw new Error("read-back did not contain the expected Local state");
			replaceLocalStore(persisted);
		} catch (error) {
			throw new DurabilityError("Durable Local-store read-back verification failed.", error);
		}
	};
	const failDurability = error => {
		result.readiness = { ready: false, reason: error.message };
		result.blockers.push(error.message);
	};

	const mergeLocalFields = (localId, payload) => {
		const current = result.nextLocalStore[localId] || { id: localId, comments: [], localMetadata: {} };
		result.nextLocalStore[localId] = { ...current, ...payload };
	};
	const recordConflict = (localId, field, localValue, jiraValue) => {
		if (result.conflicts.some(conflict => conflict.localId === localId && conflict.field === field)) return;
		result.conflicts.push({ localId, field, localValue, jiraValue });
		result.blockers.push(`Conflict on ${field}`);
	};
	const conflictChoice = (localId, field) =>
		conflictChoices.find(candidate => candidate.localId === localId && candidate.field === field);

	const inspectMappedTicket = async (localId, mapping, jiraTicket, proposedPayload = {}) => {
		const localTicket = result.nextLocalStore[localId] || { id: localId };
		const pulled = {};
		const alignedHashes = {};
		let blocked = false;

		for (const field of MAPPED_TICKET_FIELDS) {
			const localValue = Object.hasOwn(proposedPayload, field) ? proposedPayload[field] : localTicket[field];
			const jiraValue = jiraTicket[field];
			const oldHash = mapping.fieldHashes?.[field] || "hash_empty";
			const localHash = hashField(localValue);
			const jiraHash = hashField(jiraValue);
			const localChanged = localHash !== oldHash;
			const jiraChanged = jiraHash !== oldHash;

			if (localChanged && jiraChanged && localHash !== jiraHash) {
				const choice = conflictChoice(localId, field);
				if (!choice) {
					recordConflict(localId, field, localValue, jiraValue);
					blocked = true;
					continue;
				}
				if (choice.resolution === "jira") {
					proposedPayload[field] = jiraValue;
					pulled[field] = jiraValue;
					alignedHashes[field] = jiraHash;
				} else if (choice.resolution === "manual") {
					proposedPayload[field] = choice.manualValue;
				}
				continue;
			}

			if (jiraChanged && !localChanged) {
				pulled[field] = jiraValue;
				alignedHashes[field] = jiraHash;
			} else if (jiraChanged && localHash === jiraHash) {
				alignedHashes[field] = jiraHash;
			}
		}

		if (blocked) return { blocked: true, payload: proposedPayload };
		if (Object.keys(pulled).length > 0) {
			mergeLocalFields(localId, pulled);
			await persistLocalAndReadBack(store =>
				Object.entries(pulled).every(([field, value]) => hashField(store[localId]?.[field]) === hashField(value))
			);
		}
		if (Object.keys(alignedHashes).length > 0 || mapping.jiraVersion !== jiraTicket.version) {
			mapping.fieldHashes = { ...mapping.fieldHashes, ...alignedHashes };
			mapping.jiraVersion = jiraTicket.version;
			await persistSyncAndReadBack(state => {
				const persisted = state.mappings[localId];
				return persisted?.jiraVersion === jiraTicket.version &&
					Object.entries(alignedHashes).every(([field, fieldHash]) => persisted.fieldHashes?.[field] === fieldHash);
			});
		}
		return { blocked: false, payload: proposedPayload };
	};

	const persistIntent = async pending => {
		const existing = result.nextSyncState.pendingOperations.find(candidate =>
			candidate.correlationId === pending.correlationId
		);
		if (!existing) result.nextSyncState.pendingOperations.push(pending);
		await persistSyncAndReadBack(state =>
			state.pendingOperations.some(candidate => pendingMatches(candidate, pending))
		);
		return result.nextSyncState.pendingOperations.find(candidate => candidate.correlationId === pending.correlationId);
	};
	const persistReturned = async (pending, returnedId, returnedVersion) => {
		const correlationId = pending.correlationId;
		const current = result.nextSyncState.pendingOperations.find(candidate =>
			candidate.correlationId === correlationId
		);
		if (!current) throw new DurabilityError("Pending operation disappeared before its Jira result was journaled.");
		current.returnedId = returnedId;
		current.returnedVersion = returnedVersion;
		await persistSyncAndReadBack(state =>
			state.pendingOperations.some(candidate =>
				candidate.correlationId === correlationId &&
				candidate.returnedId === returnedId &&
				candidate.returnedVersion === returnedVersion
			)
		);
		return result.nextSyncState.pendingOperations.find(candidate => candidate.correlationId === correlationId);
	};
	const finishPending = async (pending, mapping, fieldHashes = {}) => {
		result.nextSyncState.mappings[pending.localId] = {
			...mapping,
			fieldHashes: {
				...(result.nextSyncState.mappings[pending.localId]?.fieldHashes || {}),
				...fieldHashes,
			},
		};
		result.nextSyncState.pendingOperations = result.nextSyncState.pendingOperations.filter(candidate =>
			candidate.correlationId !== pending.correlationId
		);
		await persistSyncAndReadBack(state => {
			const persisted = state.mappings[pending.localId];
			return persisted?.jiraId === mapping.jiraId &&
				persisted?.jiraVersion === mapping.jiraVersion &&
				Object.entries(fieldHashes).every(([field, fieldHash]) => persisted.fieldHashes?.[field] === fieldHash) &&
				!state.pendingOperations.some(candidate => candidate.correlationId === pending.correlationId);
		});
	};

	const reconcilePending = async () => {
		while (result.nextSyncState.pendingOperations.length > 0) {
			let pending = result.nextSyncState.pendingOperations[0];
			try {
				let mapping = result.nextSyncState.mappings[pending.localId];
				if (pending.action === "create") {
					pending = await persistIntent(pending);
					let jiraTicket = pending.returnedId ? await adapter.getTicket(pending.returnedId) : null;
					if (!jiraTicket) jiraTicket = await adapter.findTicketByCorrelation(pending.correlationId);
					if (!jiraTicket) jiraTicket = await adapter.createTicket(pending.payload, pending.correlationId);
					if (!jiraTicket?.id || jiraTicket.version === undefined) {
						throw new Error("Jira create or recovery did not return an identity and version.");
					}
					pending = await persistReturned(pending, jiraTicket.id, jiraTicket.version);
					await finishPending(pending, {
						jiraId: jiraTicket.id,
						jiraVersion: jiraTicket.version,
					}, hashTicketFields(pending.payload));
					continue;
				}

				if (!mapping) throw new Error(`Missing Jira mapping for Local ticket ${pending.localId}`);
				pending = await persistIntent(pending);
				mapping = result.nextSyncState.mappings[pending.localId];
				const jiraTicket = await adapter.getTicket(mapping.jiraId);
				if (!jiraTicket) throw new Error(`Mapped Jira ticket ${mapping.jiraId} is unavailable`);

				if (pending.action === "update" || pending.action === "status") {
					const inspected = await inspectMappedTicket(pending.localId, mapping, jiraTicket, { ...pending.payload });
					if (inspected.blocked) return { conflict: true, outage: false, durabilityFailure: false };
					const payload = inspected.payload;
					const changed = Object.entries(payload).some(([field, value]) => hashField(value) !== hashField(jiraTicket[field]));
					let updatedTicket = jiraTicket;
					if (changed) {
						updatedTicket = pending.action === "status"
							? await adapter.updateStatus(mapping.jiraId, payload.status)
							: await adapter.updateTicket(mapping.jiraId, payload);
						if (!updatedTicket?.id || updatedTicket.version === undefined) {
							updatedTicket = await adapter.getTicket(mapping.jiraId);
						}
						if (!updatedTicket?.id || updatedTicket.version === undefined) {
							throw new Error(`Jira did not return a version for ${mapping.jiraId}`);
						}
						pending = await persistReturned(pending, updatedTicket.id, updatedTicket.version);
					}
					mergeLocalFields(pending.localId, payload);
					await persistLocalAndReadBack(store =>
						Object.entries(payload).every(([field, value]) => hashField(store[pending.localId]?.[field]) === hashField(value))
					);
					await finishPending(pending, {
						jiraId: mapping.jiraId,
						jiraVersion: updatedTicket.version,
					}, hashTicketFields(payload));
					continue;
				}

				if (pending.action === "comment") {
					let updatedTicket;
					if (pending.returnedId) {
						updatedTicket = await adapter.getTicket(mapping.jiraId);
						const returnedComment = updatedTicket?.comments?.some(comment => comment.id === pending.returnedId);
						if (!returnedComment) {
							throw new Error(`Returned Jira comment ${pending.returnedId} is unavailable on ${mapping.jiraId}`);
						}
					} else {
						const comment = await adapter.addComment(mapping.jiraId, pending.payload.text);
						if (!comment?.id || comment.version === undefined) {
							throw new Error(`Jira did not return a comment identity and version for ${mapping.jiraId}`);
						}
						pending = await persistReturned(pending, comment.id, comment.version);
						updatedTicket = await adapter.getTicket(mapping.jiraId);
					}
					if (!updatedTicket?.id || updatedTicket.version === undefined) {
						throw new Error(`Jira did not return a version for ${mapping.jiraId}`);
					}
					const comments = updatedTicket.comments ?? [];
					mergeLocalFields(pending.localId, { comments });
					await persistLocalAndReadBack(store =>
						hashField(store[pending.localId]?.comments) === hashField(comments)
					);
					await finishPending(pending, {
						jiraId: mapping.jiraId,
						jiraVersion: updatedTicket.version,
					}, { comments: hashField(comments) });
					continue;
				}
			} catch (error) {
				if (error instanceof DurabilityError) {
					failDurability(error);
					return { conflict: false, outage: false, durabilityFailure: true };
				}
				return { conflict: false, outage: true, durabilityFailure: false };
			}
		}
		return { conflict: false, outage: false, durabilityFailure: false };
	};

	const before = await reconcilePending();
	if (before.conflict || before.durabilityFailure || !operation) return result;

	const effectiveOperation = {
		...operation,
		payload: sanitizeOperationPayload(operation.action, operation.payload),
	};
	const mapping = result.nextSyncState.mappings[effectiveOperation.localId];
	if (!before.outage && mapping) {
		try {
			const jiraTicket = await adapter.getTicket(mapping.jiraId);
			if (jiraTicket) {
				const inspected = await inspectMappedTicket(
					effectiveOperation.localId,
					mapping,
					jiraTicket,
					effectiveOperation.action === "comment" ? {} : effectiveOperation.payload,
				);
				if (inspected.blocked) return result;
				effectiveOperation.payload = effectiveOperation.action === "comment"
					? effectiveOperation.payload
					: inspected.payload;
			}
		} catch (error) {
			if (error instanceof DurabilityError) {
				failDurability(error);
				return result;
			}
			// Jira outages degrade synchronization, but do not block the Local operation.
		}
	}

	if (typeof operation.perform === "function") {
		const performedStore = await operation.perform(result.nextLocalStore, effectiveOperation);
		if (!performedStore || typeof performedStore !== "object") {
			throw new TypeError("Tracker operation perform() must return the resulting Local store.");
		}
		result.nextLocalStore = cloneLocalStore(performedStore);
	} else if (effectiveOperation.action === "comment") {
		const current = result.nextLocalStore[effectiveOperation.localId] || {
			id: effectiveOperation.localId,
			comments: [],
			localMetadata: {},
		};
		const comments = [...(current.comments || []), {
			id: `c-${hashField({
				localId: effectiveOperation.localId,
				text: effectiveOperation.payload.text,
				count: current.comments?.length || 0,
			}).slice(0, 12)}`,
			text: effectiveOperation.payload.text,
		}];
		result.nextLocalStore[effectiveOperation.localId] = { ...current, comments };
	} else {
		mergeLocalFields(effectiveOperation.localId, effectiveOperation.payload);
	}

	try {
		const expectedLocalHash = hashField(result.nextLocalStore[effectiveOperation.localId]);
		await persistLocalAndReadBack(store =>
			hashField(store[effectiveOperation.localId]) === expectedLocalHash
		);
		const pending = {
			correlationId: hashField({
				localId: effectiveOperation.localId,
				action: effectiveOperation.action,
				payload: effectiveOperation.payload,
			}),
			localId: effectiveOperation.localId,
			action: effectiveOperation.action,
			payload: effectiveOperation.payload,
		};
		await persistIntent(pending);
	} catch (error) {
		if (error instanceof DurabilityError) {
			failDurability(error);
			return result;
		}
		throw error;
	}

	await reconcilePending();
	return result;
}

export function hashTicketFields(fields) {
	const hashes = {};
	for (const [key, value] of Object.entries(sanitizeTicketFields(fields))) {
		hashes[key] = hashField(value);
	}
	return hashes;
}
