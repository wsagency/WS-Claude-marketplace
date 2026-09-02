import type { CanonicalProjectConfig } from "../ws-project-bootstrap/config.d.mts";
import type { ReconfigureRepositoryTarget } from "../ws-project-bootstrap/reconfigure.d.mts";
import type { ProjectShape, EffectClassification, SnapshotEntry, SetupOperation } from "../ws-project-bootstrap/transaction.d.mts";

export interface DocsDiscovery {
	root: string;
	projectShape: ProjectShape;
	policy: Pick<CanonicalProjectConfig, "docs" | "changelog">;
	entries: Record<string, SnapshotEntry>;
	repositories?: ReconfigureRepositoryTarget[];
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

export const DOCUMENTATION_CONTEXT_FRAGMENTS: Readonly<DocsContextFragments>;

export interface DocsPlan {
	hash: string;
	scope: { root: string; projectShape: ProjectShape };
	effects: DocsEffect[];
	contextFragments: DocsContextFragments;
	configFragment: Pick<CanonicalProjectConfig, "docs" | "changelog">;
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

export function discoverDocumentation(root: string, projectShape: ProjectShape, policy?: Partial<Pick<CanonicalProjectConfig, "docs" | "changelog">>): Promise<DocsDiscovery>;
export function planDocumentation(discovery: DocsDiscovery): DocsPlan;
export function applyDocumentation(root: string, plan: DocsPlan, authorization: string, failureInjection?: string): Promise<SetupOperation[]>;
