import type { CanonicalProjectConfig, ConfigValidationResult } from "./config.d.mts";
import type { MigrationEffect } from "./migration-primitives.d.mts";
import type { SnapshotEntry } from "./transaction.d.mts";

export interface TrackerMigrationDiscovery {
	recognized: boolean;
	generated: boolean;
	managed: boolean;
	primary?: "local" | "github" | "gitlab" | "jira";
	sync?: "disabled" | "all_local_tickets";
	jiraProject?: string;
}

export interface EngineeringDiscovery {
	hasEngineeringState: boolean;
	entries: Record<string, SnapshotEntry>;
	tracker: TrackerMigrationDiscovery | null;
	triage: { generated: boolean; managed: boolean; labels: Record<string, string> | null } | null;
	domain: { generated: boolean; managed: boolean; layout?: "single_context" | "multi_context" } | null;
	context: { agentsBlock: string | null; claudeBlock: string | null; conflict: boolean };
	activeLocalWork: boolean;
}

export interface EngineeringMigrationConflict {
	field: string;
	source?: string;
	sources?: string[];
	classification: "unsupported-custom" | "lossy" | "ambiguous" | "reviewed-merge-required" | "invalid-reviewed-merge";
}

export interface ReviewedAdapterMerge {
	action: "merge";
	content: string;
}

export interface EngineeringMigrationResolutions extends Record<string, unknown> {
	"adapter.tracker"?: "preserve" | "replace" | ReviewedAdapterMerge;
	"adapter.triage"?: "preserve" | "replace" | ReviewedAdapterMerge;
	"adapter.domain"?: "preserve" | "replace" | ReviewedAdapterMerge;
}

export interface EngineeringMigrationPlan {
	patch: CanonicalProjectConfig;
	conflicts: EngineeringMigrationConflict[];
	suggestions: Array<{ field: string; source: string; classification: "choice-required" }>;
	effects: MigrationEffect[];
	blockers: string[];
}

export function discoverEngineeringState(snapshots: Record<string, string | SnapshotEntry | boolean | undefined>): EngineeringDiscovery;
export function planEngineeringMigration(
	discovery: EngineeringDiscovery,
	currentCanonical?: CanonicalProjectConfig | null,
	resolutions?: EngineeringMigrationResolutions,
): EngineeringMigrationPlan;
export function checkEngineeringCleanupEligibility(
	plan: EngineeringMigrationPlan,
	canonicalValidation: ConfigValidationResult | { isValid: boolean },
	readiness: { engineeringReady?: boolean; contextReady?: boolean },
): { eligible: boolean; blockers: string[] };
