import type { CanonicalProjectConfig } from "./config.d.mts";
export type JiraVersion = string | number;
export interface TicketFields {
	title?: string;
	description?: string;
	acceptanceCriteria?: string;
	status?: string;
	priority?: string;
	type?: string;
	comments?: Array<{ id: string; text: string; author?: string; createdAt?: string }>;
}

export interface LocalTicket extends TicketFields {
	id: string;
	localMetadata?: Record<string, unknown>;
}

export interface JiraTicket extends TicketFields {
	id: string;
	version: JiraVersion;
}

export interface SyncMapping {
	jiraId: string;
	fieldHashes: Record<string, string>;
	jiraVersion?: JiraVersion;
}

export interface PendingSyncOperation {
	correlationId: string;
	localId: string;
	action: "create" | "update" | "comment" | "status";
	payload: Record<string, unknown>;
	returnedVersion?: JiraVersion;
	returnedId?: string;
}

export interface SyncState {
	repositoryIdentity?: string;
	mappings: Record<string, SyncMapping>;
	pendingOperations: PendingSyncOperation[];
}

export interface EffectiveTrackerOperation {
	action: "create" | "update" | "comment" | "status";
	localId: string;
	payload: Record<string, unknown>;
}

export interface TrackerOperation extends EffectiveTrackerOperation {
	perform?: (
		localStore: Record<string, LocalTicket>,
		operation: EffectiveTrackerOperation,
	) => Record<string, LocalTicket> | Promise<Record<string, LocalTicket>>;
}

export interface ConflictChoice {
	localId: string;
	field: string;
	resolution: "local" | "jira" | "manual";
	manualValue?: unknown;
}

export interface JiraAdapter {
	getTicket(id: string): Promise<JiraTicket | null>;
	findTicketByCorrelation(correlationId: string): Promise<JiraTicket | null>;
	createTicket(fields: TicketFields, correlationId: string): Promise<JiraTicket>;
	updateTicket(id: string, fields: Partial<TicketFields>): Promise<JiraTicket | void>;
	updateStatus(id: string, status: string): Promise<JiraTicket | void>;
	addComment(id: string, text: string): Promise<{ id: string; version: JiraVersion }>;
}

export interface TrackerPersistence {
	persistSyncState(syncState: SyncState): Promise<void>;
	readSyncState(): Promise<SyncState>;
	persistLocalStore(localStore: Record<string, LocalTicket>): Promise<void>;
	readLocalStore(): Promise<Record<string, LocalTicket>>;
}

export interface RunTrackerOperationArgs {
	config: CanonicalProjectConfig;
	localStore: Record<string, LocalTicket>;
	syncState: SyncState;
	operation: TrackerOperation | null;
	jiraAdapter: JiraAdapter;
	persistence: TrackerPersistence;
	conflictChoices?: ConflictChoice[];
}

export interface RunTrackerOperationResult {
	nextLocalStore: Record<string, LocalTicket>;
	nextSyncState: SyncState;
	externalCallLog: Array<{ method: string; args: Record<string, unknown> }>;
	blockers: string[];
	conflicts: Array<{ localId: string; field: string; localValue: unknown; jiraValue: unknown }>;
	readiness: { ready: boolean; reason?: string };
}

export function runTrackerOperation(args: RunTrackerOperationArgs): Promise<RunTrackerOperationResult>;
export function hashField(value: unknown): string;
export const MAPPED_TICKET_FIELDS: readonly (keyof TicketFields)[];
export function sanitizeTicketFields(fields: Record<string, unknown>): Partial<TicketFields>;
export function hashTicketFields(fields: Partial<TicketFields>): Record<string, string>;
