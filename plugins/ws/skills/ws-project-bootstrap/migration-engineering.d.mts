export interface EngineeringDiscovery {
	hasEngineeringState: boolean;
	trackerContent: string | null;
	domainContent: string | null;
	triageContent: string | null;
	agentsMd: string | null;
	claudeMd: string | null;
	derived: {
		tracker?: string;
		sync?: string;
		pull_requests?: string;
		triageLabels?: Record<string, string>;
		domainLayout?: string;
	};
}

export function discoverEngineeringState(snapshots: Record<string, string>): EngineeringDiscovery;

export interface MigrationPlan {
	patch: Record<string, any>;
	conflicts: Array<{ field: string, values: any[] }>;
	suggestions: Array<{ field: string, value: any, source: string }>;
	effects: any[];
	blockers: string[];
}

export function planEngineeringMigration(discovery: EngineeringDiscovery, currentCanonical: Record<string, any> | null, resolutions: Record<string, any>): MigrationPlan;

export interface CleanupEligibility {
	eligible: boolean;
	blockers: string[];
}

export function checkEngineeringCleanupEligibility(plan: MigrationPlan, canonicalValidation: { isValid: boolean }, adaptersReady: { isEngineeringReady: boolean }): CleanupEligibility;
