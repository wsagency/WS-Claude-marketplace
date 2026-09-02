export type Harness = "claude" | "omp";
export type ProjectShape = "standalone" | "hub_root" | "hub_subrepository" | "not_git";
export type SetupState = "unconfigured" | "aligned" | "drifted" | "conflicting" | "invalid" | "older" | "future";
export type EffectClassification = "CREATE" | "UPDATE" | "PRESERVE" | "SKIP" | "NO-OP" | "BLOCKING_CONFLICT";

export interface RuntimeSnapshot {
	activeHarness: Harness;
	sessionDiscipline: boolean;
	dangerousGitGuard: boolean;
	ghCli?: boolean;
	glabCli?: boolean;
	jiraCli?: boolean;
}

export interface SnapshotEntry {
	kind: "missing" | "file" | "directory" | "blocked";
	content?: string;
	fingerprint: string | null;
}

export interface SetupDiscovery {
	root: string;
	projectShape: ProjectShape;
	setupState: SetupState;
	git: { isRepository: boolean; root: string | null; origin: string | null; head: string | null; dirty: string[] };
	machine: RuntimeSnapshot;
	entries: Record<string, SnapshotEntry>;
}

export interface OriginIdentity {
	provider: "github" | "gitlab";
	host: "github.com" | "gitlab.com";
	owner: string;
	repo: string;
}

export interface OriginVerificationRequest {
	origin: string;
	expectedIdentity: OriginIdentity;
}

export interface OriginVerification {
	accessible: boolean;
	identity: OriginIdentity | null;
	reason?: string;
}

export type OriginVerifier = (request: OriginVerificationRequest) => Promise<OriginVerification>;
export interface SetupChoices {
	profile: "recommended_local" | "canonical" | "materialized";
	createRepository?: boolean;
	origin?: string;
	targetConfig?: string;
	capabilities?: { ghCli?: boolean; glabCli?: boolean };
	jiraValidation?: { ready: boolean; reason?: string };
	docsReadiness?: { ready: boolean; reason?: string };
}

export interface SetupQuestion {
	id: "setup_profile" | "create_repository" | "origin_url";
	question: string;
	recommended?: "recommended_local" | boolean | string;
}

export interface SetupEffect {
	order: number;
	target: string;
	kind: "file" | "directory" | "state";
	classification: EffectClassification;
	reason: string;
	before?: string;
	after?: string;
	diff: string;
	fingerprint: string | null;
}

export interface SetupPlan {
	hash: string;
	scope: { root: string; projectShape: ProjectShape };
	originIdentity: OriginIdentity | null;
	effects: SetupEffect[];
}

export interface SetupReadiness {
	configValid: boolean;
	engineeringReady: boolean;
	trackerReady: boolean;
	docsReady: boolean;
	docsConfigured: boolean;
	runtimeReady: boolean;
	blockers: { tracker: string[]; docs: string[] };
}

export interface SetupOperation {
	action: "write" | "verify";
	target: string;
}

export interface SetupTransactionRequest {
	root: string;
	discovery: SetupDiscovery;
	choices?: SetupChoices;
	authorization?: string;
	originVerifier?: OriginVerifier;
	injectedFailure?: { phase: "write" | "verify"; target: string };
}

export interface SetupTransactionFailure {
	target: string;
	error: string;
	completed: string[];
	pending: string[];
}

export interface SetupTransactionResult {
	discovery: SetupDiscovery;
	questions: SetupQuestion[];
	plan?: SetupPlan;
	requiresConfirmation: boolean;
	operations: SetupOperation[];
	readiness?: SetupReadiness;
	failure?: SetupTransactionFailure;
	report: string;
}


export const CANONICAL_CONFIG_YAML: string;
export const RECOMMENDED_LOCAL_CHOICES: Readonly<SetupChoices>;
export function discoverStandaloneRepository(root: string, machine: RuntimeSnapshot): Promise<SetupDiscovery>;
export function verifyOriginWithGit(request: OriginVerificationRequest): Promise<OriginVerification>;
export function runSetupTransaction(request: SetupTransactionRequest): Promise<SetupTransactionResult>;
export function discoveryIsAligned(discovery: SetupDiscovery, targetConfig?: string, choices?: Partial<SetupChoices>): boolean;
export function buildPlan(discovery: SetupDiscovery, choices: SetupChoices, originVerification?: OriginVerification | null): SetupPlan;
export function deriveReadiness(discovery: SetupDiscovery, choices?: Partial<SetupChoices>): SetupReadiness;
export function applyPlan(root: string, plan: SetupPlan, injectedFailure?: SetupTransactionRequest["injectedFailure"]): Promise<{
	operations: SetupOperation[];
	failure: null | { target: string; error: Error; completed: string[]; pending: string[] };
}>;
