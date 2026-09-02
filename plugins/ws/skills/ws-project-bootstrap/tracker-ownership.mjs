import { createHash } from "node:crypto";
import { acceptConfirmedPartial, applyConfirmedPlan, createReconfigurePlan, resumeConfirmedPlan } from "./reconfigure.mjs";

const DISPOSITIONS = new Set(["preserve-as-history", "copy-selected", "copy-open", "copy-all", "cancel"]);
const SEMANTIC_FIELDS = Object.freeze(["title", "description", "acceptanceCriteria", "acceptance_criteria", "status", "comments", "priority", "type"]);
const LOCAL_ONLY_FIELDS = new Set(["localMetadata", "claim", "claims", "shares", "map", "mapPointer", "agentState"]);

export class TrackerOwnershipError extends Error {
	constructor(message, code) {
		super(message);
		this.code = code;
	}
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function stableSemanticFields(ticket) {
	return Object.fromEntries(SEMANTIC_FIELDS.filter(field => Object.hasOwn(ticket, field)).map(field => [field, ticket[field]]));
}

function remoteFingerprint(ticket) {
	return {
		identity: ticket.remoteIdentity || ticket.key || ticket.id,
		version: ticket.version ?? null,
		updatedAt: ticket.updatedAt ?? ticket.updated_at ?? null,
		mappedFieldHash: sha256(JSON.stringify(stableSemanticFields(ticket))),
	};
}

function sourceStores(localStore, choices) {
	const explicit = Array.isArray(choices.sourceStores) ? choices.sourceStores : [];
	const discovered = Object.values(localStore || {}).map(ticket => ticket.storeId).filter(Boolean);
	const candidates = [...explicit, ...discovered];
	const fallback = choices.sourceProject || choices.sourceTracker;
	return [...new Set(candidates.length > 0 ? candidates : fallback ? [fallback] : [])].sort();
}

function dispositionMap(stores, choices) {
	if (!Array.isArray(choices.dispositions) || choices.dispositions.length === 0) {
		throw new TrackerOwnershipError("An explicit disposition is required for every existing source store.", "ERR_MISSING_DISPOSITIONS");
	}
	const byStore = new Map();
	for (const entry of choices.dispositions) {
		if (!entry || typeof entry.storeId !== "string" || !DISPOSITIONS.has(entry.disposition)) {
			throw new TrackerOwnershipError("Every store disposition must name a store and a supported disposition.", "ERR_INVALID_DISPOSITION");
		}
		if (byStore.has(entry.storeId)) throw new TrackerOwnershipError(`Duplicate disposition for ${entry.storeId}.`, "ERR_DUPLICATE_DISPOSITION");
		byStore.set(entry.storeId, entry);
	}
	const missing = stores.filter(store => !byStore.has(store));
	if (missing.length > 0) throw new TrackerOwnershipError(`Missing explicit disposition for: ${missing.join(", ")}.`, "ERR_MISSING_DISPOSITIONS");
	if ([...byStore.values()].some(entry => entry.disposition === "cancel")) {
		throw new TrackerOwnershipError("Migration cancelled by user disposition; source ownership remains unchanged.", "ERR_MIGRATION_CANCELLED");
	}
	return byStore;
}

function ticketStore(ticket, choices) {
	return ticket.storeId || choices.sourceProject || choices.sourceTracker;
}

function shouldCopy(ticket, id, disposition) {
	if (disposition.disposition === "copy-all") return true;
	if (disposition.disposition === "copy-open") return !["closed", "done"].includes(ticket.status);
	if (disposition.disposition === "copy-selected") return (disposition.selectedItemIds || []).includes(id);
	return false;
}

function blockerReasons(id, ticket, syncState) {
	const reasons = [];
	if (ticket.localMetadata?.claimed || ticket.claimed === true) reasons.push("claimed local work");
	if ((syncState?.conflicts || []).some(conflict => conflict.localId === id && conflict.resolved !== true)) reasons.push("unresolved same-field conflict");
	if ((syncState?.pendingOperations || []).some(operation => operation.localId === id)) reasons.push("pending synchronization");
	return reasons;
}

function unsupportedFields(ticket) {
	const supported = new Set(["id", "key", "storeId", "remoteIdentity", "version", "updatedAt", "updated_at", "url", "sourceLink", ...SEMANTIC_FIELDS]);
	return Object.keys(ticket).filter(field => !supported.has(field) || LOCAL_ONLY_FIELDS.has(field)).sort();
}

function sourceLink(store, id, ticket) {
	return ticket.sourceLink || ticket.url || `tracker://${store}/${id}`;
}

function trackerSnapshot(localStore, choices) {
	const entries = {};
	for (const [id, ticket] of Object.entries(localStore || {})) {
		entries[`tracker-source:${ticketStore(ticket, choices)}:${id}`] = {
			kind: "state",
			fingerprint: remoteFingerprint(ticket),
		};
	}
	return {
		shape: choices.shape || "standalone",
		repositoryId: choices.repositoryId || "current",
		entries,
		repositories: choices.repositoryInventory,
	};
}

export function planTrackerOwnership({ config, localStore, syncState, choices }) {
	if (!choices) throw new TrackerOwnershipError("Tracker ownership choices are required.", "ERR_MISSING_CHOICES");
	if (!Array.isArray(choices.fields)) throw new TrackerOwnershipError("Concrete tracker/Jira field selection is required.", "ERR_MISSING_FIELD_SELECTION");
	const stores = sourceStores(localStore, choices);
	const dispositions = dispositionMap(stores, choices);
	const effects = [];
	const blockers = [];
	const copiedIds = [];
	const sourcePreservation = [];

	for (const [id, ticket] of Object.entries(localStore || {}).sort(([left], [right]) => left.localeCompare(right))) {
		const store = ticketStore(ticket, choices);
		if (!stores.includes(store)) continue;
		const disposition = dispositions.get(store);
		const fingerprint = remoteFingerprint(ticket);
		const preserveId = `preserve:tracker-source:${store}:${id}`;
		effects.push({
			id: preserveId,
			order: 2,
			phase: "prepare",
			target: `tracker-source:${store}:${id}`,
			kind: "state",
			classification: "PRESERVE",
			reason: "Preserve the source ticket, key, status, fields, and history without delete, close, move, reassignment, or stripping.",
			diff: "unchanged",
			fingerprint,
		});
		sourcePreservation.push({ store, id, disposition: disposition.disposition, sourceLink: sourceLink(store, id, ticket), fingerprint });

		if (!shouldCopy(ticket, id, disposition)) continue;
		const reasons = blockerReasons(id, ticket, syncState);
		const explicitlyExcluded = (choices.excludedItemIds || []).includes(id) || (choices.excludeBlocked === true && reasons.length > 0);
		if (reasons.length > 0) {
			if (explicitlyExcluded) {
				effects.push({
					id: `skip:tracker-copy:${store}:${id}`,
					order: 3,
					phase: "prepare",
					target: `tracker-copy:${store}:${id}`,
					kind: "state",
					classification: "SKIP",
					reason: `Explicitly excluded affected migration: ${reasons.join(", ")}.`,
					diff: "unchanged",
					fingerprint,
				});
				continue;
			}
			const effect = {
				id: `block:tracker-copy:${store}:${id}`,
				order: 3,
				phase: "prepare",
				target: `tracker-copy:${store}:${id}`,
				kind: "state",
				classification: "BLOCKING_CONFLICT",
				reason: `Affected migration blocked by ${reasons.join(", ")}.`,
				diff: "blocked",
				fingerprint,
			};
			effects.push(effect);
			blockers.push({ id: effect.id, target: effect.target, reason: effect.reason });
			continue;
		}

		const targetBinding = choices.targetProject || choices.targetTracker;
		const correlationToken = sha256(`tracker-copy:${store}:${id}:${choices.targetTracker}:${targetBinding}`);
		const createId = `prepare:remote:${choices.targetTracker}:${targetBinding}:copy:${store}:${id}`;
		copiedIds.push(createId);
		effects.push({
			id: createId,
			order: 5,
			phase: "prepare",
			target: `remote:${choices.targetTracker}:${targetBinding}:copy:${id}`,
			kind: "state",
			classification: "CREATE",
			reason: "Create a verified copy with deterministic correlation while preserving the source item.",
			diff: `copy ${store}/${id} -> ${choices.targetTracker}/${targetBinding}`,
			fingerprint: null,
			remoteFingerprint: choices.remoteFingerprints?.[id] ?? null,
			correlationToken,
			payload: {
				operation: "create_tracker_copy",
				external: true,
				correlationToken,
				sourceId: id,
				sourceStore: store,
				sourceLink: sourceLink(store, id, ticket),
				targetTracker: choices.targetTracker,
				targetProject: choices.targetProject || null,
				fields: stableSemanticFields(ticket),
				semanticLoss: unsupportedFields(ticket),
			},
		});
	}

	if (copiedIds.length > 0 || choices.sourceTracker !== choices.targetTracker || choices.sourceProject !== choices.targetProject) {
		effects.push({
			id: "cutover:tracker-ownership:activate",
			order: 20,
			phase: "cutover",
			target: "tracker:active-ownership",
			kind: "state",
			classification: "UPDATE",
			reason: "Switch canonical ownership and active mappings only after every selected copy identity is durable and verified.",
			diff: `${choices.sourceTracker}/${choices.sourceProject || "default"} -> ${choices.targetTracker}/${choices.targetProject || "default"}`,
			fingerprint: choices.ownershipFingerprint ?? null,
			dependencies: copiedIds,
			payload: {
				operation: "activate_tracker_ownership",
				sourceTracker: choices.sourceTracker,
				targetTracker: choices.targetTracker,
				sourceProject: choices.sourceProject || null,
				targetProject: choices.targetProject || null,
				preserveOldKeysAsInactiveHistory: true,
			},
		});
	}

	const normalizedChoices = { ...choices, values: choices.values || {} };
	const snapshot = trackerSnapshot(localStore, choices);
	const plan = createReconfigurePlan(config, snapshot, choices.machine || {}, normalizedChoices, {
		effects,
		blockers,
		dependencyClosure: copiedIds.map(effectId => ({ field: "tracker.primary", reason: "Ownership cutover depends on a verified copied identity.", resolution: "selected", effectId })),
		fieldDependencies: Object.fromEntries((choices.fields || []).map(field => [field, copiedIds])),
	});
	return { ...plan, stores, sourcePreservation };
}

export async function applyTrackerOwnership(context, { planHash, effects, adapters, injection = {} }) {
	const expected = planTrackerOwnership(context);
	if (expected.hash !== planHash || JSON.stringify(expected.effects) !== JSON.stringify(effects)) {
		throw new TrackerOwnershipError("The confirmed plan no longer matches current inputs.", "ERR_PLAN_MISMATCH");
	}
	return applyConfirmedPlan(expected, context, adapters, injection);
}

export async function resumeTrackerOwnership(context, { adapters, injection = {} }) {
	const expected = planTrackerOwnership(context);
	return resumeConfirmedPlan(expected, context, adapters, injection);
}

export async function acceptPartialTrackerOwnership(context, { adapters }) {
	const expected = planTrackerOwnership(context);
	return acceptConfirmedPartial(context.config, expected, context, adapters);
}
