import type { CanonicalProjectConfig } from "../ws-project-bootstrap/config.d.mts";
import type { DocsDiscovery, DocsEffect } from "./transaction.d.mts";

export interface ReconfigureChoices {
    domain?: "docs" | "changelog";
    fields?: string[];
    values?: Record<string, unknown>;
    enableDocs?: boolean;
    disableDocs?: boolean;
    pathTransitions?: Array<{ source: string; destination: string; intent: "copy" | "move" }>;
}

export interface ReconfigurePlan {
    effects: DocsEffect[];
    hash: string;
    requiresConfirmation: boolean;
    dependencyClosure: string[];
    scope: string[];
    report: string;
}

export interface ReconfigureReadiness {
    configValid: boolean;
    engineeringReady: boolean;
    trackerReady: boolean;
    docsReady: boolean;
    runtimeReady: boolean;
}

export interface ReconfigureResult {
    success: boolean;
    phase: "prepare" | "cutover" | "cleanup" | "done";
    completedEffects: number;
    hash: string;
    readiness: ReconfigureReadiness;
    report: string;
    ownershipReport?: Record<string, "aligned" | "owned" | "partial">;
}

export interface ReconfigureAdapters {
    writeJournal?: (hash: string, state: unknown) => Promise<void>;
    readJournal?: () => Promise<{ hash: string; state: any } | null>;
    removeJournal?: () => Promise<void>;
    writeAudit?: (record: unknown) => Promise<void>;
    applyEffect?: (effect: DocsEffect) => Promise<void>;
    revalidateFingerprints?: (effects: DocsEffect[]) => Promise<boolean>;
    now?: () => number;
}

export function plan(config: CanonicalProjectConfig, discovery: DocsDiscovery, choices: ReconfigureChoices): ReconfigurePlan;

export function apply(
    config: CanonicalProjectConfig,
    discovery: DocsDiscovery,
    choices: ReconfigureChoices,
    planHash: string,
    effects: DocsEffect[],
    adapters: ReconfigureAdapters,
    injection?: Record<string, unknown>
): Promise<ReconfigureResult>;

export function resume(
    config: CanonicalProjectConfig,
    discovery: DocsDiscovery,
    choices: ReconfigureChoices,
    adapters: ReconfigureAdapters,
    injection?: Record<string, unknown>
): Promise<ReconfigureResult>;

export function acceptPartial(
    config: CanonicalProjectConfig,
    discovery: DocsDiscovery,
    choices: ReconfigureChoices,
    adapters: ReconfigureAdapters
): Promise<ReconfigureResult>;
