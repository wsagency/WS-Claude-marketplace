import type { SetupDiscovery, SetupChoices, SetupTransactionResult, SetupPlan, SetupOperation, RuntimeSnapshot, SetupTransactionRequest } from "./transaction.mjs";

export interface HubDiscovery {
	root: string;
	machine: RuntimeSnapshot;
	hub: SetupDiscovery;
	working: SetupDiscovery[];
	excluded: Array<{ name: string; type: string; reason: string }>;
	registryError: string | null;
}

export interface HubTransactionRequest {
	root: string;
	discovery: HubDiscovery;
	choices?: {
		hub?: SetupChoices;
		working?: Record<string, SetupChoices>;
		removedRepositories?: string[];
	};
	authorization?: string;
	injectedOriginValidation?: { origin: string; isValid: boolean; reason?: string };
	injectedFailure?: { targetRoot: string; phase: "write" | "verify"; target: string };
}

export interface HubPlan {
	hash: string;
	scope: { root: string; projectShape: "hub_root" };
	hub: SetupPlan;
	working: Array<{ name: string; plan: SetupPlan }>;
}

export interface HubTransactionResult {
	discovery: HubDiscovery;
	questions: any[];
	plan?: HubPlan;
	requiresConfirmation: boolean;
	operations: SetupOperation[];
	readiness?: {
		hub: any;
		working: Record<string, any>;
	};
	report: string;
}

export function parseProjectYaml(content: string): any[];
export function mergeConfig(hubConfigStr: string, explicitConfigStr: string): string;
export function discoverHubTransaction(root: string, machine: RuntimeSnapshot): Promise<HubDiscovery>;
export function runHubTransaction(request: HubTransactionRequest): Promise<HubTransactionResult>;
