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
