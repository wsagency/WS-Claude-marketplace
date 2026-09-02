import type { SetupEffect } from "./transaction.d.mts";
import type { 
    ReconfigureConfig, 
    ReconfigureTargetSnapshot, 
    ReconfigureMachineCapabilities,
    ReconfigureChoices 
} from "./reconfigure.d.mts";

export interface RoutingPlanResult {
    effects: SetupEffect[];
    requiresConfirmation: boolean;
    dependencyClosure: string[];
    blocking: boolean;
}

export function planTriage(
    config: ReconfigureConfig,
    snapshot: ReconfigureTargetSnapshot,
    machine: ReconfigureMachineCapabilities,
    choices: ReconfigureChoices
): RoutingPlanResult;

export function planDomain(
    config: ReconfigureConfig,
    snapshot: ReconfigureTargetSnapshot,
    machine: ReconfigureMachineCapabilities,
    choices: ReconfigureChoices
): RoutingPlanResult;
