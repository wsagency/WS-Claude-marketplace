import type { CanonicalProjectConfig } from "./config.d.mts";
import type { LocalTicket, SyncState } from "./sync.d.mts";
import type { SetupEffect, SetupReadiness } from "./transaction.d.mts";
import type { ReconfigureAdapters, ReconfigurePhase, ReconfigureInjection } from "./reconfigure.d.mts";

export type TrackerDisposition = "preserve-as-history" | "copy-selected" | "copy-open" | "copy-all" | "cancel";

export interface TrackerStoreDisposition {
	storeId: string;
	disposition: TrackerDisposition;
	selectedItemIds?: string[];
}

export interface TrackerOwnershipChoices {
	sourceTracker: string;
	targetTracker: string;
	sourceProject?: string;
	targetProject?: string;
	dispositions: TrackerStoreDisposition[];
	excludeBlocked?: boolean;
}

export interface TrackerOwnershipPlanResult {
	effects: SetupEffect[];
	hash: string;
	requiresConfirmation: boolean;
	blockers: string[];
	report: string;
}

export interface TrackerOwnershipApplyResult {
	success: boolean;
	phase: ReconfigurePhase;
	completedEffects: number;
	hash: string;
	readiness: SetupReadiness;
	report: string;
}

export function planTrackerOwnership(
	config: CanonicalProjectConfig,
	localStore: Record<string, LocalTicket>,
	syncState: SyncState,
	choices: TrackerOwnershipChoices
): TrackerOwnershipPlanResult;

export function applyTrackerOwnership(
	config: CanonicalProjectConfig,
	localStore: Record<string, LocalTicket>,
	syncState: SyncState,
	choices: TrackerOwnershipChoices,
	planHash: string,
	effects: SetupEffect[],
	adapters: ReconfigureAdapters,
	injection?: ReconfigureInjection
): Promise<TrackerOwnershipApplyResult>;

