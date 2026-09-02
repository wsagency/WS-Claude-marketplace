import type { ProjectShape, EffectClassification, SnapshotEntry, SetupOperation } from "../ws-project-bootstrap/transaction.d.mts";

export interface DocsDiscovery {
	root: string;
	projectShape: ProjectShape;
	entries: Record<string, SnapshotEntry>;
}

export interface DocsEffect {
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
export interface DocsContextFragments {
	agents: string;
	claude: string;
}

export interface DocsPlan {
	hash: string;
	scope: { root: string; projectShape: ProjectShape };
	effects: DocsEffect[];
	contextFragments: DocsContextFragments;
}

export interface DocsTransactionRequest {
	root: string;
	discovery: DocsDiscovery;
	authorization?: string;
	failureInjection?: string;
}

export interface DocsTransactionResult {
	discovery: DocsDiscovery;
	plan?: DocsPlan;
	operations: SetupOperation[];
	report: string;
}

export function discoverDocumentation(root: string, projectShape: ProjectShape): Promise<DocsDiscovery>;
export function planDocumentation(discovery: DocsDiscovery): DocsPlan;
export function applyDocumentation(root: string, plan: DocsPlan, failureInjection?: string): Promise<SetupOperation[]>;
