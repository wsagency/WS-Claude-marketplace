export interface OriginIdentity {
	provider: "github" | "gitlab";
	host: string;
	owner: string;
	repo: string;
}

export function parseOriginIdentity(originUrl: string | null | undefined): OriginIdentity | null;

export function discoverProviders(originUrl: string | null | undefined): string[];
export function evaluateProviderReadiness(
	primary: string | null | undefined,
	originUrl: string | null | undefined,
	capabilities?: CapabilitiesSnapshot,
): JiraValidationResult;


export interface JiraValidationResult {
	ready: boolean;
	reason?: string;
}

export class FakeJiraAdapter {
	missingBinary: boolean;
	authFailed: boolean;
	projectMissing: boolean;

	constructor(options?: { missingBinary?: boolean; authFailed?: boolean; projectMissing?: boolean });
	checkCapability(): Promise<JiraValidationResult>;
	verifyProject(projectKey: string): Promise<JiraValidationResult>;
}

export function validateJiraCapability(adapter: FakeJiraAdapter, projectKey: string): Promise<JiraValidationResult>;

export function getAdapterContent(primaryTracker: string): string;

export interface TrackerEffect {
	order?: number;
	target?: string;
	kind?: string;
	classification: "CREATE" | "UPDATE" | "NO-OP" | "BLOCKING_CONFLICT";
	reason?: string;
	before?: string;
	after?: string;
	diff?: string;
	fingerprint?: string | null;
}

export interface CapabilitiesSnapshot {
	ghCli?: boolean;
	glabCli?: boolean;
}

export function planTrackerEffects(config: any, discovery: any, jiraValidation?: JiraValidationResult | null, capabilities?: CapabilitiesSnapshot): TrackerEffect[];

export interface TrackerReadiness {
	trackerReady: boolean;
	blockers: string[];
}

export function checkTrackerReadiness(config: any, discovery: any, jiraValidation?: JiraValidationResult | null, capabilities?: CapabilitiesSnapshot): TrackerReadiness;
