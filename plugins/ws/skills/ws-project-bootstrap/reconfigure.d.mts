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
    [key: string]: any;
}

export interface ReconfigureMachineCapabilities {
    canWriteSharedGuards?: boolean;
    sharedGuardsOwnedBy?: string[];
}

export interface ReconfigureTargetSnapshot {
    isRepository: boolean;
    shape: ProjectShape;
    repositoryId?: string;
    entries: Record<string, { kind: "file" | "directory" | "missing", content?: string, fingerprint?: string | null }>;
}

export interface ReconfigureChoices {
    domain: ReconfigureDomain;
    fields: string[];
    values?: Record<string, any>;
    repositories?: string[];
    cancelDependent?: boolean;
}

export interface ReconfigureAdapters {
    writeJournal?: (hash: string, state: any) => Promise<void>;
    readJournal?: () => Promise<{ hash: string, state: any } | null>;
    removeJournal?: () => Promise<void>;
    writeAudit?: (record: any) => Promise<void>;
    applyEffect?: (effect: SetupEffect) => Promise<void>;
    now?: () => number;
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
    dependencyClosure: string[];
    report: string;
}

export interface ReconfigureApplyResult {
    success: boolean;
    phase: ReconfigurePhase;
    completedEffects: number;
    hash: string;
    readiness: SetupReadiness;
    report: string;
    ownershipReport?: Record<string, string>;
}

export function plan(
    config: ReconfigureConfig,
    snapshot: ReconfigureTargetSnapshot,
    machine: ReconfigureMachineCapabilities,
    choices: ReconfigureChoices
): ReconfigurePlanResult;

export function apply(
    config: ReconfigureConfig,
    snapshot: ReconfigureTargetSnapshot,
    machine: ReconfigureMachineCapabilities,
    choices: ReconfigureChoices,
    planHash: string,
    effects: SetupEffect[],
    adapters: ReconfigureAdapters,
    injection?: ReconfigureInjection
): Promise<ReconfigureApplyResult>;

export function resume(
    config: ReconfigureConfig,
    snapshot: ReconfigureTargetSnapshot,
    machine: ReconfigureMachineCapabilities,
    choices: ReconfigureChoices,
    adapters: ReconfigureAdapters,
    injection?: ReconfigureInjection
): Promise<ReconfigureApplyResult>;

export function acceptPartial(
    config: ReconfigureConfig,
    snapshot: ReconfigureTargetSnapshot,
    machine: ReconfigureMachineCapabilities,
    choices: ReconfigureChoices,
    adapters: ReconfigureAdapters
): Promise<ReconfigureApplyResult>;
