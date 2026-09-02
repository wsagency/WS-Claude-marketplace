import type { CanonicalProjectConfig, DerivedSetupReadiness } from "../ws-project-bootstrap/config.d.mts";
import type {
	ReconfigureAdapters as SharedReconfigureAdapters,
	ReconfigureApplyResult,
	ReconfigureConfig,
	ReconfigureEffect,
	ReconfigureInjection,
	ReconfigurePlanResult,
	ReconfigureDomainSelection,
} from "../ws-project-bootstrap/reconfigure.d.mts";
import type { DocsDiscovery } from "./transaction.d.mts";

export interface ManagedReferenceTransition {
	target: string;
	before?: string;
	after: string;
	fingerprint?: unknown;
}

export interface DocsPathTransition {
	source: string;
	destination: string;
	intent: "copy" | "move";
	managedReferences?: ManagedReferenceTransition[];
	verificationSteps?: string[];
}

export interface ReconfigureDocsDiscovery extends DocsDiscovery {
	repositoryDiscoveries?: Record<string, DocsDiscovery>;
}

export interface ReconfigureChoices {
	domains: ReconfigureDomainSelection[];
	fields?: string[];
	values?: Record<string, unknown>;
	repositories?: string[];
	repositoryChoices?: Record<string, Partial<Omit<ReconfigureChoices, "repositories" | "repositoryChoices" | "byRepository">>>;
	byRepository?: Record<string, Partial<Omit<ReconfigureChoices, "repositories" | "repositoryChoices" | "byRepository">>>;
	enableDocs?: boolean;
	disableDocs?: boolean;
	cancelDependent?: boolean;
	pathTransitions?: DocsPathTransition[];
}

export interface DocsContentManifest {
	source: string;
	destination: string;
	intent: "copy" | "move";
	collision: { kind: unknown; fingerprint: unknown } | null;
	managedReferences: string[];
	verificationSteps: string[];
	field: string | null;
}

export interface ReconfigurePlan extends ReconfigurePlanResult {
	contentManifest: DocsContentManifest[];
}

export type ReconfigureReadiness = DerivedSetupReadiness;
export type ReconfigureResult = ReconfigureApplyResult;
export type ReconfigureAdapters = SharedReconfigureAdapters;

export function plan(config: ReconfigureConfig, discovery: ReconfigureDocsDiscovery, choices: ReconfigureChoices): ReconfigurePlan;

export function apply(
	config: ReconfigureConfig,
	discovery: ReconfigureDocsDiscovery,
	choices: ReconfigureChoices,
	planHash: string,
	effects: ReconfigureEffect[],
	adapters: ReconfigureAdapters,
	injection?: ReconfigureInjection,
): Promise<ReconfigureResult>;

export function resume(
	config: ReconfigureConfig,
	discovery: ReconfigureDocsDiscovery,
	choices: ReconfigureChoices,
	adapters: ReconfigureAdapters,
	injection?: ReconfigureInjection,
): Promise<ReconfigureResult>;

export function acceptPartial(
	config: ReconfigureConfig,
	discovery: ReconfigureDocsDiscovery,
	choices: ReconfigureChoices,
	adapters: ReconfigureAdapters,
): Promise<ReconfigureResult>;
