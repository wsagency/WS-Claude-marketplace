import type { 
    SetupDiscovery, 
    SetupEffect, 
    SetupReadiness, 
    ProjectShape, 
    EffectClassification 
} from "./transaction.d.mts";

export type ReconfigureDomain = "runtime" | "tracker" | "docs" | "engineering";
export type ReconfigurePhase = "prepare" | "cutover" | "cleanup" | "done";

export interface ReconfigureConfig {
    version: string;
    schema: string;
    [key: string]: any; // Catch-all for strict-valid baseline config fields
}

export interface ReconfigureMachineCapabilities {
    canWriteSharedGuards: boolean;
    sharedGuardsOwnedBy: string[];
}

export interface ReconfigureTargetSnapshot {
    isRepository: boolean;
    shape: ProjectShape;
    entries: Record<string, { kind: "file" | "directory" | "missing", content?: string }>;
}

export interface ReconfigureChoices {
    domain: ReconfigureDomain;
    fields: string[];
    values: Record<string, any>;
    repositories?: string[];
}

export interface ReconfigureAdapters {
    writeJournal?: (hash: string, state: any) => Promise<void>;
    readJournal?: () => Promise<{ hash: string, state: any } | null>;
    removeJournal?: () => Promise<void>;
    writeAudit?: (record: any) => Promise<void>;
    applyEffect?: (effect: SetupEffect) => Promise<void>;
}

export interface ReconfigureInjection {
    failAtPhase?: ReconfigurePhase;
    failAtEffectIndex?: number;
    driftEntries?: Record<string, string>; // simulated drift
}

export interface ReconfigurePlanResult {
    effects: SetupEffect[];
    hash: string;
    requiresConfirmation: boolean;
    dependencyClosure: string[]; // required dependents that must be updated
    report: string;
}

export interface ReconfigureApplyResult {
    success: boolean;
    phase: ReconfigurePhase;
    completedEffects: number;
    hash: string;
    readiness: SetupReadiness;
    report: string;
}

export function plan(
    config: ReconfigureConfig,
    snapshot: ReconfigureTargetSnapshot,
    machine: ReconfigureMachineCapabilities,
    choices: ReconfigureChoices
): ReconfigurePlanResult;

export function apply(
    planHash: string,
    effects: SetupEffect[],
    adapters: ReconfigureAdapters,
    injection?: ReconfigureInjection
): Promise<ReconfigureApplyResult>;

export function resume(
    adapters: ReconfigureAdapters,
    injection?: ReconfigureInjection
): Promise<ReconfigureApplyResult>;

export function acceptPartial(
    adapters: ReconfigureAdapters
): Promise<ReconfigureApplyResult>;
