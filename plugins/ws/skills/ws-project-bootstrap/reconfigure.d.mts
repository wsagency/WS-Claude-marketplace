import type { CanonicalProjectConfig } from "./config.d.mts";
import type { ProjectShape, SetupEffect, SetupReadiness } from "./transaction.d.mts";

export type ReconfigureDomain = "runtime" | "tracker" | "docs" | "engineering";
export type ReconfigurePhase = "prepare" | "cutover" | "cleanup" | "done";

export type ReconfigureConfig = CanonicalProjectConfig;

export interface ReconfigureMachineCapabilities {
	canWriteSharedGuards?: boolean;
	sharedGuardsOwnedBy?: string[];
	sharedGuardFingerprint?: string | null;
}

export interface ReconfigureTargetSnapshot {
	isRepository?: boolean;
	shape: ProjectShape;
	repositoryId?: string;
	entries?: Record<string, { kind?: "file" | "directory" | "missing"; content?: string; fingerprint?: string | null }>;
}

export interface ReconfigureChoices {
	domain: ReconfigureDomain;
	fields: string[];
	values?: Record<string, unknown>;
	repositories?: string[];
	cancelDependent?: boolean;
	triageMappings?: Record<string, { role: string; newLabel: string }>;
	contextMap?: Record<string, string>;
	authorizeSourceDelete?: boolean;
}

export interface ReconfigureJournalState {
	hash: string;
	effects: SetupEffect[];
	completedEffects: number;
	phase: ReconfigurePhase;
}

export interface ReconfigureAdapters {
	writeJournal?: (hash: string, state: ReconfigureJournalState) => Promise<void>;
	readJournal?: () => Promise<{ hash: string; state: ReconfigureJournalState } | null>;
	removeJournal?: () => Promise<void>;
	writeAudit?: (record: Record<string, unknown>) => Promise<void>;
	applyEffect?: (effect: SetupEffect) => Promise<void>;
	revalidateFingerprints?: (effects: SetupEffect[]) => Promise<boolean>;
	now?: () => number;
}

export interface ReconfigureInjection {
	failAtPhase?: ReconfigurePhase;
	failAtEffectIndex?: number;
	driftEntries?: Record<string, string>;
}

export interface ReconfigurePlanResult {
	effects: SetupEffect[];
	hash: string;
	requiresConfirmation: boolean;
	dependencyClosure: string[];
	scope: string[];
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

export class ReconfigureError extends Error {
	readonly code: string;
}

export function plan(
	config: ReconfigureConfig,
	snapshot: ReconfigureTargetSnapshot,
	machine: ReconfigureMachineCapabilities,
	choices: ReconfigureChoices,
): ReconfigurePlanResult;

export function apply(
	config: ReconfigureConfig,
	snapshot: ReconfigureTargetSnapshot,
	machine: ReconfigureMachineCapabilities,
	choices: ReconfigureChoices,
	planHash: string,
	effects: SetupEffect[],
	adapters: ReconfigureAdapters,
	injection?: ReconfigureInjection,
): Promise<ReconfigureApplyResult>;

export function resume(
	config: ReconfigureConfig,
	snapshot: ReconfigureTargetSnapshot,
	machine: ReconfigureMachineCapabilities,
	choices: ReconfigureChoices,
	adapters: ReconfigureAdapters,
	injection?: ReconfigureInjection,
): Promise<ReconfigureApplyResult>;

export function acceptPartial(
	config: ReconfigureConfig,
	snapshot: ReconfigureTargetSnapshot,
	machine: ReconfigureMachineCapabilities,
	choices: ReconfigureChoices,
	adapters: ReconfigureAdapters,
): Promise<ReconfigureApplyResult>;
