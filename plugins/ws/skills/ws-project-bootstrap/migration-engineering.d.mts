import type { CanonicalProjectConfig, ConfigValidationResult } from "./config.d.mts";
import type { SetupEffect, SnapshotEntry } from "./transaction.d.mts";

export interface TrackerMigrationDiscovery {
	recognized: boolean;
	generated: boolean;
	primary?: "local" | "github" | "gitlab" | "jira";
	sync?: "disabled" | "all_local_tickets";
	jiraProject?: string;
}

export interface EngineeringDiscovery {
	hasEngineeringState: boolean;
	entries: Record<string, SnapshotEntry>;
	tracker: TrackerMigrationDiscovery | null;
	triage: { generated: boolean; labels: Record<string, string> | null } | null;
	domain: { generated: boolean; layout?: "single_context" | "multi_context" } | null;
	context: { agentsBlock: string | null; claudeBlock: string | null; conflict: boolean };
	activeLocalWork: boolean;
}

export interface EngineeringMigrationConflict {
	field: string;
	source?: string;
	sources?: string[];
	classification: "unsupported-custom" | "lossy" | "ambiguous";
}

export interface EngineeringMigrationPlan {
	patch: CanonicalProjectConfig;
	conflicts: EngineeringMigrationConflict[];
	suggestions: Array<{ field: string; source: string; classification: "choice-required" }>;
	effects: SetupEffect[];
	blockers: string[];
}

export function discoverEngineeringState(snapshots: Record<string, string | SnapshotEntry | boolean | undefined>): EngineeringDiscovery;
export function planEngineeringMigration(
	discovery: EngineeringDiscovery,
	currentCanonical?: CanonicalProjectConfig | null,
	resolutions?: Record<string, unknown>,
): EngineeringMigrationPlan;
export function checkEngineeringCleanupEligibility(
	plan: EngineeringMigrationPlan,
	canonicalValidation: ConfigValidationResult | { isValid: boolean },
	readiness: { engineeringReady?: boolean; contextReady?: boolean },
): { eligible: boolean; blockers: string[] };
