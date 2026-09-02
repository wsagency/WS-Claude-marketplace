import type { CanonicalProjectConfig } from "./config.d.mts";
import type { LocalTicket, SyncState, JiraAdapter } from "./sync.d.mts";

export interface BackfillAudit {
	missing: Array<{ localId: string; jiraId: string }>;
	stale: Array<{ localId: string; jiraId: string }>;
	duplicated: Array<{ localId: string; jiraId: string; otherLocalId: string }>;
	conflicting: Array<{ localId: string; jiraId: string }>;
	valid: Array<{ localId: string; jiraId: string }>;
}

export interface UnmappedTicket {
	localId: string;
	proposedProject: string;
	proposedType: string;
	mappedFields: Record<string, unknown>;
	unsupportedFields: string[];
	sourceLink: string;
	correlationToken: string;
}

export interface BackfillPlan {
	unmapped: UnmappedTicket[];
	project: string;
	defaultType: string;
}

export interface BackfillResult {
	completed: string[];
	pending: string[];
	errors: Array<{ localId: string; error: string }>;
	nextSyncState: SyncState;
}
export interface BackfillJiraAdapter extends JiraAdapter {
	findTicketByCorrelation(correlationId: string): ReturnType<JiraAdapter["getTicket"]>;
}

export interface BackfillPersistence {
	persistSyncState(syncState: SyncState): Promise<void>;
	readSyncState(): Promise<SyncState>;
}

export interface ExecuteBackfillArgs {
	plan: BackfillPlan;
	syncState: SyncState;
	jiraAdapter: BackfillJiraAdapter;
	persistence: BackfillPersistence;
}


export function auditBackfill(localTickets: Record<string, LocalTicket>, syncState: SyncState, jiraAdapter: JiraAdapter): Promise<BackfillAudit>;
export function planBackfill(localTickets: Record<string, LocalTicket>, syncState: SyncState, config: CanonicalProjectConfig): BackfillPlan;
export function executeBackfill(args: ExecuteBackfillArgs): Promise<BackfillResult>;
