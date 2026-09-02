import type { CanonicalProjectConfig } from "./config.d.mts";

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
}

export interface SyncMapping {
	jiraId: string;
	fieldHashes: Record<string, string>;
}

export interface PendingSyncOperation {
	correlationId: string;
	localId: string;
	action: "create" | "update" | "comment" | "status";
	payload: Record<string, unknown>;
}

export interface SyncState {
	mappings: Record<string, SyncMapping>;
	pendingOperations: PendingSyncOperation[];
}

export interface TrackerOperation {
	action: "create" | "update" | "comment" | "status";
	localId: string;
	payload: Record<string, unknown>;
}

export interface ConflictChoice {
	localId: string;
	field: string;
	resolution: "local" | "jira" | "manual";
	manualValue?: unknown;
}

export interface JiraAdapter {
	getTicket(id: string): Promise<JiraTicket | null>;
	createTicket(fields: TicketFields, correlationId?: string): Promise<JiraTicket>;
	updateTicket(id: string, fields: Partial<TicketFields>): Promise<void>;
	addComment(id: string, text: string): Promise<{ id: string }>;
}

export interface RunTrackerOperationArgs {
	config: CanonicalProjectConfig;
	localStore: Record<string, LocalTicket>;
	syncState: SyncState;
	operation: TrackerOperation | null;
	jiraAdapter: JiraAdapter;
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
export function hashTicketFields(fields: Partial<TicketFields>): Record<string, string>;
export class FakeJiraAdapterTemplate implements JiraAdapter {
	constructor(initialData?: Record<string, JiraTicket>);
	getTicket(id: string): Promise<JiraTicket | null>;
	createTicket(fields: TicketFields, correlationId?: string): Promise<JiraTicket>;
	updateTicket(id: string, fields: Partial<TicketFields>): Promise<void>;
	addComment(id: string, text: string): Promise<{ id: string }>;
	simulateOutage(active: boolean): void;
	getCallLog(): Array<{ method: string; args: Record<string, unknown> }>;
}
