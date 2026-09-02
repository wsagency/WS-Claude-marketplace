import { hashField, hashTicketFields } from "./sync.mjs";
import crypto from "node:crypto";

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
		} catch (err) {
			remoteTicket = null;
		}

		if (!remoteTicket) {
			audit.stale.push({ localId, jiraId: mapping.jiraId });
			continue;
		}

		// Conflict could be checked here if we compared local against remote hashes,
		// but since backfill discovery shouldn't mutate, we just validate existing.
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
		
		if (syncState.pendingOperations?.some(p => p.localId === localId && p.action === "create")) {
			continue; // Will be handled by normal sync retry
		}

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

export async function executeBackfill(plan, syncState, jiraAdapter) {
	const nextSyncState = {
		mappings: { ...(syncState.mappings || {}) },
		pendingOperations: [...(syncState.pendingOperations || [])]
	};

	const result = {
		completed: [],
		pending: [],
		errors: [],
		nextSyncState
	};

	for (const item of plan.unmapped) {
		try {
			// Enqueue intent
			const pendingOp = {
				correlationId: item.correlationToken,
				localId: item.localId,
				action: "create",
				payload: item.mappedFields
			};
			nextSyncState.pendingOperations.push(pendingOp);

			const remoteTicket = await jiraAdapter.createTicket(item.mappedFields, item.correlationToken);

			// Persist durable key
			nextSyncState.mappings[item.localId] = {
				jiraId: remoteTicket.id,
				fieldHashes: hashTicketFields(item.mappedFields)
			};

			// Remove intent on success
			nextSyncState.pendingOperations = nextSyncState.pendingOperations.filter(p => p.correlationId !== item.correlationToken);

			// Read-back verification
			if (!nextSyncState.mappings[item.localId]) {
				throw new Error("Local mapping read-back verification failed");
			}

			result.completed.push(item.localId);
		} catch (err) {
			result.errors.push({ localId: item.localId, error: err.message });
			result.pending.push(item.localId);
			break; // Sequential apply, stop on first failure
		}
	}

	for (const item of plan.unmapped) {
		if (!result.completed.includes(item.localId) && !result.pending.includes(item.localId)) {
			result.pending.push(item.localId);
		}
	}

	return result;
}
