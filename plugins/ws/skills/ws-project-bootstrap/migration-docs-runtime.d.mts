import type { CanonicalProjectConfig, ConfigValidationResult } from "./config.d.mts";
import type { SetupEffect } from "./transaction.d.mts";

export interface LegacySnapshotEntry {
	kind: "missing" | "file" | "directory" | "blocked" | "state";
	content?: unknown;
	fingerprint: string | null;
}

export interface DocsRuntimeDiscovery {
	entries: Record<string, LegacySnapshotEntry>;
	docs: Record<string, unknown>;
	project: Record<string, unknown>;
	settings: Record<string, unknown>;
	malformed: string[];
	unknownDocsFields: string[];
	context: { thinClaude: boolean; fatClaude: boolean; authoredAgents: boolean; conflicting: boolean };
	runtime: { sessionDiscipline: boolean; dangerousGitGuard: boolean; repositoryOwned: boolean; customized: boolean };
}

export interface DocsRuntimeMigrationConflict {
	field: string;
	classification: "ambiguous" | "insufficient-evidence";
	sources: string[];
}

export interface DocsRuntimeMigrationPlan {
	patch: CanonicalProjectConfig;
	conflicts: DocsRuntimeMigrationConflict[];
	blockers: string[];
	effects: SetupEffect[];
}

export function discoverDocsRuntimeState(
	snapshots: Record<string, string | LegacySnapshotEntry | Record<string, unknown> | undefined>,
	machine?: { sessionDiscipline?: boolean; dangerousGitGuard?: boolean },
): DocsRuntimeDiscovery;
export function planDocsRuntimeMigration(
	discovery: DocsRuntimeDiscovery,
	currentCanonical?: CanonicalProjectConfig | null,
	resolutions?: Record<string, unknown>,
): DocsRuntimeMigrationPlan;
export function checkDocsRuntimeCleanupEligibility(
	plan: DocsRuntimeMigrationPlan,
	canonicalValidation: ConfigValidationResult | { isValid: boolean },
	readiness: { docsReady?: boolean; contextReady?: boolean; runtimeReady?: boolean },
): { eligible: boolean; blockers: string[] };
