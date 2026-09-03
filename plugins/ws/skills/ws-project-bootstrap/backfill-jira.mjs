import {
	createJiraCorrelation,
	parseJiraCorrelationId,
	repositorySourceLink,
	resolveJiraCorrelation,
	resolveRepositoryIdentity,
	validateRepositoryIdentity,
} from "./correlation-identity.mjs";
import { MAPPED_TICKET_FIELDS, hashField, hashTicketFields, sanitizeTicketFields } from "./sync.mjs";

function samePendingOperation(left, right) {
	if (!left || !right) return false;
	return left.correlationId === right.correlationId &&
		left.requestCorrelationId === right.requestCorrelationId &&
		left.localId === right.localId &&
		left.action === right.action &&
		hashField(left.payload) === hashField(right.payload) &&
		hashField(left.localPatch || {}) === hashField(right.localPatch || {}) &&
		(left.phase ?? "local_applied") === (right.phase ?? "local_applied") &&
		left.localBeforeHash === right.localBeforeHash &&
		left.requiresLocalVerification === right.requiresLocalVerification &&
		left.returnedId === right.returnedId &&
		left.returnedVersion === right.returnedVersion;
}

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
			const previousHash = mapping.fieldHashes?.[field] || "hash_empty";
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

export function planBackfill(localTickets, syncState, config, repository) {
	const repositoryIdentity = resolveRepositoryIdentity({
		root: repository?.root,
		verifiedOrigin: repository?.verifiedOrigin,
		persistedIdentity: syncState.repositoryIdentity,
	});
	const plan = {
		unmapped: [],
		project: config?.jira?.project || "PROJ",
		defaultType: config?.jira?.default_issue_type || "Task",
		repositoryIdentity,
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
		const sanitizedFields = sanitizeTicketFields(mappedFields);
		const unsupportedFields = Object.keys(ticket.localMetadata || {});
		const pendingCreates = syncState.pendingOperations?.filter(operation =>
			operation.action === "create" && operation.localId === localId
		) ?? [];
		if (pendingCreates.length > 1) {
			throw new Error(`Pending Jira create correlation is ambiguous for ${localId}.`);
		}
		const pending = pendingCreates[0];
		let correlation;
		let previousCorrelationId;
		if (pending) {
			if (parseJiraCorrelationId(pending.correlationId)) {
				correlation = resolveJiraCorrelation(repositoryIdentity, plan.project, pending.correlationId);
			} else if (/^[a-f0-9]{64}$/i.test(pending.correlationId)) {
				previousCorrelationId = pending.correlationId.toLowerCase();
				correlation = createJiraCorrelation(repositoryIdentity, plan.project, previousCorrelationId);
			} else {
				throw new Error(`Pending Jira create for ${localId} does not have a recoverable correlation identity.`);
			}
		} else {
			const sourceCorrelationId = hashField({ localId, action: "create", payload: sanitizedFields });
			correlation = createJiraCorrelation(repositoryIdentity, plan.project, sourceCorrelationId);
		}

		plan.unmapped.push({
			localId,
			proposedProject: plan.project,
			proposedType: mappedFields.type,
			mappedFields,
			unsupportedFields,
			sourceLink: repositorySourceLink(repositoryIdentity, localId),
			correlationId: correlation.id,
			correlationToken: correlation.token,
			correlationMarker: correlation.marker,
			...(previousCorrelationId ? { previousCorrelationId } : {}),
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
	const repositoryIdentity = validateRepositoryIdentity(plan.repositoryIdentity);
	if (syncState.repositoryIdentity && syncState.repositoryIdentity !== repositoryIdentity) {
		throw new Error("Backfill sync state belongs to a different repository.");
	}

	const cloneSyncState = state => ({
		repositoryIdentity: state.repositoryIdentity ?? repositoryIdentity,
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
		nextSyncState.repositoryIdentity = persisted.repositoryIdentity;
		nextSyncState.mappings = persisted.mappings;
		nextSyncState.pendingOperations = persisted.pendingOperations;
		if (persisted.repositoryIdentity !== repositoryIdentity || !verify(persisted)) {
			throw new Error("Durable sync-state read-back verification failed");
		}
	};

	for (const item of plan.unmapped) {
		try {
			const correlation = resolveJiraCorrelation(repositoryIdentity, plan.project, item.correlationId);
			if (
				correlation.id !== item.correlationId
				|| correlation.token !== item.correlationToken
				|| correlation.marker !== item.correlationMarker
			) {
				throw new Error(`Backfill correlation ownership verification failed for ${item.localId}.`);
			}
			const pendingCreates = nextSyncState.pendingOperations.filter(operation =>
				operation.action === "create" && operation.localId === item.localId
			);
			if (pendingCreates.length > 1) {
				throw new Error(`Pending Jira create correlation is ambiguous for ${item.localId}.`);
			}
			if (
				pendingCreates.length === 1
				&& ![item.correlationId, item.previousCorrelationId].includes(pendingCreates[0].correlationId)
			) {
				throw new Error(`Pending Jira create correlation changed for ${item.localId}.`);
			}
			if (item.previousCorrelationId && item.previousCorrelationId !== item.correlationId) {
				const legacyIndexes = nextSyncState.pendingOperations
					.map((operation, index) => ({ operation, index }))
					.filter(({ operation }) =>
						operation.action === "create" &&
						operation.localId === item.localId &&
						operation.correlationId === item.previousCorrelationId
					);
				const canonicalMatches = nextSyncState.pendingOperations.filter(operation =>
					operation.action === "create" &&
					operation.localId === item.localId &&
					operation.correlationId === item.correlationId
				);
				if (legacyIndexes.length > 1 || canonicalMatches.length > 1 || (legacyIndexes.length && canonicalMatches.length)) {
					throw new Error(`Pending Jira create correlation is ambiguous for ${item.localId}.`);
				}
				if (legacyIndexes.length === 1) {
					if (nextSyncState.pendingOperations.some((operation, index) =>
						index !== legacyIndexes[0].index && operation.correlationId === item.correlationId
					)) {
						throw new Error(`Pending Jira create correlation collides for ${item.localId}.`);
					}
					const legacy = legacyIndexes[0].operation;
					const replacement = {
						...legacy,
						correlationId: item.correlationId,
						requestCorrelationId: legacy.requestCorrelationId ?? item.previousCorrelationId,
					};
					nextSyncState.pendingOperations[legacyIndexes[0].index] = replacement;
					await persistAndReadBack(state => {
						const migrated = state.pendingOperations.find(operation =>
							operation.action === "create" &&
							operation.localId === item.localId &&
							operation.correlationId === item.correlationId
						);
						return samePendingOperation(migrated, replacement) &&
							!state.pendingOperations.some(operation =>
								operation.correlationId === item.previousCorrelationId
							);
					});
				} else if (canonicalMatches.length === 0) {
					throw new Error(`Pending Jira create correlation disappeared for ${item.localId}.`);
				}
			}
			if (nextSyncState.mappings[item.localId]) {
				result.completed.push(item.localId);
				continue;
			}

			const mappedFields = sanitizeTicketFields(item.mappedFields);
			const mappedHashes = hashTicketFields(mappedFields);
			let pending = nextSyncState.pendingOperations.find(operation =>
				operation.action === "create" &&
				operation.localId === item.localId &&
				operation.correlationId === item.correlationId
			);
			if (!pending) {
				pending = {
					correlationId: item.correlationId,
					localId: item.localId,
					action: "create",
					payload: mappedFields,
					phase: "local_applied"
				};
				nextSyncState.pendingOperations.push(pending);
				await persistAndReadBack(state => state.pendingOperations.some(operation =>
					operation.localId === item.localId &&
					operation.correlationId === item.correlationId &&
					hashField(operation.payload) === hashField(mappedFields)
				));
				pending = nextSyncState.pendingOperations.find(operation => operation.correlationId === item.correlationId);
			}

			let remoteTicket = pending.returnedId ? await jiraAdapter.getTicket(pending.returnedId) : null;
			if (!remoteTicket) remoteTicket = await jiraAdapter.findTicketByCorrelation(item.correlationId);
			if (!remoteTicket) {
				await persistAndReadBack(state => state.pendingOperations.some(operation =>
					operation.localId === item.localId &&
					operation.correlationId === item.correlationId &&
					hashField(operation.payload) === hashField(mappedFields)
				));
				pending = nextSyncState.pendingOperations.find(operation => operation.correlationId === item.correlationId);
				remoteTicket = await jiraAdapter.createTicket(mappedFields, item.correlationId);
			}
			if (!remoteTicket?.id || remoteTicket.version === undefined) {
				throw new Error("Jira create or recovery did not return an identity and version");
			}

			pending.returnedId = remoteTicket.id;
			pending.returnedVersion = remoteTicket.version;
			await persistAndReadBack(state => state.pendingOperations.some(operation =>
				operation.correlationId === item.correlationId &&
				operation.returnedId === remoteTicket.id &&
				operation.returnedVersion === remoteTicket.version
			));

			nextSyncState.mappings[item.localId] = {
				jiraId: remoteTicket.id,
				jiraVersion: remoteTicket.version,
				fieldHashes: mappedHashes
			};
			nextSyncState.pendingOperations = nextSyncState.pendingOperations.filter(operation =>
				operation.correlationId !== item.correlationId
			);
			await persistAndReadBack(state =>
				state.mappings[item.localId]?.jiraId === remoteTicket.id &&
				state.mappings[item.localId]?.jiraVersion === remoteTicket.version &&
				Object.entries(mappedHashes).every(([field, fieldHash]) =>
					state.mappings[item.localId]?.fieldHashes?.[field] === fieldHash
				) &&
				!state.pendingOperations.some(operation => operation.correlationId === item.correlationId)
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
