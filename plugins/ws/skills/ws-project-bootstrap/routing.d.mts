import type {
	ReconfigureBlocker,
	ReconfigureChoices,
	ReconfigureConfig,
	ReconfigureDependency,
	ReconfigureEffect,
	ReconfigureMachineCapabilities,
	ReconfigureTargetSnapshot,
	TriageRole,
} from "./reconfigure.d.mts";

export interface AffectedTriageItem {
	target: string;
	role: TriageRole;
	oldLabel: string;
	newLabel: string;
}

export interface DomainCollision {
	source: string;
	destination: string;
	kind: "context" | "decision" | "map";
	resolution: "keep-destination" | "unresolved";
}

export interface RoutingPlanResult {
	effects: ReconfigureEffect[];
	blockers: ReconfigureBlocker[];
	dependencyClosure: ReconfigureDependency[];
	fieldDependencies: Record<string, string[]>;
	blocking: boolean;
	affectedItems?: AffectedTriageItem[];
	collisions?: DomainCollision[];
}

export function planTriage(
	config: ReconfigureConfig,
	snapshot: ReconfigureTargetSnapshot,
	machine: ReconfigureMachineCapabilities,
	choices: ReconfigureChoices,
): RoutingPlanResult;

export function planDomain(
	config: ReconfigureConfig,
	snapshot: ReconfigureTargetSnapshot,
	machine: ReconfigureMachineCapabilities,
	choices: ReconfigureChoices,
): RoutingPlanResult;

export type ConsumerCapability =
    | "config"
    | "engineering"
    | "tracker"
    | "triage"
    | "domain"
    | "commit"
    | "jira_commit"
    | "changelog"
    | "dashboard"
    | "pull_requests";

export interface CapabilityPolicySelection {
    capability: ConsumerCapability;
    sections: string[];
    missingSections: string[];
    policy: Record<string, unknown>;
}

export function selectCapabilityPolicy(
    config: Record<string, unknown>,
    capability: ConsumerCapability
): CapabilityPolicySelection;
