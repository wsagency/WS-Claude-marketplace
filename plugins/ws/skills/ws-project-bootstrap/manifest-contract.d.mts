import type { CanonicalProjectConfig, DerivedSetupReadiness } from "./config.d.mts";
import type { HubChoices, HubDiscovery, HubOutcome, HubOperation, HubTransactionResult } from "./hub-transaction.d.mts";
import type { LegacyCleanupReadiness, LegacyDiscovery, LegacyMigrationOptions, LegacyMigrationPlan } from "./migration.d.mts";
import type {
	ReconfigureAdapters,
	ReconfigureApplyResult,
	ReconfigureChoices,
	ReconfigureInjection,
	ReconfigureMachineCapabilities,
	ReconfigurePlanContribution,
	ReconfigurePlanResult,
	ReconfigureTargetSnapshot,
} from "./reconfigure.d.mts";
import type {
	EffectClassification,
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

export interface ManifestResult {
	manifest: DeterministicManifest;
	requiresAuthorization: boolean;
	applied: boolean;
	operations: SetupOperation[] | HubOperation[] | ReconfigureApplyResult["operationReport"];
	readiness?: SetupReadiness | LegacyCleanupReadiness | DerivedSetupReadiness | HubTransactionResult["readiness"];
	report: string;
	failure?: SetupTransactionFailure;
	outcomes?: HubOutcome[];
	phase?: ReconfigureApplyResult["phase"];
	ownership?: ReconfigureApplyResult["ownershipReport"];
}

export interface ManifestInjection {
	originValidation?: { origin: string; isValid: boolean; reason?: string };
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
}

export interface MigrationManifestRequest {
	mode: "migration";
	root: string;
	snapshot: { legacy: LegacyDiscovery; core: SetupDiscovery };
	choices?: { migration?: LegacyMigrationOptions; core?: Partial<SetupChoices> };
	authorization?: string;
	injection?: ManifestInjection;
	adapters?: {
		verifyMigrationReadiness?: (input: {
			manifest: DeterministicManifest;
			legacyPlan: LegacyMigrationPlan;
			coreResult: unknown;
		}) => LegacyCleanupReadiness | Promise<LegacyCleanupReadiness>;
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
		beforePhase?: (boundary: { repository: string; root: string; phase: "core" | "docs" }) => void | Promise<void>;
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
	action?: "apply" | "resume";
	context?: unknown;
	adapters?: ReconfigureAdapters;
	authorization?: string;
	injection?: ManifestInjection;
}

export const MANIFEST_CONTRACT_VERSION: 1;
export const MANIFEST_CLASSIFICATIONS: readonly ManifestClassification[];
export function runManifestTransaction(
	request: SetupManifestRequest | MigrationManifestRequest | HubManifestRequest | ReconfigureManifestRequest,
): Promise<ManifestResult>;
