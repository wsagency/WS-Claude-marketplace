import { createHash } from "node:crypto";

export class TrackerOwnershipError extends Error {
	constructor(message, code) {
		super(message);
		this.code = code;
	}
}

export function planTrackerOwnership(config, localStore, syncState, choices) {
	if (!choices) {
		throw new TrackerOwnershipError("Tracker ownership choices are required.", "ERR_MISSING_CHOICES");
	}
	if (!choices.dispositions || choices.dispositions.length === 0) {
		throw new TrackerOwnershipError("Dispositions for source stores are required.", "ERR_MISSING_DISPOSITIONS");
	}
	if (choices.dispositions.some(d => d.disposition === "cancel")) {
		throw new TrackerOwnershipError("Migration cancelled by user disposition.", "ERR_MIGRATION_CANCELLED");
	}

	const effects = [];
	const blockers = [];
	const { sourceTracker, targetTracker, sourceProject, targetProject, excludeBlocked } = choices;
	
	// We gather all local issues that belong to the source tracker/project.
	// For simplicity, assume all keys starting with sourceProject belong to it, or all if no sourceProject is specified.
	const prefix = sourceProject ? `${sourceProject}-` : "";
	
	for (const [id, ticket] of Object.entries(localStore || {})) {
		if (prefix && !id.startsWith(prefix)) continue;
		
		// Determine blocked status
		let isBlocked = false;
		let blockedReason = "";
		
		// 1. Claimed local work (if ticket has localMetadata with claimed = true)
		if (ticket.localMetadata?.claimed) {
			isBlocked = true;
			blockedReason = "claimed local work";
		}
		
			// 2. Unresolved same-field conflicts
			if (syncState?.conflicts?.some(c => c.localId === id)) {
				isBlocked = true;
				blockedReason = "unresolved conflict";
			}
			// 3. Pending synchronization
		if (syncState?.pendingOperations?.some(op => op.localId === id)) {
			isBlocked = true;
			blockedReason = "pending synchronization";
		}
		
		if (isBlocked) {
			if (excludeBlocked) {
				effects.push({
					order: 5,
					target: `tracker:${id}`,
					kind: "state",
					classification: "SKIP",
					reason: `Excluded due to: ${blockedReason}`,
					diff: "unchanged",
					fingerprint: null
				});
				continue;
			} else {
				blockers.push(`Ticket ${id} is blocked: ${blockedReason}`);
				effects.push({
					order: 10,
					target: `tracker:${id}`,
					kind: "state",
					classification: "BLOCKING_CONFLICT",
					reason: blockedReason,
					diff: "unchanged",
					fingerprint: null
				});
				continue;
			}
		}

		// Apply disposition
		const storeDisposition = choices.dispositions.find(d => d.storeId === sourceTracker || d.storeId === sourceProject);
		const disp = storeDisposition?.disposition || "preserve-as-history";
		
		if (disp === "preserve-as-history") {
			effects.push({
				order: 20,
				target: `tracker:${id}`,
				kind: "state",
				classification: "PRESERVE",
				reason: "Preserved as inactive history",
				diff: "unchanged",
				fingerprint: null
			});
		} else if (disp === "copy-all" || (disp === "copy-open" && ticket.status !== "closed" && ticket.status !== "done") || (disp === "copy-selected" && storeDisposition.selectedItemIds?.includes(id))) {
			effects.push({
				order: 30,
				target: `tracker:${id}`,
				kind: "state",
				classification: "CREATE",
				reason: "Copied to new tracker/project",
				diff: `Copy to ${targetTracker} ${targetProject || ''}`,
				fingerprint: null,
					// Track what we need to copy
					payload: { sourceId: id, targetTracker, targetProject, semanticLoss: ["localMetadata"], correlationToken: createHash("sha256").update(`${targetTracker}:${targetProject}:${id}`).digest("hex") }
			});
		} else {
			effects.push({
				order: 20,
				target: `tracker:${id}`,
				kind: "state",
				classification: "PRESERVE",
				reason: "Not selected for copy, preserved",
				diff: "unchanged",
				fingerprint: null
			});
		}
	}
	
	effects.sort((left, right) => left.order - right.order || left.target.localeCompare(right.target));
	const changed = effects.some(effect => ["CREATE", "UPDATE"].includes(effect.classification));
	const hash = createHash("sha256").update(JSON.stringify({ choices, effects })).digest("hex");
	
	return {
		effects,
		hash,
		requiresConfirmation: changed,
		blockers,
		report: blockers.length > 0 ? "Blocked by unresolved items." : changed ? "Plan created. Requires confirmation." : "No changes needed."
	};
}

import { executePhases } from "./reconfigure.mjs";

export async function applyTrackerOwnership(config, localStore, syncState, choices, planHash, effects, adapters, injection = {}) {
	const expected = planTrackerOwnership(config, localStore, syncState, choices);
	if (expected.hash !== planHash || JSON.stringify(expected.effects) !== JSON.stringify(effects)) {
		throw new TrackerOwnershipError("The confirmed plan no longer matches current inputs.", "ERR_PLAN_MISMATCH");
	}
	if (expected.blockers.length > 0) {
		throw new TrackerOwnershipError("Cannot apply plan with blockers.", "ERR_HAS_BLOCKERS");
	}
	if (adapters.readJournal && await adapters.readJournal()) {
		throw new TrackerOwnershipError("An interrupted migration must be resumed or accepted before starting another.", "ERR_JOURNAL_EXISTS");
	}
	if (!effects.some(effect => effect.classification === "UPDATE" || effect.classification === "CREATE")) {
		return {
			success: true,
			phase: "done",
			completedEffects: 0,
			hash: planHash,
			readiness: { configValid: true, engineeringReady: true, trackerReady: true, runtimeReady: true },
			report: "Aligned migration completed with no changes."
		};
	}

	const state = {
		hash: planHash,
		effects,
		completedEffects: 0,
		phase: "prepare"
	};
	
	// Create a dummy context object to pass into executePhases instead of snapshot.
	// Since executePhases expects snapshot.entries for drift injection and snapshot.repositoryId,
	// we will map localStore into something compatible.
	const context = {
		repositoryId: "current",
		entries: {}
	};
	for (const [id, ticket] of Object.entries(localStore || {})) {
		context.entries[`tracker:${id}`] = { fingerprint: null }; // We would put actual fingerprint here if we had it
	}

	if (adapters.writeJournal) {
		// Just a simple redact function for tracker state
		const redact = s => ({ ...s, effects: s.effects.map(e => ({ ...e, diff: "redacted" })) });
		await adapters.writeJournal(planHash, redact(state));
	}
	
	const result = await executePhases(state, context, adapters, injection);
	return {
		success: result.success,
		phase: result.phase,
		completedEffects: result.completedEffects,
		hash: result.hash,
		readiness: result.readiness,
		report: result.report
	};
}
