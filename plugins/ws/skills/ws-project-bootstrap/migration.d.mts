import type { CanonicalProjectConfig, ConfigValidationResult } from "./config.d.mts";
import type { EffectClassification } from "./transaction.d.mts";

export interface LegacyEntry {
	kind: "missing" | "file" | "directory" | "blocked";
	content: string | null;
	fingerprint: string | null;
}

export interface LegacyDiscovery {
	root: string;
	entries: Record<string, LegacyEntry>;
	machine: { sessionDiscipline?: boolean; dangerousGitGuard?: boolean };
	activeLocalWork: boolean;
	canonicalValidation: ConfigValidationResult | null;
}

export interface LegacyMigrationEffect {
	order: number;
	target: string;
	kind: "file" | "directory" | "state";
	classification: EffectClassification;
	reason: string;
	before: string | null;
	after: string | null;
	diff: string;
	fingerprint: string | null;
}

export interface LegacyMigrationConflict {
	field: string;
	classification: string;
	source?: string;
	sources?: string[];
	values?: Array<{ source: string; value: unknown }>;
}

export interface LegacyMigrationPlan {
	hash: string;
	config: CanonicalProjectConfig | null;
	effects: LegacyMigrationEffect[];
	blockers: string[];
	conflicts: LegacyMigrationConflict[];
	requiresConfirmation: boolean;
	report: string;
}

export interface LegacyMigrationOptions {
	resolutions?: Record<string, unknown>;
	selections?: Record<string, unknown>;
	confirmedMachineHints?: Record<string, unknown>;
}

export interface LegacyCleanupRuntimeEvidence {
	sessionDiscipline?: boolean;
	dangerousGitGuard?: boolean;
}

export function discoverLegacySetup(root: string, machine?: LegacyDiscovery["machine"]): Promise<LegacyDiscovery>;
export function planLegacyMigration(discovery: LegacyDiscovery, options?: LegacyMigrationOptions): LegacyMigrationPlan;
export function applyLegacyCleanup(
	root: string,
	plan: LegacyMigrationPlan,
	authorization: string,
	runtimeEvidence?: LegacyCleanupRuntimeEvidence,
): Promise<Array<{ action: "delete"; target: string }>>;
