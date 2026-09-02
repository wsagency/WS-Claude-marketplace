import type {
	RuntimeSnapshot,
	SetupChoices,
	SetupDiscovery,
	SetupEffect,
	SetupOperation,
	SetupPlan,
	SetupReadiness,
} from "./transaction.mjs";
import type { DocsPlan } from "../ws-docs-bootstrap/transaction.mjs";
import type {
	BackfillAudit,
	BackfillJiraAdapter,
	BackfillPersistence,
	BackfillPlan,
	BackfillResult,
} from "./backfill-jira.d.mts";
import type { CanonicalProjectConfig } from "./config.d.mts";
import type { LegacyMigrationPlan } from "./migration.d.mts";
import type { LocalTicket, SyncState } from "./sync.d.mts";

export interface PublicBackfillPlan {
	audit: BackfillAudit | null;
	plan: BackfillPlan | null;
	effects: SetupEffect[];
	localTicketsFingerprint: string | null;
	syncFingerprint: string | null;
}

export interface InternalBackfillPlan extends PublicBackfillPlan {
	blockers: string[];
	input?: {
		localTickets: Record<string, LocalTicket>;
		syncState: SyncState;
		jiraAdapter: BackfillJiraAdapter;
		persistence: BackfillPersistence & {
			readLocalTickets(): Promise<Record<string, LocalTicket>>;
		};
	};
}

export interface RegistryRepository {
	name: string;
	path: string;
	url?: string;
	description: string;
	tech?: string;
	type: "working" | "input" | "output";
	purpose?: string;
}

export interface HubRepositoryDiscovery extends SetupDiscovery {
	name: string;
	registry?: RegistryRepository & { normalizedPath: string };
	identity: { name: string; root: string; origin: string | null };
	preflightErrors: string[];
}

export interface ExcludedRepository {
	name: string;
	type: "working" | "input" | "output";
	purpose?: string;
	reason: string;
}

export interface HubDiscovery {
	root: string;
	machine: RuntimeSnapshot;
	hub: HubRepositoryDiscovery;
	working: HubRepositoryDiscovery[];
	excluded: ExcludedRepository[];
	registryError: string | null;
	registryFingerprint: string | null;
}

export interface HubChoices {
	hub?: Partial<SetupChoices>;
	working?: Record<string, Partial<SetupChoices>>;
	removedRepositories?: string[];
	documentation?: boolean;
}

export type HubPhase = "authorization" | "machine" | "preflight" | "core" | "backfill" | "docs" | "cleanup";
export type HubOutcomeStatus = "completed" | "failed" | "pending" | "preserved" | "skipped" | "excluded" | "no-op";

export interface HubBlocker {
	repository: string;
	root: string;
	target?: string;
	reason: string;
}

export interface PlannedPath {
	phase: "core" | "docs";
	target: string;
	classification: SetupEffect["classification"];
	range: string;
	diff: string;
}

export interface HubTargetPlan {
	name: string;
	root: string;
	role: "hub" | "working";
	identity: { name: string; root: string; origin: string | null };
	fingerprint: string;
	core?: SetupPlan;
	docs?: DocsPlan;
	legacy?: LegacyMigrationPlan;
	backfill?: PublicBackfillPlan | null;
	plannedPaths: PlannedPath[];
	dirtyPaths: string[];
	blockers: HubBlocker[];
}

export interface HubPlan {
	hash: string;
	scope: { root: string; projectShape: "hub_root" };
	registryFingerprint: string | null;
	hub?: SetupPlan;
	working: Array<{
		name: string;
		plan?: SetupPlan;
		docs?: DocsPlan;
		legacy?: LegacyMigrationPlan;
		backfill?: PublicBackfillPlan | null;
	}>;
	targets: HubTargetPlan[];
	excluded: ExcludedRepository[];
}

export interface HubOperation extends Omit<SetupOperation, "action"> {
	action: SetupOperation["action"] | "pending";
	remoteId?: string | null;
	repository: string;
	root: string | null;
	phase: "machine" | "core" | "backfill" | "docs" | "cleanup";
}

export interface HubOutcome {
	repository: string;
	phase: HubPhase;
	status: HubOutcomeStatus;
	target?: string;
	detail?: string;
}

export interface HubTransactionRequest {
	root: string;
	discovery: HubDiscovery;
	choices?: HubChoices;
	authorization?: string;
	injectedFailure?: {
		targetRoot: string;
		phase: "write" | "verify" | "core_write" | "core_verify" | "docs_write";
		target: string;
	};
	machinePrerequisite?: () => void | Promise<void>;
	beforePhase?: (boundary: { repository: string; root: string; phase: "core" | "docs" | "backfill" }) => void | Promise<void>;
	backfill?: {
		usesLocalJiraBackfill: (config: CanonicalProjectConfig) => boolean;
		plan: (config: CanonicalProjectConfig, target: { repository: string; root: string }) => Promise<InternalBackfillPlan | null>;
		publicPlan: (backfill: InternalBackfillPlan | null) => PublicBackfillPlan | null;
		execute: (backfill: InternalBackfillPlan) => Promise<BackfillResult>;
		refresh: (backfill: InternalBackfillPlan) => Promise<InternalBackfillPlan>;
		withReadiness: (readiness: SetupReadiness | undefined, backfill: InternalBackfillPlan, execution: BackfillResult) => SetupReadiness | undefined;
		operations: (execution: BackfillResult) => Array<Pick<HubOperation, "action" | "target" | "remoteId">>;
		failure: (execution: BackfillResult | undefined, error: Error) => {
			target: string;
			completed: string[];
			pending: string[];
			error: string;
		};
	};
}

export interface HubTransactionResult {
	discovery: HubDiscovery;
	questions: [];
	plan: HubPlan;
	requiresConfirmation: boolean;
	operations: HubOperation[];
	blockers: HubBlocker[];
	outcomes: HubOutcome[];
	rerunInstruction: "/ws-setup";
	readiness?: {
		hub?: SetupReadiness;
		working: Record<string, SetupReadiness>;
	};
	report: string;
}

export function parseProjectYaml(content: string): RegistryRepository[];
export function mergeConfig(hubConfigSource?: string, explicitConfigSource?: string): string;
export function discoverHubTransaction(root: string, machine: RuntimeSnapshot): Promise<HubDiscovery>;
export function runHubTransaction(request: HubTransactionRequest): Promise<HubTransactionResult>;
