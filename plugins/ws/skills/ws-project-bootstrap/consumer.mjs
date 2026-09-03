import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { deriveSetupReadiness, validateCanonicalConfig } from "./config.mjs";
import { checkTrackerReadiness, parseOriginIdentity } from "./trackers.mjs";
import { selectCapabilityPolicy } from "./routing.mjs";
import { runTrackerOperation } from "./sync.mjs";

export const CANONICAL_POLICY_PATH = ".wsagency/config.yaml";
export const REPOSITORY_LEGACY_POLICY_SOURCES = Object.freeze([
	".claude/ws-project.yaml",
	".claude/docs-config.yaml",
	"dev-docs/agents/issue-tracker.md",
	"dev-docs/agents/triage-labels.md",
	"dev-docs/agents/domain.md",
	".scratch",
]);

const LEGACY_MACHINE_POLICY_SOURCES = REPOSITORY_LEGACY_POLICY_SOURCES.filter(
	target => !target.startsWith("dev-docs/agents/"),
);
const OPERATIONAL_ADAPTER_SOURCES = REPOSITORY_LEGACY_POLICY_SOURCES.filter(
	target => target.startsWith("dev-docs/agents/"),
);

const TRACKER_ADAPTER_PATH = "dev-docs/agents/issue-tracker.md";
const TRIAGE_ADAPTER_PATH = "dev-docs/agents/triage-labels.md";
const DOMAIN_ADAPTER_PATH = "dev-docs/agents/domain.md";
const OPERATIONAL_ADAPTER_MARKERS = Object.freeze({
	[TRACKER_ADAPTER_PATH]: "issue-tracker",
	[TRIAGE_ADAPTER_PATH]: "triage-labels",
	[DOMAIN_ADAPTER_PATH]: "domain",
});


function exists(root, target) {
	return existsSync(path.join(root, target));
}

function isFile(root, target) {
	try {
		return statSync(path.join(root, target)).isFile();
	} catch {
		return false;
	}
}

function isDirectory(root, target) {
	try {
		return statSync(path.join(root, target)).isDirectory();
	} catch {
		return false;
	}
}
function isManagedOperationalAdapter(root, target) {
	if (!isFile(root, target)) return false;
	const marker = OPERATIONAL_ADAPTER_MARKERS[target];
	if (!marker) return false;
	try {
		const source = readFileSync(path.join(root, target), "utf8");
		return source.includes(`<!-- WS-MANAGED:${marker}:START -->`)
			&& source.includes(`<!-- WS-MANAGED:${marker}:END -->`);
	} catch {
		return false;
	}
}

function isLegacyOperationalAdapter(root, target) {
	return exists(root, target) && !isManagedOperationalAdapter(root, target);
}


export function detectRepositoryLegacyPolicy(root) {
	if (!isFile(root, CANONICAL_POLICY_PATH)) {
		return REPOSITORY_LEGACY_POLICY_SOURCES.filter(target => exists(root, target));
	}
	return [
		...LEGACY_MACHINE_POLICY_SOURCES.filter(target => exists(root, target)),
		...OPERATIONAL_ADAPTER_SOURCES.filter(target => isLegacyOperationalAdapter(root, target)),
	];
}

function includeUnownedAdapters(root, result, missingSections) {
	const bySection = {
		tracker: [TRACKER_ADAPTER_PATH],
		triage: [TRIAGE_ADAPTER_PATH],
		domain: [DOMAIN_ADAPTER_PATH],
	};
	const candidates = missingSections.flatMap(section => bySection[section] ?? []);
	const sources = candidates.filter(target => isLegacyOperationalAdapter(root, target));
	result.detectedLegacySources = [...new Set([...result.detectedLegacySources, ...sources])];
}

function legacyDirective(sources) {
	if (sources.length === 0) return "Run /ws-setup.";
	const noun = sources.length === 1 ? "source" : "sources";
	return `Detected repository-local legacy ${noun}: ${sources.join(", ")}. Run /ws-setup.`;
}

function artifactSnapshot(root, config, supplied = {}) {
	const contextTarget = config?.domain?.layout === "multi_context" ? "CONTEXT-MAP.md" : "CONTEXT.md";
	return {
		...supplied,
		issueTracker: isManagedOperationalAdapter(root, TRACKER_ADAPTER_PATH),
		triageLabels: isManagedOperationalAdapter(root, TRIAGE_ADAPTER_PATH),
		domain: isManagedOperationalAdapter(root, DOMAIN_ADAPTER_PATH),
		context: isFile(root, contextTarget),
		agents: isFile(root, "AGENTS.md"),
		claude: isFile(root, "CLAUDE.md"),
		localTracker: isDirectory(root, "dev-docs/tickets/open") && isDirectory(root, "dev-docs/tickets/done"),
	};
}

function addArtifactBlocker(result, artifacts, key, target) {
	if (!artifacts[key]) result.blockers.push(`Required operational adapter or store is missing: ${target}. Run /ws-setup.`);
}

function inspectTracker(result, config, snapshot, artifacts) {
	const primary = config.tracker.primary;
	const integrations = snapshot.integrations ?? {};
	const integrationReasons = snapshot.integrationReasons ?? {};
	const jiraValidation = {
		ready: integrations.jira === true,
		reason: integrationReasons.jira ?? "jira-cli capability is unavailable",
	};
	const tracker = checkTrackerReadiness(
		config,
		{ git: { origin: snapshot.origin } },
		jiraValidation,
		{ ghCli: integrations.github === true, glabCli: integrations.gitlab === true },
	);

	addArtifactBlocker(result, artifacts, "issueTracker", TRACKER_ADAPTER_PATH);
	if (primary === "local") {
		addArtifactBlocker(result, artifacts, "localTracker", "dev-docs/tickets/open and dev-docs/tickets/done");
	} else if ((primary === "github" || primary === "gitlab") && integrations[primary] !== true && integrationReasons[primary]) {
		result.blockers.push(integrationReasons[primary]);
	} else {
		result.blockers.push(...tracker.blockers);
	}

	const syncEnabled = primary === "local" && config.jira?.sync === "all_local_tickets";
	const pending = Number(snapshot.sync?.pending ?? 0);
	const conflicts = Number(snapshot.sync?.conflicts ?? 0);
	if (syncEnabled) {
		if (conflicts > 0) {
			result.blockers.push(`${conflicts} unresolved Local/Jira same-field conflict${conflicts === 1 ? "" : "s"}; resolve Local, Jira, or manual merge before the tracker operation.`);
		}
		if (integrations.jira !== true) {
			result.warnings.push(`${jiraValidation.reason}; Local Markdown remains available and the operation must persist pending synchronization.`);
		} else if (pending > 0) {
			result.warnings.push(`${pending} pending Local/Jira synchronization operation${pending === 1 ? "" : "s"} must be retried before the requested tracker operation.`);
		}
	}

	result.operation = {
		primary,
		adapterPath: TRACKER_ADAPTER_PATH,
		adapterTemplate: primary,
		pullRequests: config.tracker.pull_requests,
		jiraProject: config.jira?.project ?? null,
		synchronizeWithJira: syncEnabled,
		pendingSynchronization: pending,
	};
}

function inspectPullRequests(result, config, snapshot) {
	if (config.tracker.pull_requests === "ignore") {
		result.operation = { enabled: false, provider: null };
		return;
	}
	const identity = parseOriginIdentity(snapshot.origin);
	if (!identity) {
		result.blockers.push("Pull-request triage requires a validated GitHub or GitLab repository origin.");
		return;
	}
	if (snapshot.integrations?.[identity.provider] !== true) {
		const reason = snapshot.integrationReasons?.[identity.provider] ?? `${identity.provider} CLI capability is unavailable`;
		result.blockers.push(reason);
	}
	result.operation = { enabled: true, provider: identity.provider, identity };
}

function inspectJiraCommit(result, config, snapshot) {
	if (config.commit.jira.actions === "disabled") {
		result.blockers.push("Canonical Jira commit actions are disabled for this repository.");
		return;
	}
	if (!config.jira) {
		result.blockers.push("Canonical Jira commit actions require an explicit jira binding. Run /ws-setup.");
		return;
	}
	if (snapshot.integrations?.jira !== true) {
		result.blockers.push(snapshot.integrationReasons?.jira ?? "jira-cli capability is unavailable");
	}
}

function inspectDashboard(result, config, snapshot) {
	const mode = config.ui.session_start_dashboard;
	result.operation = { enabled: mode === "jira_assignments", mode };
	if (mode === "disabled") return;
	if (!config.jira) {
		result.blockers.push("The Jira assignments dashboard requires an explicit jira binding. Run /ws-setup.");
	} else if (snapshot.integrations?.jira !== true) {
		result.blockers.push(snapshot.integrationReasons?.jira ?? "jira-cli capability is unavailable");
	}
}

export function parseReconfiguringDomains(source) {
	try {
		const parsed = JSON.parse(source);
		if (!parsed || typeof parsed !== "object" || !parsed.hash || !parsed.state) return ["all"];
		const state = parsed.state;
		if (
			state.schemaVersion !== 3 ||
			typeof state.planHash !== "string" || state.planHash === "" ||
			typeof state.choicesHash !== "string" || state.choicesHash === "" ||
			!Array.isArray(state.scope) || state.scope.length === 0 || !state.scope.every(s => typeof s === "string" && s !== "") ||
			!Array.isArray(state.domains) || state.domains.length === 0 || !state.domains.every(d => typeof d === "string") ||
			!["prepare", "cutover", "cleanup", "done"].includes(state.phase) ||
			!["in_progress", "failed", "completed"].includes(state.status)
		) {
			return ["all"];
		}
		
		const validDomains = new Set(["tracker", "documentation", "runtime"]);
		if (state.domains.some(d => !validDomains.has(d))) return ["all"];
		if (state.planHash !== parsed.hash) return ["all"];
		
		return state.domains;
	} catch {
		return ["all"];
	}
}

function capabilityToReconfigureDomain(capability) {
	if (["tracker", "triage", "jira_commit", "dashboard", "pull_requests", "domain", "commit"].includes(capability)) return ["tracker"];
	if (capability === "changelog") return ["documentation"];
	if (capability === "engineering") return ["tracker", "documentation", "runtime"];
	if (capability === "config") return [];
	return ["runtime"];
}

/**
 * Read one named runtime capability from the sole canonical project policy.
 * The optional snapshot contains only capability facts already observed by the
 * caller; this function never reads user-global configuration or invents defaults.
 */
export function inspectCanonicalCapability({ root = process.cwd(), capability, snapshot = {} }) {
	const resolvedRoot = path.resolve(root);
	const detectedLegacySources = detectRepositoryLegacyPolicy(resolvedRoot);
	const result = {
		ready: false,
		degraded: false,
		capability,
		configPath: CANONICAL_POLICY_PATH,
		ownership: `Canonical policy: ${CANONICAL_POLICY_PATH}. Operational adapters derive from it and never override it.`,
		detectedLegacySources,
		config: null,
		policy: null,
		operation: null,
		setupReadiness: null,

		blockers: [],
		warnings: [],
	};

	const journalPath = path.join(resolvedRoot, ".wsagency/reconfigure-state.yaml");
	if (exists(resolvedRoot, ".wsagency/reconfigure-state.yaml")) {
		let reconfiguringDomains = ["all"];
		try {
			const source = readFileSync(journalPath, "utf8");
			reconfiguringDomains = parseReconfiguringDomains(source);
		} catch {
			reconfiguringDomains = ["all"];
		}
		const requiredDomains = capabilityToReconfigureDomain(capability);
		const affected = requiredDomains.length > 0
			&& (reconfiguringDomains.includes("all") || requiredDomains.some(domain => reconfiguringDomains.includes(domain)));
		if (affected) {
			result.blockers.push(`Active reconfiguration in progress for this domain. Run /ws-setup reconfigure.`);
			return result;
		}
	}

	const absoluteConfigPath = path.join(resolvedRoot, CANONICAL_POLICY_PATH);
	if (!isFile(resolvedRoot, CANONICAL_POLICY_PATH)) {
		result.blockers.push(`Canonical project policy is missing: ${CANONICAL_POLICY_PATH}. ${legacyDirective(detectedLegacySources)}`);
		return result;
	}

	let source;
	try {
		source = readFileSync(absoluteConfigPath, "utf8");
	} catch (error) {
		result.blockers.push(`Cannot read canonical project policy ${CANONICAL_POLICY_PATH}: ${error.message}. Run /ws-setup.`);
		return result;
	}
	const validation = validateCanonicalConfig(source);
	if (validation.status !== "valid") {
		const detail = validation.errors.map(error => error.message).join(" ");
		const state = validation.status === "older" ? "uses an older schema" : validation.status === "future" ? "uses a future schema" : "is invalid";
		result.blockers.push(`Canonical project policy ${CANONICAL_POLICY_PATH} ${state}.${detail ? ` ${detail}` : ""} ${legacyDirective(detectedLegacySources)}`);
		return result;
	}

	result.config = validation.config;
	const artifacts = artifactSnapshot(resolvedRoot, validation.config, snapshot.artifacts);
	result.setupReadiness = deriveSetupReadiness(validation, {
		artifacts,
		integrations: snapshot.integrations,
		runtime: snapshot.runtime,
	});
	const selection = selectCapabilityPolicy(validation.config, capability);
	result.policy = selection.policy;
	if (selection.missingSections.length > 0) {
		includeUnownedAdapters(resolvedRoot, result, selection.missingSections);
		result.blockers.push(`Canonical capability ${capability} is incomplete; missing section${selection.missingSections.length === 1 ? "" : "s"}: ${selection.missingSections.join(", ")}. ${legacyDirective(result.detectedLegacySources)}`);
		return result;
	}


	if (["tracker", "triage"].includes(capability)) inspectTracker(result, validation.config, snapshot, artifacts);
	if (capability === "triage") addArtifactBlocker(result, artifacts, "triageLabels", TRIAGE_ADAPTER_PATH);
	if (capability === "domain") addArtifactBlocker(result, artifacts, "domain", DOMAIN_ADAPTER_PATH);
	if (capability === "jira_commit") inspectJiraCommit(result, validation.config, snapshot);
	if (capability === "dashboard") inspectDashboard(result, validation.config, snapshot);
	if (capability === "pull_requests") inspectPullRequests(result, validation.config, snapshot);
	if (capability === "engineering") {
		if (!result.setupReadiness.engineeringReady) {
			result.blockers.push("Canonical engineering artifacts are incomplete. Run /ws-setup.");
		}
		result.operation = { readiness: result.setupReadiness };
	}

	result.ready = result.blockers.length === 0;
	result.degraded = result.ready && result.warnings.length > 0;
	return result;
}

export function requireCanonicalCapability(options) {
	const result = inspectCanonicalCapability(options);
	if (!result.ready) throw new CanonicalCapabilityError(result);
	return result;
}

export class CanonicalCapabilityError extends Error {
	constructor(result) {
		super(result.blockers.join(" "));
		this.name = "CanonicalCapabilityError";
		this.code = "ERR_WS_CAPABILITY_NOT_READY";
		this.result = result;
	}
}

/** Execute the shared Local/Jira boundary only after tracker readiness passes. */
export async function runCanonicalSynchronizedTrackerOperation(options) {
	const readiness = requireCanonicalCapability({
		root: options.root,
		capability: "tracker",
		snapshot: options.snapshot,
	});
	if (!readiness.operation.synchronizeWithJira) {
		throw new CanonicalCapabilityError({
			...readiness,
			ready: false,
			blockers: ["The canonical tracker policy does not enable all-ticket Local/Jira synchronization."],
		});
	}
	return runTrackerOperation({
		config: readiness.config,
		localStore: options.localStore,
		syncState: options.syncState,
		operation: options.operation,
		jiraAdapter: options.jiraAdapter,
		persistence: options.persistence,
		conflictChoices: options.conflictChoices,
	});
}
