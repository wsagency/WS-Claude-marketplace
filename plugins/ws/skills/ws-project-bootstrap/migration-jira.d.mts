export function parseYamlLike(content: string | undefined): Record<string, any>;

export interface JiraDiscovery {
	hasGlobalConfig: boolean;
	hasProjectConfig: boolean;
	hasDocsConfig: boolean;
	globalValues: Record<string, any>;
	projectValues: Record<string, any>;
	docsValues: Record<string, any>;
	unrecognized: any[];
}

export function discoverJiraState(snapshots: Record<string, string>): JiraDiscovery;

export interface MigrationPlan {
	patch: Record<string, any>;
	conflicts: Array<{ field: string, values: any[] }>;
	suggestions: Array<{ field: string, value: any, source: string }>;
	effects: any[];
	blockers: string[];
}

export function planJiraMigration(discovery: JiraDiscovery, currentCanonical: Record<string, any> | null, resolutions: Record<string, any>): MigrationPlan;

export interface CleanupEligibility {
	eligible: boolean;
	blockers: string[];
}

export function checkJiraCleanupEligibility(plan: MigrationPlan, canonicalValidation: { isValid: boolean }, adaptersReady: { isJiraReady: boolean }): CleanupEligibility;
