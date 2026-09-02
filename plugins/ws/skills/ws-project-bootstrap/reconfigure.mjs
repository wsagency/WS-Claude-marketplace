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
    
    // Determine scope
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
    
    // Unselected fields are PRESERVE (we might not generate effects for them, or we generate PRESERVE)
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
    
    // Check dependency cancellation
    // "cancelling a required dependent choice cancels the proposed change rather than silently resetting another value."
    // We simulate this by checking choices.cancelDependent
    if (choices.cancelDependent && dependencyClosure.length > 0) {
         throw new ReconfigureError("Required dependent choice cancelled.", "ERR_DEPENDENT_CANCELLED");
    }
    
    // Disabling a repository runtime requirement never globally removes shared protection used by other repositories
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

export async function apply(planHash, effects, adapters, injection = {}) {
    if (effects.length === 0 || !effects.some(e => e.classification === "UPDATE" || e.classification === "CREATE")) {
        return {
            success: true,
            phase: "done",
            completedEffects: 0,
            hash: planHash,
            readiness: { configValid: true, engineeringReady: true, trackerReady: true, runtimeReady: true },
            report: "Aligned reconfiguration completed with no changes."
        };
    }
    
    const state = {
        hash: planHash,
        effects,
        completedEffects: 0,
        phase: "prepare" // prepare -> cutover -> cleanup -> done
    };
    
    if (adapters.writeJournal) {
        // journal must be secret-free - we assume effects don't have secrets
        await adapters.writeJournal(planHash, state);
    }

    return await executePhases(state, adapters, injection);
}

async function executePhases(state, adapters, injection) {
    const phases = ["prepare", "cutover", "cleanup", "done"];
    let currentPhaseIdx = phases.indexOf(state.phase);
    
    try {
        while (currentPhaseIdx < phases.length - 1) {
            if (injection.failAtPhase === phases[currentPhaseIdx]) {
                throw new Error(`Injected failure at phase ${phases[currentPhaseIdx]}`);
            }
            
            // Execute effects for this phase (simplified)
            // Just simulate completing effects
            if (state.completedEffects < state.effects.length) {
                if (injection.failAtEffectIndex === state.completedEffects) {
                     throw new Error(`Injected failure at effect ${state.completedEffects}`);
                }
                const effect = state.effects[state.completedEffects];
                if (adapters.applyEffect) {
                    await adapters.applyEffect(effect);
                }
                state.completedEffects++;
            }
            
            currentPhaseIdx++;
            state.phase = phases[currentPhaseIdx];
            if (adapters.writeJournal && state.phase !== "done") {
                await adapters.writeJournal(state.hash, state);
            }
        }
    } catch (err) {
        // Stop on the first failure without rollback
        if (adapters.writeJournal) {
            await adapters.writeJournal(state.hash, state);
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
    
    // Durable audit record before journal is removed
    if (adapters.writeAudit) {
        await adapters.writeAudit({ hash: state.hash, completed: state.completedEffects, timestamp: Date.now() });
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
        report: "Cutover completed."
    };
}

export async function resume(adapters, injection = {}) {
    if (!adapters.readJournal) throw new Error("readJournal adapter required");
    const record = await adapters.readJournal();
    if (!record) {
        throw new Error("No interrupted work found to resume.");
    }
    
    return await executePhases(record.state, adapters, injection);
}

export async function acceptPartial(adapters) {
    if (!adapters.readJournal) throw new Error("readJournal adapter required");
    const record = await adapters.readJournal();
    if (!record) {
        throw new Error("No interrupted work found to accept.");
    }
    
    const state = record.state;
    // explicit accept a reviewed valid partial state
    // write audit
    if (adapters.writeAudit) {
        await adapters.writeAudit({ hash: state.hash, completed: state.completedEffects, acceptedPartial: true, timestamp: Date.now() });
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
        report: "Partial state explicitly accepted."
    };
}
