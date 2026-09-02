import type { BackfillJiraAdapter, BackfillPersistence } from "./backfill-jira.d.mts";
import type { LocalTicket, SyncState } from "./sync.d.mts";
import type { CanonicalProjectConfig, DerivedSetupReadiness } from "./config.d.mts";
import type { HubChoices, HubDiscovery, HubOutcome, HubOperation, HubTransactionResult } from "./hub-transaction.d.mts";
import type { LegacyDiscovery, LegacyMigrationOptions, LegacyMigrationPlan } from "./migration.d.mts";
import type {
	ReconfigureAdapters,
	ReconfigureApplyResult,
	ReconfigureOperationReport,
	ReconfigureChoices,
	ReconfigureInjection,
	ReconfigureMachineCapabilities,
	ReconfigurePlanContribution,
	ReconfigurePlanResult,
	ReconfigureTargetSnapshot,
} from "./reconfigure.d.mts";
import type {
	EffectClassification,
	OriginVerifier,
	SetupChoices,
	SetupDiscovery,
	SetupOperation,
	SetupReadiness,
	SetupTransactionFailure,
} from "./transaction.d.mts";

export type ManifestMode = "setup" | "migration" | "hub" | "reconfigure";
export type ManifestClassification = EffectClassification | "DELETE";

export interface ManifestItem {
	id: string;
	order: number;
	phase: string;
	scope: string;
	target: string;
	kind: string;
	classification: ManifestClassification;
	reason: string;
	diff: string;
	fingerprint: unknown;
}

export interface DeterministicManifest {
	version: 1;
	mode: ManifestMode;
	hash: string;
	scope: unknown;
	items: ManifestItem[];
	categories: Record<ManifestClassification, ManifestItem[]>;
	blockers: string[];
	delegated: unknown;
}

export interface ManifestBackfillAdapters {
	localTickets: Record<string, LocalTicket>;
	syncState: SyncState;
	jiraAdapter: BackfillJiraAdapter;
	persistence: BackfillPersistence & { readLocalTickets(): Promise<Record<string, LocalTicket>> };
}

export type ManifestOperation = SetupOperation | HubOperation | {
	action: "verify" | "pending" | "delete" | "update";
	target: string;
	remoteId?: string | null;
};

export interface MigrationManifestReadiness {
	configValid: boolean;
	semanticReadBack: boolean;
	engineeringReady: boolean;
	contextReady: boolean;
	runtimeReady: boolean;
	fingerprintsReady: boolean;
	docsReady: boolean;
	jiraReady: boolean;
	jiraBackfillReady?: boolean;
	blockers?: Record<string, string[]>;
}

export interface ArrayManifestResult {
	manifest: DeterministicManifest & { mode: Exclude<ManifestMode, "reconfigure"> };
	requiresAuthorization: boolean;
	applied: boolean;
	operations: ManifestOperation[];
	readiness?: SetupReadiness | MigrationManifestReadiness | HubTransactionResult["readiness"];
	report: string;
	failure?: SetupTransactionFailure;
	outcomes?: HubOutcome[];
}

export interface ReconfigureManifestResult {
	manifest: DeterministicManifest & { mode: "reconfigure" };
	requiresAuthorization: boolean;
	applied: boolean;
	operations: [] | ReconfigureOperationReport;
	readiness?: DerivedSetupReadiness;
	report: string;
	phase?: ReconfigureApplyResult["phase"];
	ownership?: ReconfigureApplyResult["ownershipReport"];
}

export type ManifestResult = ArrayManifestResult | ReconfigureManifestResult;

export interface ManifestInjection {
	docsFailure?: string;
	cleanupFailure?: string;
	failure?: { phase: "write" | "verify"; target: string } | {
		targetRoot: string;
		phase: "write" | "verify" | "core_write" | "core_verify" | "docs_write";
		target: string;
	};
	reconfigure?: ReconfigureInjection;
}

export interface SetupManifestRequest {
	mode: "setup";
	root: string;
	snapshot: SetupDiscovery;
	choices: SetupChoices;
	authorization?: string;
	injection?: ManifestInjection;
	adapters?: { originVerifier?: OriginVerifier; jiraBackfill?: ManifestBackfillAdapters };
}

export interface MigrationManifestRequest {
	mode: "migration";
	root: string;
	snapshot: { legacy: LegacyDiscovery; core: SetupDiscovery };
	choices?: { migration?: LegacyMigrationOptions; core?: Partial<SetupChoices> };
	authorization?: string;
	injection?: ManifestInjection;
	adapters?: {
		jiraBackfill?: ManifestBackfillAdapters;
		verifyMigrationReadiness?: (input: {
			manifest: DeterministicManifest;
			legacyPlan: LegacyMigrationPlan;
			coreResult: unknown;
		}) => Partial<MigrationManifestReadiness> | Promise<Partial<MigrationManifestReadiness>>;
	};
}

export interface HubManifestRequest {
	mode: "hub";
	root: string;
	snapshot: HubDiscovery;
	choices?: HubChoices;
	authorization?: string;
	injection?: ManifestInjection;
	adapters?: {
		machinePrerequisite?: () => void | Promise<void>;
		beforePhase?: (boundary: { repository: string; root: string; phase: "core" | "docs" | "backfill" }) => void | Promise<void>;
		backfillFactory?: (boundary: { repository: string; root: string }) => ManifestBackfillAdapters | Promise<ManifestBackfillAdapters>;
	};
}

export interface ReconfigureManifestRequest {
	mode: "reconfigure";
	root: string;
	snapshot: {
		config: CanonicalProjectConfig;
		target: ReconfigureTargetSnapshot;
		machine: ReconfigureMachineCapabilities;
	};
	choices: ReconfigureChoices;
	contribution?: ReconfigurePlanContribution;
	action?: "apply" | "resume" | "accept_partial";
	context?: unknown;
	adapters?: ReconfigureAdapters;
	authorization?: string;
	injection?: ManifestInjection;
}

export const MANIFEST_CONTRACT_VERSION: 1;
export const MANIFEST_CLASSIFICATIONS: readonly ManifestClassification[];
export type ManifestRequest = SetupManifestRequest | MigrationManifestRequest | HubManifestRequest | ReconfigureManifestRequest;
export type ManifestResultFor<Request extends ManifestRequest> =
	Request extends ReconfigureManifestRequest ? ReconfigureManifestResult : ArrayManifestResult;
export function runManifestTransaction<Request extends ManifestRequest>(
	request: Request,
): Promise<ManifestResultFor<Request>>;
