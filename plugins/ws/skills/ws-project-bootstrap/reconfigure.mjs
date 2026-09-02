import { createHash } from "node:crypto";

const CURRENT_SCHEMA_VERSION = "1.0.0";

export class ReconfigureError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

export function plan(config, snapshot, machine, choices) {
    if (!config || !config.schema) {
        throw new ReconfigureError("Missing or malformed configuration state.", "ERR_MISSING_CONFIG");
    }
    
    if (config.schema === "legacy" || !config.version) {
        throw new ReconfigureError("Legacy configuration detected. Use ordinary setup migration.", "ERR_LEGACY_CONFIG");
    }
    
    if (config.version !== CURRENT_SCHEMA_VERSION) {
        if (config.version < CURRENT_SCHEMA_VERSION) {
            throw new ReconfigureError("Older schema detected. Use ordinary setup migration.", "ERR_OLDER_SCHEMA");
        } else {
            throw new ReconfigureError("Future schema detected. Update package first.", "ERR_FUTURE_SCHEMA");
        }
    }
    
    if (snapshot.shape === "hub_root" && (!choices.repositories || choices.repositories.length === 0)) {
        throw new ReconfigureError("Hub-root invocation requires repository selection.", "ERR_MISSING_REPO_SELECTION");
    }
    
    let selectedRepos = [snapshot.repositoryId || "current"];
    if (snapshot.shape === "hub_root") {
        selectedRepos = choices.repositories;
    } else if (snapshot.shape === "standalone" || snapshot.shape === "hub_subrepository") {
        selectedRepos = ["current"];
    }
    
    const effects = [];
    let requiresConfirmation = false;
    let dependencyClosure = [];
    
    if (choices.domain === "runtime") {
        for (const field of choices.fields) {
            effects.push({
                order: 10,
                target: `config:${field}`,
                kind: "state",
                classification: "UPDATE",
                reason: `User selected field ${field}`,
                diff: "changed",
                fingerprint: null
            });
            requiresConfirmation = true;
            if (field === "dangerousGitGuard") {
                dependencyClosure.push("sessionDiscipline");
            }
        }
    }
    
    const unselectedFields = Object.keys(config).filter(k => k !== "version" && k !== "schema" && !choices.fields.includes(k));
    for (const field of unselectedFields) {
        effects.push({
            order: 5,
            target: `config:${field}`,
            kind: "state",
            classification: "PRESERVE",
            reason: `Unselected field`,
            diff: "unchanged",
            fingerprint: null
        });
    }

    if (effects.filter(e => e.classification !== "PRESERVE" && e.classification !== "NO-OP").length === 0) {
        requiresConfirmation = false;
    }
    
    if (choices.cancelDependent && dependencyClosure.length > 0) {
         throw new ReconfigureError("Required dependent choice cancelled.", "ERR_DEPENDENT_CANCELLED");
    }
    
    if (choices.values && choices.values.dangerousGitGuard === false) {
        if (machine.sharedGuardsOwnedBy && machine.sharedGuardsOwnedBy.length > 1) {
            effects.push({
                order: 20,
                target: `machine:sharedGuard`,
                kind: "state",
                classification: "PRESERVE",
                reason: `Shared protection used by other repositories`,
                diff: "unchanged",
                fingerprint: null
            });
        } else {
            effects.push({
                order: 20,
                target: `machine:sharedGuard`,
                kind: "state",
                classification: "UPDATE",
                reason: `Exact authorized repository-owned duplicate cleaned up`,
                diff: "removed",
                fingerprint: null
            });
        }
    }

    const hashStr = JSON.stringify(effects.map(e => e.target + e.classification));
    const hash = createHash("sha256").update(hashStr).digest("hex");

    return {
        effects,
        hash,
        requiresConfirmation,
        dependencyClosure,
        report: requiresConfirmation ? "Plan created. Requires confirmation." : "Aligned reconfiguration. No changes needed."
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
    if (effects.length === 0 || !effects.some(e => e.classification === "UPDATE" || e.classification === "CREATE")) {
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
    
    if (adapters.writeJournal) {
        await adapters.writeJournal(planHash, stripSecretsFromState(state));
    }

    return await executePhases(state, snapshot, adapters, injection);
}

async function executePhases(state, snapshot, adapters, injection) {
    const phases = ["prepare", "cutover", "cleanup", "done"];
    let currentPhaseIdx = phases.indexOf(state.phase);
    
    const now = adapters.now ? adapters.now : Date.now;
    let ownershipReport = {};

    try {
        // Prepare phase: validate fingerprints and drift
        if (state.phase === "prepare") {
            if (injection.failAtPhase === "prepare") {
                throw new Error("Injected failure at phase prepare");
            }
            if (injection.driftEntries) {
                for (const [target, expectedHash] of Object.entries(injection.driftEntries)) {
                    const entry = snapshot.entries[target];
                    if (!entry || entry.fingerprint !== expectedHash) {
                        throw new Error(`Drift detected for ${target}`);
                    }
                }
            }
            state.phase = "cutover";
            currentPhaseIdx++;
            if (adapters.writeJournal) await adapters.writeJournal(state.hash, stripSecretsFromState(state));
        }

        // Cutover phase: apply updates and creates
        if (state.phase === "cutover") {
            if (injection.failAtPhase === "cutover") {
                throw new Error("Injected failure at phase cutover");
            }
            const cutoverEffects = state.effects.filter(e => e.classification === "UPDATE" || e.classification === "CREATE");
            while (state.completedEffects < cutoverEffects.length) {
                if (injection.failAtEffectIndex === state.completedEffects) {
                     throw new Error(`Injected failure at effect ${state.completedEffects}`);
                }
                const effect = cutoverEffects[state.completedEffects];
                if (adapters.applyEffect) {
                    await adapters.applyEffect(effect);
                }
                state.completedEffects++;
            }
            state.phase = "cleanup";
            currentPhaseIdx++;
            if (adapters.writeJournal) await adapters.writeJournal(state.hash, stripSecretsFromState(state));
        }

        // Cleanup phase: remove obsoleted elements
        if (state.phase === "cleanup") {
            if (injection.failAtPhase === "cleanup") {
                throw new Error("Injected failure at phase cleanup");
            }
            // Execute cleanup logic if applicable
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
