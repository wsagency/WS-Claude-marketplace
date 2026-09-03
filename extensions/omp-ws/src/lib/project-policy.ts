import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
	validateCanonicalConfig,
	type CanonicalProjectConfig,
	type ConfigValidationIssue,
} from "../../../../plugins/ws/skills/ws-project-bootstrap/config.mjs";
import {
	detectRepositoryLegacyPolicy,
	parseReconfiguringDomains,
} from "../../../../plugins/ws/skills/ws-project-bootstrap/consumer.mjs";
import { run } from "./exec";

export const CANONICAL_POLICY_PATH = ".wsagency/config.yaml";

export type RepositoryPolicyStatus = "valid" | "missing" | "invalid" | "older" | "future";

export interface RepositoryPolicyState {
	status: RepositoryPolicyStatus;
	root: string;
	config: CanonicalProjectConfig | null;
	errors: ConfigValidationIssue[];
	legacySources: string[];
	reconfiguringDomains: string[];
}

export interface NativeRuntimeCapabilities {
	sessionDiscipline: boolean;
	dangerousGitGuard: boolean;
	jira: boolean;
}

export const NATIVE_RUNTIME_CAPABILITIES: Readonly<NativeRuntimeCapabilities> = Object.freeze({
	sessionDiscipline: true,
	dangerousGitGuard: true,
	jira: false,
});

export interface ChangelogPolicy {
	updateMode: "pull_request" | "commit" | "disabled";
	path: string;
	skipTypes: string[];
}

export interface NativeRuntimeBehavior {
	runtimeReady: boolean;
	sessionDiscipline: boolean;
	dangerousGitGuard: boolean;
	dashboard: boolean;
	localTicketCompaction: boolean;
	changelog: ChangelogPolicy | null;
}

async function readIfExists(filePath: string): Promise<string | undefined> {
	try {
		return await fs.readFile(filePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}


export async function resolveRepositoryRoot(cwd: string): Promise<string> {
	const result = await run("git", ["rev-parse", "--show-toplevel"], { cwd });
	const root = result.code === 0 ? result.stdout.trim() : "";
	return root || cwd;
}

export async function loadRepositoryPolicyFromRoot(root: string): Promise<RepositoryPolicyState> {
	let reconfiguringDomains: string[] = [];
	const journalSource = await readIfExists(path.join(root, ".wsagency/reconfigure-state.yaml"));
	if (journalSource !== undefined) {
		try {
			reconfiguringDomains = parseReconfiguringDomains(journalSource);
		} catch {
			reconfiguringDomains = ["all"];
		}
	}

	const source = await readIfExists(path.join(root, CANONICAL_POLICY_PATH));
	if (source === undefined) {
		return {
			status: "missing",
			root,
			config: null,
			errors: [],
			legacySources: detectRepositoryLegacyPolicy(root),
			reconfiguringDomains,
		};
	}

	const validation = validateCanonicalConfig(source);
	return {
		status: validation.status,
		root,
		config: validation.status === "valid" ? validation.config : null,
		errors: validation.errors,
		legacySources: [],
		reconfiguringDomains,
	};
}

export async function loadRepositoryPolicy(cwd: string): Promise<RepositoryPolicyState> {
	return loadRepositoryPolicyFromRoot(await resolveRepositoryRoot(cwd));
}

export function repositoryPolicyProblem(state: RepositoryPolicyState, helper: string, requiredDomains?: string[]): string | undefined {
	if (state.reconfiguringDomains.length > 0) {
		const affected = state.reconfiguringDomains.includes("all") || !requiredDomains || requiredDomains.some(d => state.reconfiguringDomains.includes(d));
		if (affected) return `${helper}: Active reconfiguration in progress; run /ws-setup reconfigure.`;
	}
	if (state.status === "valid") return undefined;
	if (state.status === "missing") {
		if (state.legacySources.length === 0) return undefined;
		return `${helper}: legacy repository policy detected in ${state.legacySources.join(", ")}; run /ws-setup to migrate to ${CANONICAL_POLICY_PATH}.`;
	}
	if (state.status === "future") {
		return `${helper}: ${CANONICAL_POLICY_PATH} uses a newer schema; update @wsagency/omp-ws before continuing.`;
	}
	if (state.status === "older") {
		return `${helper}: ${CANONICAL_POLICY_PATH} uses an older schema; run /ws-setup to migrate it.`;
	}
	const detail = state.errors[0]?.message;
	return `${helper}: ${CANONICAL_POLICY_PATH} is invalid${detail ? ` (${detail})` : ""}; run /ws-setup to repair it.`;
}
export function repositoryWritePolicyProblem(state: RepositoryPolicyState, helper: string, requiredDomains?: string[]): string | undefined {
	if (state.reconfiguringDomains.length > 0) {
		const affected = state.reconfiguringDomains.includes("all") || !requiredDomains || requiredDomains.some(d => state.reconfiguringDomains.includes(d));
		if (affected) return `${helper}: Active reconfiguration in progress; run /ws-setup reconfigure.`;
	}
	if (state.status === "missing" && state.legacySources.length === 0) {
		return `${helper}: ${CANONICAL_POLICY_PATH} is missing; run /ws-setup before continuing.`;
	}
	return repositoryPolicyProblem(state, helper, requiredDomains);
}


export function missingPolicyCapability(helper: string, capability: string): string {
	return `${helper}: ${CANONICAL_POLICY_PATH} does not configure ${capability}; run /ws-setup before continuing.`;
}

export function deriveNativeRuntimeBehavior(
	state: RepositoryPolicyState,
	capabilities: NativeRuntimeCapabilities,
	sharedDangerousGitProtection = false,
): NativeRuntimeBehavior {
	const config = state.status === "valid" ? state.config : null;
	const runtime = config?.runtime;
	const sessionDiscipline = runtime?.session_discipline === "required" && capabilities.sessionDiscipline;
	const repositoryGuard = runtime?.dangerous_git_guard === "enabled" && capabilities.dangerousGitGuard;
	const dangerousGitGuard = sharedDangerousGitProtection || repositoryGuard;
	const runtimeReady = Boolean(
		runtime &&
			sessionDiscipline &&
			(runtime.dangerous_git_guard === "disabled" || capabilities.dangerousGitGuard),
	);
	const changelog = config?.changelog
		? {
				updateMode: config.changelog.update_mode,
				path: config.changelog.path,
				skipTypes: [...config.changelog.skip_types],
			}
		: null;

	return {
		runtimeReady,
		sessionDiscipline,
		dangerousGitGuard,
		dashboard: Boolean(
			config?.ui?.session_start_dashboard === "jira_assignments" &&
				config.jira &&
				capabilities.jira,
		),
		localTicketCompaction: config?.tracker?.primary === "local",
		changelog,
	};
}
