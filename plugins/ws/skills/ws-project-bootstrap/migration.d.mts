import type { CanonicalProjectConfig, ConfigValidationResult } from "./config.d.mts";
import type { EngineeringMigrationResolutions } from "./migration-engineering.d.mts";
import type { EffectClassification } from "./transaction.d.mts";

export interface LegacyEntry {
	kind: "missing" | "file" | "directory" | "blocked";
	content: string | null;
	fingerprint: string | null;
	empty?: boolean;
}

export interface LegacyDiscovery {
	root: string;
	entries: Record<string, LegacyEntry>;
	machine: { sessionDiscipline?: boolean; dangerousGitGuard?: boolean };
	activeLocalWork: boolean;
	canonicalValidation: ConfigValidationResult | null;
	ompEdgeTemplate: string;
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

export interface ConfirmedMachineHints extends Record<string, unknown> {
	jiraProject?: string;
	guard?: boolean | "enabled" | "disabled";
	dashboard?: boolean | "jira_assignments" | "disabled";
	"jira.project"?: string;
	"commit.jira.actions"?: "never" | "disabled" | "ask" | "always";
	"runtime.dangerous_git_guard"?: boolean | "enabled" | "disabled";
	"ui.session_start_dashboard"?: boolean | "jira_assignments" | "disabled";
}

export interface LegacyMigrationOptions {
	resolutions?: EngineeringMigrationResolutions;
	selections?: Record<string, unknown>;
	confirmedMachineHints?: ConfirmedMachineHints;
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
	injectedFailure?: string,
): Promise<Array<{ action: "delete" | "update"; target: string }>>;
