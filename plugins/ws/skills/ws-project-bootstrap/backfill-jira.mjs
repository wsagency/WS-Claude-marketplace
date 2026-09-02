import { MAPPED_TICKET_FIELDS, hashField, hashTicketFields, sanitizeTicketFields } from "./sync.mjs";

export async function auditBackfill(localTickets, syncState, jiraAdapter) {
	const audit = {
		missing: [],
		stale: [],
		duplicated: [],
		conflicting: [],
		valid: []
	};

	const seenJiraIds = new Map();

	for (const [localId, mapping] of Object.entries(syncState.mappings || {})) {
		if (!localTickets[localId]) {
			audit.missing.push({ localId, jiraId: mapping.jiraId });
			continue;
		}

		if (seenJiraIds.has(mapping.jiraId)) {
			audit.duplicated.push({
				localId,
				jiraId: mapping.jiraId,
				otherLocalId: seenJiraIds.get(mapping.jiraId)
			});
			continue;
		}
		seenJiraIds.set(mapping.jiraId, localId);

		let remoteTicket;
		try {
			remoteTicket = await jiraAdapter.getTicket(mapping.jiraId);
		} catch {
			remoteTicket = null;
		}

		if (!remoteTicket) {
			audit.stale.push({ localId, jiraId: mapping.jiraId });
			continue;
		}

		const localTicket = localTickets[localId];
		const fields = MAPPED_TICKET_FIELDS.filter(field => {
			const localValue = localTicket[field];
			const jiraValue = remoteTicket[field];
			const localHash = hashField(localValue);
			const jiraHash = hashField(jiraValue);
			if (localHash === jiraHash) return false;
			const previousHash = mapping.fieldHashes?.[field];
			if (previousHash === undefined) return false;
			return localHash !== previousHash && jiraHash !== previousHash;
		});
		if (fields.length > 0) {
			audit.conflicting.push({ localId, jiraId: mapping.jiraId, fields });
			continue;
		}
		audit.valid.push({ localId, jiraId: mapping.jiraId });
	}

	return audit;
}

export function planBackfill(localTickets, syncState, config) {
	const plan = {
		unmapped: [],
		project: config?.jira?.project || "PROJ",
		defaultType: config?.jira?.default_issue_type || "Task",
	};

	for (const [localId, ticket] of Object.entries(localTickets)) {
		if (syncState.mappings?.[localId]) continue;

		const mappedFields = {
			title: ticket.title,
			description: ticket.description,
			acceptanceCriteria: ticket.acceptanceCriteria,
			status: ticket.status,
			priority: ticket.priority,
			type: ticket.type || plan.defaultType
		};
		
		const unsupportedFields = Object.keys(ticket.localMetadata || {});

		plan.unmapped.push({
			localId,
			proposedProject: plan.project,
			proposedType: mappedFields.type,
			mappedFields,
			unsupportedFields,
			sourceLink: `local://${localId}`,
			// Deterministic correlation token
			correlationToken: hashField(`${localId}:${plan.project}`)
		});
	}

	return plan;
}

export async function executeBackfill({ plan, syncState, jiraAdapter, persistence }) {
	if (!persistence || typeof persistence.persistSyncState !== "function" || typeof persistence.readSyncState !== "function") {
		throw new TypeError("Backfill requires durable persistSyncState and readSyncState callbacks.");
	}
	if (typeof jiraAdapter.findTicketByCorrelation !== "function") {
		throw new TypeError("Backfill Jira adapter must support correlation recovery.");
	}

	const cloneSyncState = state => ({
		mappings: Object.fromEntries(Object.entries(state.mappings || {}).map(([localId, mapping]) => [
			localId,
			{ ...mapping, fieldHashes: { ...(mapping.fieldHashes || {}) } }
		])),
		pendingOperations: (state.pendingOperations || []).map(pending => ({
			...pending,
			payload: { ...pending.payload }
		}))
	});
	const nextSyncState = cloneSyncState(syncState);
	const result = {
		completed: [],
		pending: [],
		errors: [],
		nextSyncState
	};

	const persistAndReadBack = async verify => {
		await persistence.persistSyncState(cloneSyncState(nextSyncState));
		const persisted = cloneSyncState(await persistence.readSyncState());
		nextSyncState.mappings = persisted.mappings;
		nextSyncState.pendingOperations = persisted.pendingOperations;
		if (!verify(persisted)) throw new Error("Durable sync-state read-back verification failed");
	};

	for (const item of plan.unmapped) {
		try {
			if (nextSyncState.mappings[item.localId]) {
				result.completed.push(item.localId);
				continue;
			}

			const mappedFields = sanitizeTicketFields(item.mappedFields);
			const mappedHashes = hashTicketFields(mappedFields);
			let pending = nextSyncState.pendingOperations.find(operation =>
				operation.action === "create" &&
				operation.localId === item.localId &&
				operation.correlationId === item.correlationToken
			);
			if (!pending) {
				pending = {
					correlationId: item.correlationToken,
					localId: item.localId,
					action: "create",
					payload: mappedFields
				};
				nextSyncState.pendingOperations.push(pending);
				await persistAndReadBack(state => state.pendingOperations.some(operation =>
					operation.localId === item.localId &&
					operation.correlationId === item.correlationToken &&
					hashField(operation.payload) === hashField(mappedFields)
				));
				pending = nextSyncState.pendingOperations.find(operation => operation.correlationId === item.correlationToken);
			}

			let remoteTicket = pending.returnedId ? await jiraAdapter.getTicket(pending.returnedId) : null;
			if (!remoteTicket) remoteTicket = await jiraAdapter.findTicketByCorrelation(item.correlationToken);
			if (!remoteTicket) {
				await persistAndReadBack(state => state.pendingOperations.some(operation =>
					operation.localId === item.localId &&
					operation.correlationId === item.correlationToken &&
					hashField(operation.payload) === hashField(mappedFields)
				));
				pending = nextSyncState.pendingOperations.find(operation => operation.correlationId === item.correlationToken);
				remoteTicket = await jiraAdapter.createTicket(mappedFields, item.correlationToken);
			}
			if (!remoteTicket?.id || remoteTicket.version === undefined) {
				throw new Error("Jira create or recovery did not return an identity and version");
			}

			pending.returnedId = remoteTicket.id;
			pending.returnedVersion = remoteTicket.version;
			await persistAndReadBack(state => state.pendingOperations.some(operation =>
				operation.correlationId === item.correlationToken &&
				operation.returnedId === remoteTicket.id &&
				operation.returnedVersion === remoteTicket.version
			));

			nextSyncState.mappings[item.localId] = {
				jiraId: remoteTicket.id,
				jiraVersion: remoteTicket.version,
				fieldHashes: mappedHashes
			};
			nextSyncState.pendingOperations = nextSyncState.pendingOperations.filter(operation =>
				operation.correlationId !== item.correlationToken
			);
			await persistAndReadBack(state =>
				state.mappings[item.localId]?.jiraId === remoteTicket.id &&
				state.mappings[item.localId]?.jiraVersion === remoteTicket.version &&
				Object.entries(mappedHashes).every(([field, fieldHash]) =>
					state.mappings[item.localId]?.fieldHashes?.[field] === fieldHash
				) &&
				!state.pendingOperations.some(operation => operation.correlationId === item.correlationToken)
			);

			result.completed.push(item.localId);
		} catch (err) {
			result.errors.push({ localId: item.localId, error: err.message });
			result.pending.push(item.localId);
			break;
		}
	}

	for (const item of plan.unmapped) {
		if (!result.completed.includes(item.localId) && !result.pending.includes(item.localId)) {
			result.pending.push(item.localId);
		}
	}

	return result;
}
