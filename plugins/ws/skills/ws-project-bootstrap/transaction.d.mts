export type Harness = "claude" | "omp";
export type ProjectShape = "standalone" | "hub_root" | "hub_subrepository" | "not_git";
export type SetupState = "unconfigured" | "aligned" | "drifted" | "conflicting";
export type EffectClassification = "CREATE" | "UPDATE" | "PRESERVE" | "SKIP" | "NO-OP" | "BLOCKING_CONFLICT";

export interface RuntimeSnapshot {
	activeHarness: Harness;
	sessionDiscipline: boolean;
	dangerousGitGuard: boolean;
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
	git: { isRepository: boolean; root: string | null; origin: string | null };
	machine: RuntimeSnapshot;
	entries: Record<string, SnapshotEntry>;
}

export interface SetupChoices {
	profile: "recommended_local";
}

export interface SetupQuestion {
	id: "setup_profile";
	question: string;
	recommended: "recommended_local";
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
	effects: SetupEffect[];
}

export interface SetupReadiness {
	configValid: boolean;
	engineeringReady: boolean;
	trackerReady: boolean;
	runtimeReady: boolean;
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
}

export interface SetupTransactionResult {
	discovery: SetupDiscovery;
	questions: SetupQuestion[];
	plan?: SetupPlan;
	requiresConfirmation: boolean;
	operations: SetupOperation[];
	readiness?: SetupReadiness;
	report: string;
}


export const CANONICAL_CONFIG_YAML: string;
export const RECOMMENDED_LOCAL_CHOICES: Readonly<SetupChoices>;
export function discoverStandaloneRepository(root: string, machine: RuntimeSnapshot): Promise<SetupDiscovery>;
export function runSetupTransaction(request: SetupTransactionRequest): Promise<SetupTransactionResult>;
