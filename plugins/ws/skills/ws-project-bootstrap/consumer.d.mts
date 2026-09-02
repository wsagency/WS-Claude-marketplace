import type { CanonicalProjectConfig, DerivedSetupReadiness } from "./config.d.mts";
import type { ConsumerCapability } from "./routing.d.mts";
import type { JiraAdapter, LocalTicket, SyncState, TrackerOperation } from "./sync.d.mts";

export type { ConsumerCapability } from "./routing.d.mts";

export interface ConsumerSnapshot {
	origin?: string;
	artifacts?: Record<string, boolean>;
	integrations?: Partial<Record<"github" | "gitlab" | "jira", boolean>>;
	integrationReasons?: Partial<Record<"github" | "gitlab" | "jira", string>>;
	runtime?: Record<string, boolean>;
	sync?: { pending?: number; conflicts?: number };
}

export interface CanonicalCapabilityResult {
	ready: boolean;
	degraded: boolean;
	capability: ConsumerCapability;
	configPath: ".wsagency/config.yaml";
	ownership: string;
	detectedLegacySources: string[];
	config: CanonicalProjectConfig | null;
	policy: Record<string, unknown> | null;
	operation: Record<string, unknown> | null;
	setupReadiness: DerivedSetupReadiness | null;
	blockers: string[];
	warnings: string[];
}

export interface InspectCanonicalCapabilityOptions {
	root?: string;
	capability: ConsumerCapability;
	snapshot?: ConsumerSnapshot;
}

export const CANONICAL_POLICY_PATH: ".wsagency/config.yaml";
export const REPOSITORY_LEGACY_POLICY_SOURCES: readonly string[];
export function detectRepositoryLegacyPolicy(root: string): string[];
export function inspectCanonicalCapability(options: InspectCanonicalCapabilityOptions): CanonicalCapabilityResult;
export function requireCanonicalCapability(options: InspectCanonicalCapabilityOptions): CanonicalCapabilityResult;

export class CanonicalCapabilityError extends Error {
	readonly code: "ERR_WS_CAPABILITY_NOT_READY";
	readonly result: CanonicalCapabilityResult;
}

export interface SynchronizedTrackerOperationOptions {
	root?: string;
	snapshot?: ConsumerSnapshot;
	localStore: Record<string, LocalTicket>;
	syncState: SyncState;
	operation: TrackerOperation | null;
	jiraAdapter: JiraAdapter;
	conflictChoices?: Array<{ localId: string; field: string; resolution: "local" | "jira" | "manual"; manualValue?: unknown }>;
}

export function runCanonicalSynchronizedTrackerOperation(options: SynchronizedTrackerOperationOptions): ReturnType<typeof import("./sync.mjs").runTrackerOperation>;
