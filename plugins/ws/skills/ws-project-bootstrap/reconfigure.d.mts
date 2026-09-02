import type { CanonicalProjectConfig, DerivedSetupReadiness } from "./config.d.mts";
import type { ProjectShape } from "./transaction.d.mts";

export type ReconfigureDomain = "tracker" | "documentation" | "runtime";
export type ReconfigureDomainSelection = ReconfigureDomain | "all";
export type ReconfigurePhase = "prepare" | "cutover" | "cleanup" | "done";
export type ReconfigureClassification = "CREATE" | "UPDATE" | "DELETE" | "PRESERVE" | "SKIP" | "NO-OP" | "BLOCKING_CONFLICT";
export type TriageRole = "needs_triage" | "needs_info" | "ready_for_agent" | "ready_for_human" | "wontfix";

export type ReconfigureConfig = CanonicalProjectConfig | Record<string, CanonicalProjectConfig>;

export interface ReconfigureMachineCapabilities {
	canWriteSharedGuards?: boolean;
	sharedGuardsOwnedBy?: string[];
	sharedGuardExactGenerated?: boolean;
	sharedGuardFingerprint?: unknown;
	sessionDisciplineDelivered?: boolean;
	sessionDisciplineFingerprint?: unknown;
	dangerousGitGuardDelivered?: boolean;
	dangerousGitGuardFingerprint?: unknown;
}

export interface ReconfigureSnapshotEntry {
	kind?: "file" | "directory" | "missing" | "blocked" | "state";
	content?: unknown;
	fingerprint?: unknown;
	remoteFingerprint?: unknown;
	remoteFingerprintAfterCutover?: unknown;
}


export interface ReconfigureRepositoryTarget {
	id: string;
	type: "hub" | "working" | "input" | "output";
	present: boolean;
	config?: CanonicalProjectConfig;
	entries?: Record<string, ReconfigureSnapshotEntry>;
	machine?: ReconfigureMachineCapabilities;
}
export interface ReconfigureRepositoryState {
	config?: CanonicalProjectConfig;
	entries?: Record<string, ReconfigureSnapshotEntry>;
	machine?: ReconfigureMachineCapabilities;
}
export interface ReconfigureTargetSnapshot {
	isRepository?: boolean;
	shape: ProjectShape;
	repositoryId?: string;
	entries?: Record<string, ReconfigureSnapshotEntry>;
	repositories?: ReconfigureRepositoryTarget[];
	repositoryStates?: Record<string, ReconfigureRepositoryState>;
	repositoryEntries?: Record<string, Record<string, ReconfigureSnapshotEntry>>;
	entriesByRepository?: Record<string, Record<string, ReconfigureSnapshotEntry>>;
	configs?: Record<string, CanonicalProjectConfig>;
}

export interface DomainArtifactRoute {
	source: string;
	destination: string;
	kind: "context" | "decision" | "map";
	intent: "copy" | "move";
	collisionResolution?: "keep-destination";
	authorizeSourceDelete?: boolean;
}

export interface ReconfigureChoices {
	domains: ReconfigureDomainSelection[];
	fields: string[];
	values?: Record<string, unknown>;
	repositories?: string[];
	repositoryChoices?: Record<string, Partial<Omit<ReconfigureChoices, "repositories" | "repositoryChoices" | "byRepository">>>;
	byRepository?: Record<string, Partial<Omit<ReconfigureChoices, "repositories" | "repositoryChoices" | "byRepository">>>;
	cancelDependent?: boolean;
	authorizeOwnedCleanup?: boolean;
	triageMappings?: Partial<Record<TriageRole, string | { newLabel: string }>>;
	contextMap?: Record<string, string | Omit<DomainArtifactRoute, "source">>;
	artifactRoutes?: DomainArtifactRoute[];
	authorizeSourceDelete?: boolean;
}

export interface ReconfigureEffect {
	id: string;
	repositoryId?: string;
	order: number;
	phase: Exclude<ReconfigurePhase, "done">;
	target: string;
	kind: "file" | "directory" | "state";
	classification: ReconfigureClassification;
	reason: string;
	before?: unknown;
	after?: unknown;
	diff: string;
	fingerprint: unknown;
	remoteFingerprint?: unknown;
	dependencies?: string[];
	correlationToken?: string;
	destructive?: boolean;
	operation?: string;
	payload?: Record<string, unknown>;
}

export interface ReconfigureDependency {
	field: string;
	reason: string;
	resolution: "selected" | "retained-compatible";
	current?: unknown;
	effectId?: string;
}

export interface ReconfigureBlocker {
	id: string;
	target: string;
	reason: string;
}

export interface ReconfigureFingerprints {
	local: Record<string, unknown>;
	machine: Record<string, unknown>;
	remote: Record<string, unknown>;
}

export interface ReconfigureConfigSectionRemoval {
	section: string;
	reason: string;
	dependencies?: string[];
}

export interface ReconfigurePlanContribution {
	effects?: Array<Partial<ReconfigureEffect> & Pick<ReconfigureEffect, "target" | "kind" | "classification" | "reason" | "diff" | "fingerprint">>;
	blockers?: ReconfigureBlocker[];
	dependencyClosure?: Array<string | ReconfigureDependency>;
	fieldDependencies?: Record<string, string[]>;
	configSectionRemovals?: ReconfigureConfigSectionRemoval[];
	repositoryContributions?: Record<string, ReconfigurePlanContribution>;
	byRepository?: Record<string, ReconfigurePlanContribution>;
}

export interface ReconfigurePlanResult {
	effects: ReconfigureEffect[];
	hash: string;
	authorizationPayload: Record<string, unknown> & { effects: Array<Record<string, unknown>> };
	choicesHash: string;
	requiresConfirmation: boolean;
	dependencyClosure: ReconfigureDependency[];
	scope: string[];
	domains: ReconfigureDomain[];
	fingerprints: ReconfigureFingerprints;
	fingerprintsByRepository?: Record<string, ReconfigureFingerprints>;
	repositoryConfigs?: Record<string, { configDigest: string; proposedConfigDigest: string; choicesHash?: string }>;
	repositoryPlans?: Record<string, ReconfigurePlanResult>;
	configDigest?: string;
	proposedConfigDigest?: string;
	itemIds: string[];
	correlationTokens: string[];
	blockers: ReconfigureBlocker[];
	report: string;
	affectedItems?: Array<Record<string, unknown>>;
	collisions?: Array<Record<string, unknown>>;
}

export interface ReconfigureJournalOperation {
	id: string;
	repositoryId: string | null;
	target: string;
	kind: ReconfigureEffect["kind"];
	classification: ReconfigureClassification;
	phase: Exclude<ReconfigurePhase, "done">;
	operation: string | null;
	dependencies: string[];
	correlationToken: string | null;
	fingerprint: unknown;
	remoteFingerprint: unknown;
	destructive: boolean;
	authorizationDigest: string;
}

export interface ReconfigureVerifiedResult {
	repositoryId: string | null;
	target: string;
	identity: unknown;
	version: unknown;
	hash: string;
	fingerprint: unknown;
}

export interface ReconfigureJournalState {
	schemaVersion: 3;
	planHash: string;
	choicesHash: string;
	scope: string[];
	domains: ReconfigureDomain[];
	phase: ReconfigurePhase;
	status: "in_progress" | "failed" | "completed";
	authorizedPlan: ReconfigurePlanResult["authorizationPayload"];
	authorizedPlanDigest: string;
	authorizedRemainder: string[];
	repositoryConfigs: Record<string, { configDigest: string; proposedConfigDigest: string; choicesHash?: string }>;
	operations: ReconfigureJournalOperation[];
	appliedIds: string[];
	verifiedIds: string[];
	returnedIdentities: Record<string, unknown>;
	verifiedResults: Record<string, ReconfigureVerifiedResult>;
	correlationTokens: string[];
	fingerprints: ReconfigureFingerprints;
	fingerprintsByRepository: Record<string, ReconfigureFingerprints>;
	failed: { effectId: string | null; phase: ReconfigurePhase; code: string; message: string } | null;
	startedAt: number;
}

export interface ReconfigureOperationReport {
	completed: string[];
	preserved: string[];
	skipped: string[];
	noOp: string[];
	pending: string[];
	failed: string[];
	byRepository?: Record<string, Omit<ReconfigureOperationReport, "byRepository">>;
}

export interface ReconfigureAdapters {
	writeJournal: (hash: string, state: ReconfigureJournalState) => Promise<void>;
	readJournal: () => Promise<{ hash?: string; state: ReconfigureJournalState } | ReconfigureJournalState | null>;
	removeJournal: () => Promise<void>;
	appendAudit?: (record: Record<string, unknown>) => Promise<void>;
	writeAudit?: (record: Record<string, unknown>) => Promise<void>;
	applyEffect: (effect: ReconfigureEffect, context: unknown) => Promise<{ identity?: unknown; fingerprint?: unknown } | void>;
	verifyEffect: (
		effect: ReconfigureEffect,
		outcome: unknown,
		context: unknown,
	) => Promise<boolean | { verified?: boolean; valid?: boolean; identity?: unknown; fingerprint?: unknown; version?: unknown; hash?: string }>;
	recoverRemoteResultByCorrelation?: (correlationToken: string, effect: ReconfigureEffect, context: unknown) => Promise<unknown>;
	findRemoteResultByCorrelation?: (correlationToken: string, effect: ReconfigureEffect, context: unknown) => Promise<unknown>;
	resolveCorrelationToken?: (correlationToken: string, effect: ReconfigureEffect, context: unknown) => Promise<unknown>;
	revalidateLocalFingerprints?: (fingerprints: Record<string, unknown>, plan: ReconfigurePlanResult, effect?: ReconfigureEffect) => Promise<boolean>;
	revalidateMachineFingerprints?: (fingerprints: Record<string, unknown>, plan: ReconfigurePlanResult, effect?: ReconfigureEffect) => Promise<boolean>;
	revalidateFingerprints?: (fingerprints: Record<string, unknown>, plan: ReconfigurePlanResult, effect?: ReconfigureEffect) => Promise<boolean>;
	refetchRemoteFingerprint?: (effect: ReconfigureEffect & { expectedFingerprint?: unknown }) => Promise<unknown>;
	verifyCutover?: (state: ReconfigureJournalState, plan: ReconfigurePlanResult) => Promise<boolean>;
	verifyPhase?: (phase: Exclude<ReconfigurePhase, "done">, state: ReconfigureJournalState, plan: ReconfigurePlanResult) => Promise<boolean>;
	verifyCompletion?: (state: ReconfigureJournalState, plan: ReconfigurePlanResult) => Promise<boolean>;
	validatePartialState?: (input: unknown) => Promise<{ valid: boolean; readiness?: DerivedSetupReadiness; ownershipReport?: Record<string, string> }>;
	deriveReadiness?: (state: ReconfigureJournalState | null, plan: ReconfigurePlanResult) => Promise<DerivedSetupReadiness>;
	now?: () => number;
}

export interface ReconfigureInjection {
	failAtPhase?: Exclude<ReconfigurePhase, "done">;
	failAtEffectIndex?: number;
	failAtEffectId?: string;
	failAfterApplyAtEffectIndex?: number;
	failAfterApplyAtEffectId?: string;
	failAfterApplyBeforeJournalAtEffectIndex?: number;
	failAfterApplyBeforeJournalAtEffectId?: string;
}

export interface ReconfigureApplyResult {
	success: boolean;
	phase: ReconfigurePhase;
	completedEffects: number;
	hash: string;
	readiness: DerivedSetupReadiness;
	report: string;
	operationReport: ReconfigureOperationReport;
	ownershipReport: Record<string, string>;
}

export class ReconfigureError extends Error {
	readonly code: string;
}

export function createReconfigurePlan(
	config: ReconfigureConfig,
	snapshot: ReconfigureTargetSnapshot,
	machine: ReconfigureMachineCapabilities,
	choices: ReconfigureChoices,
	contribution?: ReconfigurePlanContribution,
): ReconfigurePlanResult;

export function plan(
	config: ReconfigureConfig,
	snapshot: ReconfigureTargetSnapshot,
	machine: ReconfigureMachineCapabilities,
	choices: ReconfigureChoices,
): ReconfigurePlanResult;

export function applyConfirmedPlan(plan: ReconfigurePlanResult, context: unknown, adapters: ReconfigureAdapters, injection?: ReconfigureInjection): Promise<ReconfigureApplyResult>;
export function resumeConfirmedPlan(plan: ReconfigurePlanResult, context: unknown, adapters: ReconfigureAdapters, injection?: ReconfigureInjection): Promise<ReconfigureApplyResult>;
export function acceptConfirmedPartial(config: ReconfigureConfig, plan: ReconfigurePlanResult, context: unknown, adapters: ReconfigureAdapters): Promise<ReconfigureApplyResult>;

export function apply(
	config: ReconfigureConfig,
	snapshot: ReconfigureTargetSnapshot,
	machine: ReconfigureMachineCapabilities,
	choices: ReconfigureChoices,
	planHash: string,
	effects: ReconfigureEffect[],
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
