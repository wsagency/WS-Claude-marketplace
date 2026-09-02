import { createHash } from "node:crypto";
import { validateCanonicalConfigObject } from "../ws-project-bootstrap/config.mjs";
import { planDocumentation } from "./transaction.mjs";

export class ReconfigureError extends Error {
	constructor(message, code) {
		super(message);
		this.code = code;
	}
}

function leafPaths(value, prefix = "") {
	const paths = [];
	for (const key of Object.keys(value).sort()) {
		if (key === "schema_version" && prefix === "") continue;
		const fieldPath = prefix ? `${prefix}.${key}` : key;
		const child = value[key];
		if (child && typeof child === "object" && !Array.isArray(child)) paths.push(...leafPaths(child, fieldPath));
		else paths.push(fieldPath);
	}
	return paths;
}

function valueAtPath(value, fieldPath) {
	return fieldPath.split(".").reduce((current, key) => current?.[key], value);
}

function sameValue(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function validationError(config) {
	if (config == null) return new ReconfigureError("Canonical configuration is missing.", "ERR_MISSING_CONFIG");
	if (typeof config === "object" && config !== null && !Object.hasOwn(config, "schema_version") && (Object.hasOwn(config, "schema") || Object.hasOwn(config, "version"))) {
		return new ReconfigureError("Legacy configuration detected.", "ERR_LEGACY_CONFIG");
	}
	const validation = validateCanonicalConfigObject(config);
	if (validation.status === "older") return new ReconfigureError("Older schema detected.", "ERR_OLDER_SCHEMA");
	if (validation.status === "future") return new ReconfigureError("Future schema detected.", "ERR_FUTURE_SCHEMA");
	if (validation.status !== "valid") return new ReconfigureError("Canonical configuration is malformed or incomplete.", "ERR_MALFORMED_CONFIG");
	return null;
}

export function plan(config, discovery, choices) {
	const error = validationError(config);
	if (error) throw error;
	if (!discovery || !["standalone", "hub_root", "hub_subrepository"].includes(discovery.projectShape)) {
		throw new ReconfigureError("A validated repository scope is required.", "ERR_INVALID_SCOPE");
	}

	const selectedRepos = discovery.projectShape === "hub_root" ? ["hub"] : [discovery.root || "current"];
	const selectedFields = choices.fields ? [...new Set(choices.fields)].sort() : [];
	
	const expectedPrefix = choices.domain ? `${choices.domain}.` : null;
	if (expectedPrefix && selectedFields.some(field => !field.startsWith(expectedPrefix))) {
		throw new ReconfigureError("Selected fields must belong to the selected domain.", "ERR_FIELD_OUTSIDE_DOMAIN");
	}
	
	const knownFields = new Set(leafPaths(config));
	if (selectedFields.some(field => !knownFields.has(field))) {
		throw new ReconfigureError("Selected field is not present in the strict-valid baseline.", "ERR_UNKNOWN_FIELD");
	}

	const effects = [];
	let order = 10;

	// Configuration field effects
	for (const field of [...knownFields].sort()) {
		const target = `config:${field}`;
		const current = valueAtPath(config, field);
		if (!selectedFields.includes(field)) {
			effects.push({
				order: order++,
				target,
				kind: "state",
				classification: "PRESERVE",
				reason: "Unselected canonical field",
				diff: "unchanged",
				fingerprint: null
			});
			continue;
		}
		if (!Object.hasOwn(choices.values ?? {}, field)) {
			throw new ReconfigureError(`A proposed value is required for ${field}.`, "ERR_MISSING_PROPOSED_VALUE");
		}
		const proposed = choices.values[field];
		const aligned = sameValue(current, proposed);
		effects.push({
			order: order++,
			target,
			kind: "state",
			classification: aligned ? "NO-OP" : "UPDATE",
			reason: aligned ? "Selected field is already aligned" : "User selected canonical field change",
			diff: aligned ? "unchanged" : `${JSON.stringify(current)} -> ${JSON.stringify(proposed)}`,
			fingerprint: null
		});
	}

	// Docs Enablement / Disablement
	if (choices.enableDocs) {
		const bootstrapPlan = planDocumentation(discovery);
		for (const effect of bootstrapPlan.effects) {
			if (effect.classification === "CREATE" || effect.classification === "UPDATE") {
				effects.push({
					...effect,
					order: order++,
					reason: `Docs enablement: ${effect.reason}`
				});
			} else {
				effects.push({
					...effect,
					order: order++,
					classification: "PRESERVE",
					reason: `Docs enablement preserved: ${effect.reason}`
				});
			}
		}
	} else if (choices.disableDocs) {
		for (const target of Object.keys(discovery.entries).sort()) {
			const entry = discovery.entries[target];
			if (entry.kind !== "missing" && entry.kind !== "blocked") {
				effects.push({
					order: order++,
					target,
					kind: entry.kind,
					classification: "PRESERVE",
					reason: "Docs disablement preserves existing document/directory",
					diff: "unchanged",
					fingerprint: entry.fingerprint
				});
			}
		}
	}

	// Path Transitions
	if (choices.pathTransitions) {
		for (const transition of choices.pathTransitions) {
			const sourceEntry = discovery.entries[transition.source] || { kind: "missing", fingerprint: null };
			const destEntry = discovery.entries[transition.destination] || { kind: "missing", fingerprint: null };

			if (sourceEntry.kind === "missing") {
				effects.push({
					order: order++,
					target: transition.source,
					kind: "file",
					classification: "NO-OP",
					reason: `Source ${transition.source} missing, transition skipped`,
					diff: "unchanged",
					fingerprint: null
				});
				continue;
			}
			
			if (destEntry.kind !== "missing") {
				effects.push({
					order: order++,
					target: transition.destination,
					kind: destEntry.kind,
					classification: "BLOCKING_CONFLICT",
					reason: `Collision: Destination ${transition.destination} already exists`,
					diff: "blocked",
					fingerprint: destEntry.fingerprint
				});
				continue;
			}

			// Cutover (Create destination)
			effects.push({
				order: order++,
				target: transition.destination,
				kind: sourceEntry.kind,
				classification: "CREATE",
				reason: `Path transition: ${transition.intent} from ${transition.source}`,
				after: sourceEntry.content, // Assuming file; directory transitions would need different handling
				diff: `Created from ${transition.source}`,
				fingerprint: null
			});

			// Cleanup (Delete source if move)
			if (transition.intent === "move") {
				effects.push({
					order: 1000 + order++,
					target: transition.source,
					kind: sourceEntry.kind,
					classification: "DELETE",
					reason: `Path transition: removing source after successful move to ${transition.destination}`,
					diff: "deleted",
					fingerprint: sourceEntry.fingerprint
				});
			}
		}
	}

	effects.sort((left, right) => left.order - right.order || left.target.localeCompare(right.target));
	const changed = effects.some(effect => ["CREATE", "UPDATE", "DELETE"].includes(effect.classification));
	const hash = createHash("sha256").update(JSON.stringify({ selectedRepos, selectedFields, effects })).digest("hex");
	
	return {
		effects,
		hash,
		requiresConfirmation: changed,
		dependencyClosure: [], // Docs fields typically don't have dependency closure in this basic form
		scope: selectedRepos,
		report: changed ? "Plan created. Requires confirmation." : "Aligned reconfiguration. No changes needed."
	};
}

function stripSecretsFromState(state) {
	return {
		...state,
		effects: state.effects.map(e => ({
			...e,
			diff: "redacted",
			before: e.before ? "redacted" : undefined,
			after: e.after ? "redacted" : undefined
		}))
	};
}

export async function apply(config, discovery, choices, planHash, effects, adapters, injection = {}) {
	const expected = plan(config, discovery, choices);
	if (expected.hash !== planHash || JSON.stringify(expected.effects) !== JSON.stringify(effects)) {
		throw new ReconfigureError("The confirmed plan no longer matches current inputs.", "ERR_PLAN_MISMATCH");
	}
	if (adapters.readJournal && await adapters.readJournal()) {
		throw new ReconfigureError("An interrupted reconfiguration must be resumed or accepted before starting another.", "ERR_JOURNAL_EXISTS");
	}
	if (!effects.some(effect => ["UPDATE", "CREATE", "DELETE"].includes(effect.classification))) {
		return {
			success: true,
			phase: "done",
			completedEffects: 0,
			hash: planHash,
			readiness: { configValid: true, engineeringReady: true, trackerReady: true, docsReady: true, runtimeReady: true },
			report: "Aligned reconfiguration completed with no changes.",
			ownershipReport: { [discovery.root || "current"]: "aligned" }
		};
	}

	const state = {
		hash: planHash,
		effects,
		completedEffects: 0,
		phase: "prepare"
	};
	if (adapters.writeJournal) await adapters.writeJournal(planHash, stripSecretsFromState(state));
	return await executePhases(state, discovery, adapters, injection);
}

async function executePhases(state, discovery, adapters, injection) {
	const phases = ["prepare", "cutover", "cleanup", "done"];
	let currentPhaseIdx = phases.indexOf(state.phase);
	
	const now = adapters.now ? adapters.now : Date.now;
	let ownershipReport = {};

	try {
		// Prepare phase
		if (state.phase === "prepare") {
			if (injection.failAtPhase === "prepare") throw new Error("Injected failure at phase prepare");
			if (adapters.revalidateFingerprints && !await adapters.revalidateFingerprints(state.effects)) {
				throw new Error("Drift detected while revalidating confirmed fingerprints");
			}
			state.phase = "cutover";
			currentPhaseIdx++;
			if (adapters.writeJournal) await adapters.writeJournal(state.hash, stripSecretsFromState(state));
		}

		// Cutover phase
		if (state.phase === "cutover") {
			if (injection.failAtPhase === "cutover") throw new Error("Injected failure at phase cutover");
			const cutoverEffects = state.effects.filter(e => e.classification === "UPDATE" || e.classification === "CREATE");
			while (state.completedEffects < cutoverEffects.length) {
				if (injection.failAtEffectIndex === state.completedEffects) {
					throw new Error(`Injected failure at effect ${state.completedEffects}`);
				}
				const effect = cutoverEffects[state.completedEffects];
				if (adapters.applyEffect) await adapters.applyEffect(effect);
				state.completedEffects++;
			}
			state.phase = "cleanup";
			currentPhaseIdx++;
			if (adapters.writeJournal) await adapters.writeJournal(state.hash, stripSecretsFromState(state));
		}

		// Cleanup phase
		if (state.phase === "cleanup") {
			if (injection.failAtPhase === "cleanup") throw new Error("Injected failure at phase cleanup");
			
			// Count cutover effects to offset state.completedEffects for cleanup
			const cutoverCount = state.effects.filter(e => e.classification === "UPDATE" || e.classification === "CREATE").length;
			const cleanupEffects = state.effects.filter(e => e.classification === "DELETE");
			
			while (state.completedEffects - cutoverCount < cleanupEffects.length) {
				const cleanupIdx = state.completedEffects - cutoverCount;
				if (injection.failAtCleanupIndex === cleanupIdx) {
					throw new Error(`Injected failure at cleanup effect ${cleanupIdx}`);
				}
				const effect = cleanupEffects[cleanupIdx];
				// Deletions happen here
				if (adapters.applyEffect) await adapters.applyEffect(effect);
				state.completedEffects++;
			}
			
			state.phase = "done";
			currentPhaseIdx++;
			ownershipReport = { [discovery.root || "current"]: "owned" };
		}

	} catch (err) {
		if (adapters.writeJournal) await adapters.writeJournal(state.hash, stripSecretsFromState(state));
		return {
			success: false,
			phase: state.phase,
			completedEffects: state.completedEffects,
			hash: state.hash,
			readiness: { configValid: false, engineeringReady: false, trackerReady: false, docsReady: false, runtimeReady: false },
			report: `Failed during ${state.phase}: ${err.message}`
		};
	}
	
	if (adapters.writeAudit) await adapters.writeAudit({ hash: state.hash, completed: state.completedEffects, timestamp: now() });
	if (adapters.removeJournal) await adapters.removeJournal();
	
	return {
		success: true,
		phase: "done",
		completedEffects: state.completedEffects,
		hash: state.hash,
		readiness: { configValid: true, engineeringReady: true, trackerReady: true, docsReady: true, runtimeReady: true },
		report: "Cutover completed.",
		ownershipReport
	};
}

export async function resume(config, discovery, choices, adapters, injection = {}) {
	if (!adapters.readJournal) throw new Error("readJournal adapter required");
	const record = await adapters.readJournal();
	if (!record) throw new Error("No interrupted work found to resume.");
	return await executePhases(record.state, discovery, adapters, injection);
}

export async function acceptPartial(config, discovery, choices, adapters) {
	if (!adapters.readJournal) throw new Error("readJournal adapter required");
	const record = await adapters.readJournal();
	if (!record) throw new Error("No interrupted work found to accept.");
	
	const state = record.state;
	if (state.completedEffects === 0 && state.phase !== "cleanup") {
		throw new ReconfigureError("Cannot accept partial state with 0 completed effects.", "ERR_NOT_ELIGIBLE_PARTIAL");
	}
	
	const now = adapters.now ? adapters.now : Date.now;
	if (adapters.writeAudit) await adapters.writeAudit({ hash: state.hash, completed: state.completedEffects, acceptedPartial: true, timestamp: now() });
	if (adapters.removeJournal) await adapters.removeJournal();
	
	return {
		success: true,
		phase: state.phase,
		completedEffects: state.completedEffects,
		hash: state.hash,
		readiness: { configValid: true, engineeringReady: true, trackerReady: true, docsReady: true, runtimeReady: true },
		report: "Partial state explicitly accepted.",
		ownershipReport: { [discovery.root || "current"]: "partial" }
	};
}
