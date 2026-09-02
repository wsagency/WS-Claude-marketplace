import { createHash } from "node:crypto";
import { validateCanonicalConfigObject } from "./config.mjs";
import { planDomain, planTriage } from "./routing.mjs";


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
    if (config == null) return new ReconfigureError("Canonical configuration is missing. Run ordinary /ws-setup first.", "ERR_MISSING_CONFIG");
    if (typeof config === "object" && config !== null && !Object.hasOwn(config, "schema_version") && (Object.hasOwn(config, "schema") || Object.hasOwn(config, "version"))) {
        return new ReconfigureError("Legacy configuration detected. Run ordinary /ws-setup migration first.", "ERR_LEGACY_CONFIG");
    }
    const validation = validateCanonicalConfigObject(config);
    if (validation.status === "older") return new ReconfigureError("Older schema detected. Run ordinary /ws-setup migration first.", "ERR_OLDER_SCHEMA");
    if (validation.status === "future") return new ReconfigureError("Future schema detected. Update the WS package before reconfiguring.", "ERR_FUTURE_SCHEMA");
    if (validation.status !== "valid") return new ReconfigureError("Canonical configuration is malformed or incomplete. Run ordinary /ws-setup repair first.", "ERR_MALFORMED_CONFIG");
    return null;
}

export function plan(config, snapshot, machine, choices) {
    const error = validationError(config);
    if (error) throw error;
    if (!snapshot || !["standalone", "hub_root", "hub_subrepository"].includes(snapshot.shape)) {
        throw new ReconfigureError("A validated repository scope is required.", "ERR_INVALID_SCOPE");
    }
    if (!choices || !Array.isArray(choices.fields)) {
        throw new ReconfigureError("Concrete field selection is required.", "ERR_MISSING_FIELD_SELECTION");
    }
    if (snapshot.shape === "hub_root" && (!Array.isArray(choices.repositories) || choices.repositories.length === 0)) {
        throw new ReconfigureError("Hub-root invocation requires repository selection.", "ERR_MISSING_REPO_SELECTION");
    }

    const selectedRepos = snapshot.shape === "hub_root"
        ? [...new Set(choices.repositories)]
        : [snapshot.repositoryId || "current"];
    const selectedFields = [...new Set(choices.fields)].sort();
    const expectedPrefix = choices.domain ? `${choices.domain}.` : null;
    if (expectedPrefix && selectedFields.some(field => !field.startsWith(expectedPrefix))) {
        throw new ReconfigureError("Selected fields must belong to the selected domain.", "ERR_FIELD_OUTSIDE_DOMAIN");
    }
    const knownFields = new Set(leafPaths(config));
    if (selectedFields.some(field => !knownFields.has(field))) {
        throw new ReconfigureError("Selected field is not present in the strict-valid baseline.", "ERR_UNKNOWN_FIELD");
    }

    const dependencyClosure = [];
    if (selectedFields.includes("runtime.dangerous_git_guard")) dependencyClosure.push("runtime.session_discipline");
    if (choices.cancelDependent && dependencyClosure.length > 0) {
        throw new ReconfigureError("Required dependent choice cancelled.", "ERR_DEPENDENT_CANCELLED");
    }

    const effects = [];
    for (const field of [...knownFields].sort()) {
        const target = `config:${field}`;
        const current = valueAtPath(config, field);
        if (!selectedFields.includes(field)) {
            effects.push({
                order: 5,
                target,
                kind: "state",
                classification: "PRESERVE",
                reason: "Unselected canonical field",
                diff: "unchanged",
                fingerprint: snapshot.entries?.[target]?.fingerprint ?? null
            });
            continue;
        }
        if (!Object.hasOwn(choices.values ?? {}, field)) {
            throw new ReconfigureError(`A proposed value is required for ${field}.`, "ERR_MISSING_PROPOSED_VALUE");
        }
        const proposed = choices.values[field];
        const aligned = sameValue(current, proposed);
        effects.push({
            order: 10,
            target,
            kind: "state",
            classification: aligned ? "NO-OP" : "UPDATE",
            reason: aligned ? "Selected field is already aligned" : "User selected canonical field change",
            diff: aligned ? "unchanged" : `${JSON.stringify(current)} -> ${JSON.stringify(proposed)}`,
            fingerprint: snapshot.entries?.[target]?.fingerprint ?? null
        });
    }

    for (const target of Object.keys(snapshot.entries ?? {}).sort()) {
        if (target.startsWith("config:") || effects.some(effect => effect.target === target)) continue;
        effects.push({
            order: 5,
            target,
            kind: "state",
            classification: "PRESERVE",
            reason: "Unselected artifact or managed fragment",
            diff: "unchanged",
            fingerprint: snapshot.entries[target]?.fingerprint ?? null
        });
    }

    const routing = choices.domain === "tracker" && choices.triageMappings
        ? planTriage(config, snapshot, machine, choices)
        : ["engineering", "docs"].includes(choices.domain) && choices.contextMap
            ? planDomain(config, snapshot, machine, choices)
            : null;
    if (routing?.blocking) {
        throw new ReconfigureError("Blocking conflict detected. Migration unsafe.", "ERR_BLOCKING_CONFLICT");
    }
    if (routing) {
        effects.push(...routing.effects);
        dependencyClosure.push(...routing.dependencyClosure);
    }

    if (choices.values?.["runtime.dangerous_git_guard"] === "disabled") {
        const owners = machine?.sharedGuardsOwnedBy ?? [];
        const shared = owners.some(owner => !selectedRepos.includes(owner));
        effects.push({
            order: 20,
            target: "machine:sharedGuard",
            kind: "state",
            classification: shared ? "PRESERVE" : "UPDATE",
            reason: shared ? "Shared protection is used by another repository" : "Exact authorized repository-owned duplicate may be cleaned up",
            diff: shared ? "unchanged" : "removed",
            fingerprint: machine?.sharedGuardFingerprint ?? null
        });
    }

    effects.sort((left, right) => left.order - right.order || left.target.localeCompare(right.target));
    const changed = effects.some(effect => ["CREATE", "UPDATE"].includes(effect.classification));
    const hash = createHash("sha256").update(JSON.stringify({ selectedRepos, selectedFields, effects })).digest("hex");
    return {
        effects,
        hash,
        requiresConfirmation: changed,
        dependencyClosure,
        scope: selectedRepos,
        report: changed ? "Plan created. Requires confirmation." : "Aligned reconfiguration. No changes needed."
    };
}

// Ensure the journal never contains config values, secrets, or field contents
function stripSecretsFromState(state) {
    return {
        ...state,
        effects: state.effects.map(e => ({
            ...e,
            diff: "redacted"
        }))
    };
}

export async function apply(config, snapshot, machine, choices, planHash, effects, adapters, injection = {}) {
    const expected = plan(config, snapshot, machine, choices);
    if (expected.hash !== planHash || JSON.stringify(expected.effects) !== JSON.stringify(effects)) {
        throw new ReconfigureError("The confirmed plan no longer matches current inputs.", "ERR_PLAN_MISMATCH");
    }
    if (adapters.readJournal && await adapters.readJournal()) {
        throw new ReconfigureError("An interrupted reconfiguration must be resumed or accepted before starting another.", "ERR_JOURNAL_EXISTS");
    }
    if (!effects.some(effect => effect.classification === "UPDATE" || effect.classification === "CREATE")) {
        return {
            success: true,
            phase: "done",
            completedEffects: 0,
            hash: planHash,
            readiness: { configValid: true, engineeringReady: true, trackerReady: true, runtimeReady: true },
            report: "Aligned reconfiguration completed with no changes.",
            ownershipReport: { [snapshot.repositoryId || "current"]: "aligned" }
        };
    }

    const state = {
        hash: planHash,
        effects,
        completedEffects: 0,
        phase: "prepare"
    };
    if (adapters.writeJournal) await adapters.writeJournal(planHash, stripSecretsFromState(state));
    return await executePhases(state, snapshot, adapters, injection);
}

export async function executePhases(state, snapshot, adapters, injection) {
    const phases = ["prepare", "cutover", "cleanup", "done"];
    let currentPhaseIdx = phases.indexOf(state.phase);
    
    const now = adapters.now ? adapters.now : Date.now;
    let ownershipReport = {};

    try {
        const actionable = state.effects.filter(e => e.classification === "UPDATE" || e.classification === "CREATE");
        actionable.sort((a, b) => a.order - b.order);
        const prepareMax = actionable.filter(e => e.order < 10).length;
        const cutoverMax = prepareMax + actionable.filter(e => e.order >= 10 && e.order < 30).length;
        const cleanupMax = actionable.length;

        // Prepare phase: validate fingerprints and drift, then run prepare effects
        if (state.phase === "prepare") {
            if (injection.failAtPhase === "prepare") {
                throw new Error("Injected failure at phase prepare");
            }
            if (adapters.revalidateFingerprints && !await adapters.revalidateFingerprints(state.effects)) {
                throw new Error("Drift detected while revalidating confirmed fingerprints");
            }
            if (injection.driftEntries) {
                for (const [target, expectedHash] of Object.entries(injection.driftEntries)) {
                    const entry = snapshot.entries[target];
                    if (!entry || entry.fingerprint !== expectedHash) {
                        throw new Error(`Drift detected for ${target}`);
                    }
                }
            }
            while (state.completedEffects < prepareMax) {
                if (injection.failAtEffectIndex === state.completedEffects) {
                     throw new Error(`Injected failure at effect ${state.completedEffects}`);
                }
                const effect = actionable[state.completedEffects];
                if (adapters.applyEffect) {
                    await adapters.applyEffect(effect);
                }
                state.completedEffects++;
            }
            state.phase = "cutover";
            currentPhaseIdx++;
            if (adapters.writeJournal) await adapters.writeJournal(state.hash, stripSecretsFromState(state));
        }

        // Cutover phase: apply normal updates and creates
        if (state.phase === "cutover") {
            if (injection.failAtPhase === "cutover") {
                throw new Error("Injected failure at phase cutover");
            }
            while (state.completedEffects < cutoverMax) {
                if (injection.failAtEffectIndex === state.completedEffects) {
                     throw new Error(`Injected failure at effect ${state.completedEffects}`);
                }
                const effect = actionable[state.completedEffects];
                if (adapters.applyEffect) {
                    await adapters.applyEffect(effect);
                }
                state.completedEffects++;
            }
            state.phase = "cleanup";
            currentPhaseIdx++;
            if (adapters.writeJournal) await adapters.writeJournal(state.hash, stripSecretsFromState(state));
        }

        // Cleanup phase: run cleanup effects (order >= 30)
        if (state.phase === "cleanup") {
            if (injection.failAtPhase === "cleanup") {
                throw new Error("Injected failure at phase cleanup");
            }
            while (state.completedEffects < cleanupMax) {
                if (injection.failAtEffectIndex === state.completedEffects) {
                     throw new Error(`Injected failure at effect ${state.completedEffects}`);
                }
                const effect = actionable[state.completedEffects];
                if (adapters.applyEffect) {
                    await adapters.applyEffect(effect);
                }
                state.completedEffects++;
            }
            state.phase = "done";
            currentPhaseIdx++;
            ownershipReport = { [snapshot.repositoryId || "current"]: "owned" };
        }

    } catch (err) {
        // Stop on the first failure without rollback
        if (adapters.writeJournal) {
            await adapters.writeJournal(state.hash, stripSecretsFromState(state));
        }
        return {
            success: false,
            phase: state.phase,
            completedEffects: state.completedEffects,
            hash: state.hash,
            readiness: { configValid: false, engineeringReady: false, trackerReady: false, runtimeReady: false },
            report: `Failed during ${state.phase}: ${err.message}`
        };
    }
    
    // Durable audit record MUST be written BEFORE transient journal is removed
    if (adapters.writeAudit) {
        await adapters.writeAudit({ hash: state.hash, completed: state.completedEffects, timestamp: now() });
    }
    
    if (adapters.removeJournal) {
        await adapters.removeJournal();
    }
    
    return {
        success: true,
        phase: "done",
        completedEffects: state.completedEffects,
        hash: state.hash,
        readiness: { configValid: true, engineeringReady: true, trackerReady: true, runtimeReady: true },
        report: "Cutover completed.",
        ownershipReport
    };
}

export async function resume(config, snapshot, machine, choices, adapters, injection = {}) {
    if (!adapters.readJournal) throw new Error("readJournal adapter required");
    const record = await adapters.readJournal();
    if (!record) {
        throw new Error("No interrupted work found to resume.");
    }
    
    return await executePhases(record.state, snapshot, adapters, injection);
}

export async function acceptPartial(config, snapshot, machine, choices, adapters) {
    if (!adapters.readJournal) throw new Error("readJournal adapter required");
    const record = await adapters.readJournal();
    if (!record) {
        throw new Error("No interrupted work found to accept.");
    }
    
    const state = record.state;
    
    // Check eligibility: user can only accept if some cutover effects landed (state partially applied)
    if (state.completedEffects === 0 && state.phase !== "cleanup") {
        throw new ReconfigureError("Cannot accept partial state with 0 completed effects.", "ERR_NOT_ELIGIBLE_PARTIAL");
    }
    
    const now = adapters.now ? adapters.now : Date.now;

    if (adapters.writeAudit) {
        await adapters.writeAudit({ hash: state.hash, completed: state.completedEffects, acceptedPartial: true, timestamp: now() });
    }
    if (adapters.removeJournal) {
        await adapters.removeJournal();
    }
    
    return {
        success: true,
        phase: state.phase,
        completedEffects: state.completedEffects,
        hash: state.hash,
        readiness: { configValid: true, engineeringReady: true, trackerReady: true, runtimeReady: true },
        report: "Partial state explicitly accepted.",
        ownershipReport: { [snapshot.repositoryId || "current"]: "partial" }
    };
}
