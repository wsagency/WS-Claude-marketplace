import type { CanonicalProjectConfig, DerivedSetupReadiness } from "../ws-project-bootstrap/config.d.mts";
import type {
	ReconfigureAdapters as SharedReconfigureAdapters,
	ReconfigureApplyResult,
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

export interface ReconfigureChoices {
	domains: ReconfigureDomainSelection[];
	fields?: string[];
	values?: Record<string, unknown>;
	repositories?: string[];
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

export function plan(config: CanonicalProjectConfig, discovery: DocsDiscovery, choices: ReconfigureChoices): ReconfigurePlan;

export function apply(
	config: CanonicalProjectConfig,
	discovery: DocsDiscovery,
	choices: ReconfigureChoices,
	planHash: string,
	effects: ReconfigureEffect[],
	adapters: ReconfigureAdapters,
	injection?: ReconfigureInjection,
): Promise<ReconfigureResult>;

export function resume(
	config: CanonicalProjectConfig,
	discovery: DocsDiscovery,
	choices: ReconfigureChoices,
	adapters: ReconfigureAdapters,
	injection?: ReconfigureInjection,
): Promise<ReconfigureResult>;

export function acceptPartial(
	config: CanonicalProjectConfig,
	discovery: DocsDiscovery,
	choices: ReconfigureChoices,
	adapters: ReconfigureAdapters,
): Promise<ReconfigureResult>;
