import type { CanonicalProjectConfig } from "./config.d.mts";
import type { LocalTicket, SyncState } from "./sync.d.mts";
import type {
	ReconfigureAdapters,
	ReconfigureApplyResult,
	ReconfigureEffect,
	ReconfigureInjection,
	ReconfigureDomainSelection,
	ReconfigurePlanResult,
	ReconfigureRepositoryTarget,
} from "./reconfigure.d.mts";

export type TrackerDisposition = "preserve-as-history" | "copy-selected" | "copy-open" | "copy-all" | "cancel";

export interface TrackerStoreDisposition {
	storeId: string;
	disposition: TrackerDisposition;
	selectedItemIds?: string[];
}

export interface TrackerOwnershipChoices {
	domains: ReconfigureDomainSelection[];
	fields: string[];
	values?: Record<string, unknown>;
	sourceTracker: string;
	targetTracker: string;
	sourceProject?: string;
	targetProject?: string;
	sourceStores?: string[];
	dispositions: TrackerStoreDisposition[];
	excludedItemIds?: string[];
	excludeBlocked?: boolean;
	remoteFingerprints?: Record<string, unknown>;
	ownershipFingerprint?: unknown;
	shape?: "standalone" | "hub_root" | "hub_subrepository";
	repositoryId?: string;
	repositories?: string[];
	repositoryInventory?: ReconfigureRepositoryTarget[];
	machine?: Record<string, unknown>;
}

export interface TrackerSourcePreservation {
	store: string;
	id: string;
	disposition: TrackerDisposition;
	sourceLink: string;
	fingerprint: { identity: unknown; version: unknown; updatedAt: unknown; mappedFieldHash: string };
}

export interface TrackerOwnershipPlanResult extends ReconfigurePlanResult {
	stores: string[];
	sourcePreservation: TrackerSourcePreservation[];
}

export interface TrackerTicket extends LocalTicket {
	storeId?: string;
	remoteIdentity?: string;
	version?: string | number;
	updatedAt?: string;
	updated_at?: string;
	url?: string;
	sourceLink?: string;
	claimed?: boolean;
	localMetadata?: Record<string, unknown>;
	[key: string]: unknown;
}

export function planTrackerOwnership(
	config: CanonicalProjectConfig,
	localStore: Record<string, TrackerTicket>,
	syncState: SyncState & { conflicts?: Array<{ localId: string; resolved?: boolean }> },
	choices: TrackerOwnershipChoices,
): TrackerOwnershipPlanResult;

export function applyTrackerOwnership(
	config: CanonicalProjectConfig,
	localStore: Record<string, TrackerTicket>,
	syncState: SyncState,
	choices: TrackerOwnershipChoices,
	planHash: string,
	effects: ReconfigureEffect[],
	adapters: ReconfigureAdapters,
	injection?: ReconfigureInjection,
): Promise<ReconfigureApplyResult>;

export function resumeTrackerOwnership(
	config: CanonicalProjectConfig,
	localStore: Record<string, TrackerTicket>,
	syncState: SyncState,
	choices: TrackerOwnershipChoices,
	adapters: ReconfigureAdapters,
	injection?: ReconfigureInjection,
): Promise<ReconfigureApplyResult>;

export function acceptPartialTrackerOwnership(
	config: CanonicalProjectConfig,
	localStore: Record<string, TrackerTicket>,
	syncState: SyncState,
	choices: TrackerOwnershipChoices,
	adapters: ReconfigureAdapters,
): Promise<ReconfigureApplyResult>;
