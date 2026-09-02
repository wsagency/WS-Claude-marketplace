export interface TrackerConfig {
	primaryTracker: string;
	jiraBinding: boolean;
}

export interface TicketFields {
	title: string;
	description: string;
	acceptanceCriteria?: string;
	status: string;
	priority?: string;
	type?: string;
}

export interface LocalTicket extends TicketFields {
	id: string;
	comments: Array<{ id: string; text: string; author?: string; createdAt?: string }>;
	localMetadata: Record<string, any>;
}

export interface JiraTicket extends TicketFields {
	id: string; // e.g. PROJ-123
	comments: Array<{ id: string; text: string; author?: string; createdAt?: string }>;
}

export interface SyncState {
	mappings: Record<string, {
		jiraId: string;
		fieldHashes: Record<string, string>;
	}>;
	pendingOperations: Array<{
		correlationId: string;
		localId: string;
		action: "create" | "update" | "comment" | "status";
		payload: any;
	}>;
}

export interface TrackerOperation {
	action: "create" | "update" | "comment" | "status";
	localId: string;
	payload: any;
}

export interface ConflictChoice {
	localId: string;
	field: string;
	resolution: "local" | "jira" | "manual";
	manualValue?: any;
}

export interface JiraAdapter {
	getTicket(id: string): Promise<JiraTicket | null>;
	createTicket(fields: TicketFields, correlationId?: string): Promise<JiraTicket>;
	updateTicket(id: string, fields: Partial<TicketFields>): Promise<void>;
	addComment(id: string, text: string): Promise<{ id: string }>;
}

export interface RunTrackerOperationArgs {
	config: TrackerConfig;
	localStore: Record<string, LocalTicket>;
	syncState: SyncState;
	operation: TrackerOperation | null;
	jiraAdapter: JiraAdapter;
	conflictChoices?: ConflictChoice[];
}

export interface RunTrackerOperationResult {
	nextLocalStore: Record<string, LocalTicket>;
	nextSyncState: SyncState;
	externalCallLog: Array<{ method: string; args: any }>;
	blockers: string[];
	conflicts: Array<{ localId: string; field: string; localValue: any; jiraValue: any }>;
	readiness: { ready: boolean; reason?: string };
}

export function runTrackerOperation(args: RunTrackerOperationArgs): Promise<RunTrackerOperationResult>;
export function hashField(value: any): string;
export class FakeJiraAdapterTemplate implements JiraAdapter {
	constructor(initialData?: Record<string, JiraTicket>);
	getTicket(id: string): Promise<JiraTicket | null>;
	createTicket(fields: TicketFields, correlationId?: string): Promise<JiraTicket>;
	updateTicket(id: string, fields: Partial<TicketFields>): Promise<void>;
	addComment(id: string, text: string): Promise<{ id: string }>;
	simulateOutage(active: boolean): void;
	getCallLog(): Array<{ method: string; args: any }>;
}
