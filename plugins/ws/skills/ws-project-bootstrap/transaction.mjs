import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCanonicalConfigYaml, validateCanonicalConfig } from "./config.mjs";
import { checkTrackerReadiness, getAdapterContent, planTrackerEffects } from "./trackers.mjs";

const SKILL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const MISSING_FINGERPRINT = null;
const AGENT_BLOCK_START = "<!-- WS-AGENT-SKILLS:START -->";
const AGENT_BLOCK_END = "<!-- WS-AGENT-SKILLS:END -->";

export const RECOMMENDED_LOCAL_CHOICES = Object.freeze({ profile: "recommended_local" });

export const CANONICAL_CONFIG_YAML = `schema_version: 1

tracker:
  primary: local
  pull_requests: ignore

triage:
  labels:
    needs_triage: needs-triage
    needs_info: needs-info
    ready_for_agent: ready-for-agent
    ready_for_human: ready-for-human
    wontfix: wontfix

domain:
  layout: single_context

commit:
  jira:
    actions: disabled
    smart_commit_trailer: false
    post_commit_comment: false
    pr_transition: null

changelog:
  update_mode: pull_request
  path: CHANGELOG.md
  skip_types: [docs, chore, test, style, build, ci]

ui:
  session_start_dashboard: disabled

runtime:
  session_discipline: required
  dangerous_git_guard: enabled
`;

const AGENT_SKILLS_BLOCK = `${AGENT_BLOCK_START}
## Agent skills

Repository machine policy is defined only in \`.wsagency/config.yaml\`.

### Issue tracker

Read \`tracker.primary\` before tracker operations. The recommended profile uses Local Markdown under \`dev-docs/tickets/\`; see \`dev-docs/agents/issue-tracker.md\`.

### Triage labels

Read the five semantic mappings under \`triage.labels\`; see \`dev-docs/agents/triage-labels.md\`.

### Domain documentation

Read \`domain.layout\`, then follow \`dev-docs/agents/domain.md\` and the applicable \`CONTEXT.md\` before changing domain behavior.

### Runtime policy

The active harness must deliver the session discipline and dangerous-git guard required by \`runtime\` before reporting runtime readiness.
${AGENT_BLOCK_END}`;

const TEMPLATE_CONTENT = Object.freeze({
	"dev-docs/agents/issue-tracker.md": readTemplate("issue-tracker.md"),
	"dev-docs/agents/triage-labels.md": readTemplate("triage-labels.md"),
	"dev-docs/agents/domain.md": readTemplate("domain.md"),
	"CONTEXT.md": readTemplate("context.md"),
});

const DIRECTORY_TARGETS = Object.freeze(["dev-docs/tickets/open", "dev-docs/tickets/done"]);
const FILE_TARGETS = Object.freeze([
	".wsagency/config.yaml",
	"dev-docs/agents/issue-tracker.md",
	"dev-docs/agents/triage-labels.md",
	"dev-docs/agents/domain.md",
	"CONTEXT.md",
	"AGENTS.md",
	"CLAUDE.md",
]);

const MANAGED_MARKERS = Object.freeze({
	"dev-docs/agents/issue-tracker.md": ["<!-- WS-MANAGED:issue-tracker:START -->", "<!-- WS-MANAGED:issue-tracker:END -->"],
	"dev-docs/agents/triage-labels.md": ["<!-- WS-MANAGED:triage-labels:START -->", "<!-- WS-MANAGED:triage-labels:END -->"],
	"dev-docs/agents/domain.md": ["<!-- WS-MANAGED:domain:START -->", "<!-- WS-MANAGED:domain:END -->"],
	"AGENTS.md": [AGENT_BLOCK_START, AGENT_BLOCK_END],
});

function readTemplate(name) {
	return readFileSync(path.join(SKILL_ROOT, "templates", name), "utf8");
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function runGit(root, args) {
	try {
		return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trimEnd();
	} catch (error) {
		if (error.status && error.status !== 0) throw error;
		return null;
	}
}

function safeRunGit(root, args) {
	try {
		return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trimEnd();
	} catch {
		return null;
	}
}
async function exists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function detectProjectShape(root, isRepository) {
	if (!isRepository) return "not_git";
	if (await exists(path.join(root, "project.yaml"))) return "hub_root";
	let parent = path.dirname(root);
	while (parent !== path.dirname(parent)) {
		if (await exists(path.join(parent, "project.yaml"))) return "hub_subrepository";
		parent = path.dirname(parent);
	}
	return "standalone";
}

async function readSnapshotEntry(root, target, expectedKind) {
	const absolute = path.join(root, target);
	try {
		const details = await stat(absolute);
		if (expectedKind === "directory" && details.isDirectory()) {
			return { kind: "directory", fingerprint: "directory" };
		}
		if (expectedKind === "file" && details.isFile()) {
			const content = await readFile(absolute, "utf8");
			return { kind: "file", content, fingerprint: sha256(content) };
		}
		return { kind: details.isDirectory() ? "directory" : "file", fingerprint: `unexpected:${details.mode}` };
	} catch (error) {
		if (error && typeof error === "object" && "code" in error) {
			if (error.code === "ENOENT") return { kind: "missing", fingerprint: MISSING_FINGERPRINT };
			if (error.code === "ENOTDIR") return { kind: "blocked", fingerprint: "blocked:ENOTDIR" };
		}
		throw error;
	}
}

function countOccurrences(content, marker) {
	return content.split(marker).length - 1;
}

function managedRegionAligned(content, desired, start, end) {
	if (countOccurrences(content, start) !== 1 || countOccurrences(content, end) !== 1) return false;
	const startIndex = content.indexOf(start);
	const endIndex = content.indexOf(end, startIndex) + end.length;
	return content.slice(startIndex, endIndex) === desired.trimEnd();
}
function parseTargetConfig(source) {
	const validation = validateCanonicalConfig(source);
	return validation.status === "valid" ? validation.config : null;
}

function runtimeCapabilitiesAligned(config, machine) {
	if (config?.runtime?.session_discipline === "required" && !machine.sessionDiscipline) return false;
	if (config?.runtime?.dangerous_git_guard === "enabled" && !machine.dangerousGitGuard) return false;
	return true;
}

export function discoveryIsAligned(discovery, targetConfig = CANONICAL_CONFIG_YAML, choices = {}) {
	if (discovery.projectShape !== "standalone" && discovery.projectShape !== "hub_root" && discovery.projectShape !== "hub_subrepository") return false;
	const config = parseTargetConfig(targetConfig);
	if (!config || !runtimeCapabilitiesAligned(config, discovery.machine)) return false;
	if (discovery.entries[".wsagency/config.yaml"]?.content !== targetConfig) return false;
	if (config.tracker?.primary === "local") {
		for (const target of DIRECTORY_TARGETS) {
			if (discovery.entries[target]?.kind !== "directory") return false;
		}
	}
	const trackerEntry = discovery.entries["dev-docs/agents/issue-tracker.md"];
	const trackerDesired = getAdapterContent(config.tracker?.primary ?? "local");
	const trackerMarkers = MANAGED_MARKERS["dev-docs/agents/issue-tracker.md"];
	if (!trackerEntry || trackerEntry.kind !== "file" || !managedRegionAligned(trackerEntry.content ?? "", trackerDesired, trackerMarkers[0], trackerMarkers[1])) return false;
	for (const target of ["dev-docs/agents/triage-labels.md", "dev-docs/agents/domain.md"]) {
		const entry = discovery.entries[target];
		const markers = MANAGED_MARKERS[target];
		if (!entry || entry.kind !== "file" || !managedRegionAligned(entry.content ?? "", TEMPLATE_CONTENT[target], markers[0], markers[1])) return false;
	}
	if (discovery.entries["CONTEXT.md"]?.kind !== "file") return false;
	const agents = discovery.entries["AGENTS.md"];
	if (!agents || agents.kind !== "file" || !managedRegionAligned(agents.content ?? "", AGENT_SKILLS_BLOCK, AGENT_BLOCK_START, AGENT_BLOCK_END)) return false;
	if (discovery.entries["CLAUDE.md"]?.content?.trim() !== "@AGENTS.md") return false;
	return checkTrackerReadiness(config, discovery, choices.jiraValidation, choices.capabilities).trackerReady;
}

/** Read-only discovery for the standalone Local transaction. */
export async function discoverStandaloneRepository(root, machine) {
	const resolvedRoot = await realpath(path.resolve(root));
	const gitRoot = safeRunGit(resolvedRoot, ["rev-parse", "--show-toplevel"]);
	const resolvedGitRoot = gitRoot === null ? null : await realpath(path.resolve(gitRoot));
	const isRepository = resolvedGitRoot === resolvedRoot;
	const projectShape = await detectProjectShape(resolvedRoot, isRepository);
	const entries = {};
	for (const target of DIRECTORY_TARGETS) entries[target] = await readSnapshotEntry(resolvedRoot, target, "directory");
	for (const target of FILE_TARGETS) entries[target] = await readSnapshotEntry(resolvedRoot, target, "file");
	
	const dirtyLines = isRepository ? safeRunGit(resolvedRoot, ["status", "--porcelain"])?.split("\n").filter(Boolean) ?? [] : [];
	const dirty = dirtyLines
		.filter(line => !line.startsWith("??"))
		.map(line => {
			const rawPath = line.substring(3);
			const pathMatch = rawPath.split(" -> ");
			const targetPath = pathMatch.length > 1 ? pathMatch[1] : pathMatch[0];
			return targetPath.replace(/\/$/, "");
		});

	const discovery = {
		root: resolvedRoot,
		projectShape,
		setupState: "unconfigured",
		git: {
			isRepository,
			root: resolvedGitRoot,
			origin: isRepository ? safeRunGit(resolvedRoot, ["config", "--get", "remote.origin.url"]) : null,
			head: isRepository ? safeRunGit(resolvedRoot, ["rev-parse", "HEAD"]) : null,
			dirty,
		},
		machine: {
			activeHarness: machine.activeHarness,
			sessionDiscipline: machine.sessionDiscipline === true,
			dangerousGitGuard: machine.dangerousGitGuard === true,
			ghCli: machine.ghCli === true,
			glabCli: machine.glabCli === true,
			jiraCli: machine.jiraCli === true,
		},
		entries,
	};
	const config = entries[".wsagency/config.yaml"];
	if (config.kind === "missing") discovery.setupState = "unconfigured";
	else if (config.kind !== "file") discovery.setupState = "conflicting";
	else {
		const validation = validateCanonicalConfig(config.content);
		discovery.setupState = validation.status === "valid" && discoveryIsAligned(discovery, config.content, { capabilities: discovery.machine }) ? "aligned" : validation.status;
		if (validation.status === "valid" && discovery.setupState !== "aligned") discovery.setupState = "drifted";
	}
	return discovery;
}

function renderDiff(target, before, after) {
	if (before === after) return "";
	if (typeof before !== "string" || typeof after !== "string") return "";
	const beforeLines = before === "" ? [] : before.replace(/\n$/, "").split("\n");
	const afterLines = after === "" ? [] : after.replace(/\n$/, "").split("\n");
	let prefix = 0;
	while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;
	let suffix = 0;
	while (
		suffix < beforeLines.length - prefix &&
		suffix < afterLines.length - prefix &&
		beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
	) suffix += 1;
	const removed = beforeLines.slice(prefix, beforeLines.length - suffix).map(line => `-${line}`);
	const added = afterLines.slice(prefix, afterLines.length - suffix).map(line => `+${line}`);
	return [`--- ${target}`, `+++ ${target}`, `@@ line ${prefix + 1} @@`, ...removed, ...added].join("\n");
}

function baseEffect(order, target, kind, classification, reason, entry, after) {
	const before = entry?.kind === "file" ? entry.content ?? "" : undefined;
	return {
		order,
		target,
		kind,
		classification,
		reason,
		...(before === undefined ? {} : { before }),
		...(after === undefined ? {} : { after }),
		diff: before === undefined || after === undefined ? (after === undefined ? "" : renderDiff(target, "", after)) : renderDiff(target, before, after),
		fingerprint: entry?.fingerprint ?? null,
	};
}

function directoryEffect(order, target, discovery) {
	const entry = discovery.entries[target];
	if (entry.kind === "directory") return baseEffect(order, target, "directory", "NO-OP", "Directory already exists.", entry);
	if (entry.kind === "missing") return baseEffect(order, target, "directory", "CREATE", "Create the Local Markdown tracker directory.", entry);
	return baseEffect(order, target, "directory", "BLOCKING_CONFLICT", "A non-directory entry occupies the required tracker path.", entry);
}


function replaceManagedRegion(content, desired, start, end) {
	if (countOccurrences(content, start) !== 1 || countOccurrences(content, end) !== 1) return null;
	const startIndex = content.indexOf(start);
	const endIndex = content.indexOf(end, startIndex);
	if (endIndex < startIndex) return null;
	return content.slice(0, startIndex) + desired.trimEnd() + content.slice(endIndex + end.length);
}

function managedFileEffect(order, target, desired, discovery, allowAppend) {
	const entry = discovery.entries[target];
	if (entry.kind === "missing") return baseEffect(order, target, "file", "CREATE", "Create canonical managed guidance.", entry, `${desired.trimEnd()}\n`);
	if (entry.kind !== "file") return baseEffect(order, target, "file", "BLOCKING_CONFLICT", "A non-file entry occupies the required path.", entry);
	const markers = MANAGED_MARKERS[target];
	const replaced = replaceManagedRegion(entry.content ?? "", desired, markers[0], markers[1]);
	if (replaced !== null) {
		if (replaced === entry.content) return baseEffect(order, target, "file", "NO-OP", "Managed range is already aligned.", entry, replaced);
		return baseEffect(order, target, "file", "UPDATE", "Replace only the known managed range and preserve surrounding authored bytes.", entry, replaced);
	}
	const startCount = countOccurrences(entry.content ?? "", markers[0]);
	const endCount = countOccurrences(entry.content ?? "", markers[1]);
	if (allowAppend && startCount === 0 && endCount === 0) {
		const separator = entry.content === "" ? "" : entry.content.endsWith("\n\n") ? "" : entry.content.endsWith("\n") ? "\n" : "\n\n";
		const after = `${entry.content}${separator}${desired.trimEnd()}\n`;
		return baseEffect(order, target, "file", "UPDATE", "Append the canonical managed range while preserving existing authored guidance.", entry, after);
	}
	return baseEffect(order, target, "file", "BLOCKING_CONFLICT", "Existing unmanaged content requires a reviewed migration before setup can write.", entry);
}

function contextEffect(order, discovery) {
	const target = "CONTEXT.md";
	const entry = discovery.entries[target];
	const desired = TEMPLATE_CONTENT[target];
	if (entry.kind === "missing") return baseEffect(order, target, "file", "CREATE", "Create the single-context domain record.", entry, desired);
	if (entry.kind !== "file") return baseEffect(order, target, "file", "BLOCKING_CONFLICT", "A non-file entry occupies the domain context path.", entry);
	if (entry.content === desired) return baseEffect(order, target, "file", "NO-OP", "Domain context is already aligned.", entry, desired);
	return baseEffect(order, target, "file", "PRESERVE", "Preserve existing authored domain context.", entry, entry.content);
}

function claudeEffect(order, discovery) {
	const target = "CLAUDE.md";
	const entry = discovery.entries[target];
	const desired = "@AGENTS.md\n";
	if (entry.kind === "missing") return baseEffect(order, target, "file", "CREATE", "Create the thin canonical import.", entry, desired);
	if (entry.kind !== "file") return baseEffect(order, target, "file", "BLOCKING_CONFLICT", "A non-file entry occupies the Claude context path.", entry);
	if (entry.content.trim() === "@AGENTS.md") return baseEffect(order, target, "file", "NO-OP", "Thin import is already aligned.", entry, entry.content);
	return baseEffect(order, target, "file", "BLOCKING_CONFLICT", "A fat or conflicting Claude context requires reviewed migration.", entry);
}

function validateOrigin(origin, injection) {
	if (injection) {
		if (injection.origin !== origin) return { isValid: false, reason: "Injected validation origin mismatch" };
		return { isValid: injection.isValid, reason: injection.reason || "Injected validation failure" };
	}
	try {
		const url = new URL(origin);
		return { isValid: url.protocol === "https:" || url.protocol === "git:", reason: "" };
	} catch (e) {
		return { isValid: origin.startsWith("git@"), reason: "Malformed origin URL" };
	}
}

export function buildPlan(discovery, choices, validationInjection) {
	const effects = [];
	const isNotGit = discovery.projectShape === "not_git";
	const createRepo = isNotGit && choices.createRepository;

	let gitClassification = discovery.git.isRepository ? "NO-OP" : "BLOCKING_CONFLICT";
	let gitReason = discovery.git.isRepository ? "Existing Git repository detected." : "Setup requires an existing Git repository.";
	if (createRepo) {
		gitClassification = "CREATE";
		gitReason = "Initialize a new Git repository.";
	}
	effects.push(baseEffect(0, "git:repository", "state", gitClassification, gitReason, null, createRepo ? "CREATE" : null));

	let originClassification = "SKIP";
	let originReason = "Origin handling belongs to the repository-boundary transaction.";
	let originAfter = null;
	if (discovery.git.origin) {
		originClassification = "PRESERVE";
		originReason = "Preserve the detected origin; it is never copied into WS configuration.";
	} else if (createRepo) {
		const validation = validateOrigin(choices.origin || "", validationInjection);
		if (!choices.origin) {
			originClassification = "BLOCKING_CONFLICT";
			originReason = "A valid origin URL is required to create a repository.";
		} else if (!validation.isValid) {
			originClassification = "BLOCKING_CONFLICT";
			originReason = `Invalid origin URL: ${validation.reason || "Malformed or inaccessible"}.`;
		} else {
			originClassification = "CREATE";
			originReason = "Configure the required origin for the new repository.";
			originAfter = choices.origin;
		}
	}
	effects.push(baseEffect(1, "git:origin", "state", originClassification, originReason, null, originAfter));

	if (discovery.projectShape === "not_git" || discovery.projectShape === "standalone" || discovery.projectShape === "hub_root" || discovery.projectShape === "hub_subrepository") {
		effects.push(baseEffect(2, "project:shape", "state", "NO-OP", `Detected ${discovery.projectShape} repository scope.`, null));
	} else {
		effects.push(baseEffect(2, "project:shape", "state", "BLOCKING_CONFLICT", `This transaction does not support ${discovery.projectShape}.`, null));
	}

	const configEntry = discovery.entries[".wsagency/config.yaml"] || { kind: "missing", fingerprint: null };
	const targetConfig = choices?.targetConfig || CANONICAL_CONFIG_YAML;
	const configValidation = validateCanonicalConfig(targetConfig);
	const config = configValidation.status === "valid" ? configValidation.config : null;
	if (!config) {
		effects.push(baseEffect(10, ".wsagency/config.yaml", "file", "BLOCKING_CONFLICT", "Target configuration is not a strict valid installed-schema policy.", configEntry));
	} else if (configEntry.kind === "missing") {
		effects.push(baseEffect(10, ".wsagency/config.yaml", "file", "CREATE", "Write the strict versioned policy.", configEntry, targetConfig));
	} else if (configEntry.kind === "file" && configEntry.content === targetConfig) {
		effects.push(baseEffect(10, ".wsagency/config.yaml", "file", "NO-OP", "Configuration is already aligned.", configEntry, targetConfig));
	} else {
		effects.push(baseEffect(10, ".wsagency/config.yaml", "file", choices?.targetConfig ? "UPDATE" : "BLOCKING_CONFLICT", choices?.targetConfig ? "Apply the explicitly materialized configuration." : "Existing configuration is not the verified recommended Local v1 payload.", configEntry, choices?.targetConfig ? targetConfig : undefined));
	}

	const engineeringEnabled = Boolean(config?.tracker && config?.triage && config?.domain && config?.commit && config?.runtime);
	if (engineeringEnabled) {
		if (config.tracker.primary === "local") {
			effects.push(directoryEffect(20, "dev-docs/tickets/open", discovery));
			effects.push(directoryEffect(21, "dev-docs/tickets/done", discovery));
		} else {
			effects.push(baseEffect(20, "dev-docs/tickets/open", "directory", "SKIP", `${config.tracker.primary} owns tickets; do not create a Local store.`, discovery.entries["dev-docs/tickets/open"]));
			effects.push(baseEffect(21, "dev-docs/tickets/done", "directory", "SKIP", `${config.tracker.primary} owns tickets; do not create a Local store.`, discovery.entries["dev-docs/tickets/done"]));
		}
		const trackerEffects = planTrackerEffects(config, discovery, choices?.jiraValidation, choices?.capabilities);
		effects.push(...trackerEffects.filter(item => item.target !== "dev-docs/agents/issue-tracker.md"));
		effects.push(managedFileEffect(30, "dev-docs/agents/issue-tracker.md", getAdapterContent(config.tracker.primary), discovery, false));
		effects.push(managedFileEffect(31, "dev-docs/agents/triage-labels.md", TEMPLATE_CONTENT["dev-docs/agents/triage-labels.md"], discovery, false));
		effects.push(managedFileEffect(32, "dev-docs/agents/domain.md", TEMPLATE_CONTENT["dev-docs/agents/domain.md"], discovery, false));
		effects.push(contextEffect(40, discovery));
		effects.push(managedFileEffect(50, "AGENTS.md", AGENT_SKILLS_BLOCK, discovery, true));
		effects.push(claudeEffect(60, discovery));
		const disciplineReady = discovery.machine.sessionDiscipline || config.runtime.session_discipline !== "required";
		effects.push(baseEffect(70, "runtime:session_discipline", "state", disciplineReady ? "NO-OP" : "BLOCKING_CONFLICT", disciplineReady ? "Active harness satisfies repository session policy." : "Active harness does not deliver required session discipline.", null));
		const guardReady = discovery.machine.dangerousGitGuard || config.runtime.dangerous_git_guard !== "enabled";
		effects.push(baseEffect(71, "runtime:dangerous_git_guard", "state", guardReady ? "NO-OP" : "BLOCKING_CONFLICT", guardReady ? "Active harness satisfies repository dangerous-git policy." : "Active harness does not deliver the required dangerous-git guard.", null));
	} else {
		for (const [order, target, kind] of [[20, "dev-docs/tickets/open", "directory"], [21, "dev-docs/tickets/done", "directory"], [30, "dev-docs/agents/issue-tracker.md", "file"], [31, "dev-docs/agents/triage-labels.md", "file"], [32, "dev-docs/agents/domain.md", "file"], [40, "CONTEXT.md", "file"], [50, "AGENTS.md", "file"], [60, "CLAUDE.md", "file"]]) {
			effects.push(baseEffect(order, target, kind, "SKIP", "Engineering setup is not selected by this partial canonical policy.", discovery.entries[target]));
		}
		effects.push(baseEffect(70, "runtime:session_discipline", "state", "SKIP", "Engineering runtime policy is not selected.", null));
		effects.push(baseEffect(71, "runtime:dangerous_git_guard", "state", "SKIP", "Engineering runtime policy is not selected.", null));
	}
	effects.push(baseEffect(81, "documentation:bootstrap", "state", config?.docs ? "PRESERVE" : "SKIP", config?.docs ? "Documentation effects are owned by the confirmed docs-bootstrap worker manifest." : "Documentation bootstrap was not selected.", null));

	const plannedTargets = new Set(effects.map(e => e.target));
	const dirtyFiles = discovery.git.dirty;

	for (const effect of effects) {
		if ((isWriteEffect(effect) || effect.classification === "PRESERVE") && dirtyFiles.includes(effect.target)) {
			effect.classification = "BLOCKING_CONFLICT";
			effect.reason = `Dirty overlap: ${effect.target} has uncommitted changes.`;
		}
	}

	for (const dirtyFile of dirtyFiles) {
		if (!plannedTargets.has(dirtyFile)) {
			effects.push(baseEffect(99, dirtyFile, "file", "PRESERVE", "Preserve unrelated uncommitted changes.", discovery.entries[dirtyFile] || { kind: "unknown", fingerprint: "dirty" }, undefined));
		}
	}
	effects.sort((left, right) => left.order - right.order);

	const scope = { root: discovery.root, projectShape: discovery.projectShape };
	const hashPayload = {
		scope,
		choices,
		repositoryIdentity: {
			head: discovery.git.head,
			dirty: discovery.git.dirty,
		},
		effects: effects.map(effect => ({
			order: effect.order,
			target: effect.target,
			kind: effect.kind,
			classification: effect.classification,
			after: effect.after,
			fingerprint: effect.fingerprint,
		})),
	};
	return { hash: sha256(JSON.stringify(hashPayload)), scope, effects };
}

export function deriveReadiness(discovery, choices = {}) {
	const targetConfig = choices.targetConfig || CANONICAL_CONFIG_YAML;
	const validation = validateCanonicalConfig(targetConfig);
	const config = validation.status === "valid" ? validation.config : null;
	const configValid = Boolean(config) && discovery.entries[".wsagency/config.yaml"]?.content === targetConfig;
	const engineeringSelected = Boolean(config?.tracker && config?.triage && config?.domain && config?.commit && config?.runtime);
	const tracker = config?.tracker ? checkTrackerReadiness(config, discovery, choices.jiraValidation, choices.capabilities) : { trackerReady: false, blockers: ["Tracker policy is not configured."] };
	const runtimeReady = Boolean(config?.runtime) && runtimeCapabilitiesAligned(config, discovery.machine);
	return {
		configValid,
		engineeringReady: configValid && engineeringSelected && discoveryIsAligned(discovery, targetConfig, choices),
		trackerReady: configValid && tracker.trackerReady,
		docsReady: configValid && Boolean(config?.docs) && choices.docsReadiness?.ready === true,
		docsConfigured: Boolean(config?.docs),
		runtimeReady: configValid && runtimeReady,
		blockers: {
			tracker: tracker.blockers,
			docs: config?.docs && choices.docsReadiness?.ready !== true ? [choices.docsReadiness?.reason || "Documentation artifacts have not been verified by docs-bootstrap."] : [],
		},
	};
}

function isWriteEffect(effect) {
	return effect.classification === "CREATE" || effect.classification === "UPDATE";
}

function hasWrites(plan) {
	return plan.effects.some(isWriteEffect);
}

function blockingEffects(plan) {
	return plan.effects.filter(effect => effect.classification === "BLOCKING_CONFLICT");
}

function readinessSummary(readiness) {
	return `Readiness: config=${readiness.configValid ? "ready" : "blocked"}, engineering=${readiness.engineeringReady ? "ready" : "blocked"}, tracker=${readiness.trackerReady ? "ready" : "blocked"}, documentation=${readiness.docsConfigured ? readiness.docsReady ? "ready" : "blocked" : "not configured"}, runtime=${readiness.runtimeReady ? "ready" : "blocked"}.`;
}

function noChangeReport(readiness) {
	return [
		"Detected repository with aligned WS setup.",
		"No changes required",
		readinessSummary(readiness),
	].join("\n");
}

function verifiedReport(plan, readiness) {
	const completed = plan.effects
		.filter(isWriteEffect)
		.map(effect => `  ${effect.classification} ${effect.target}`);
	return [
		"WS setup verified",
		"Completed:",
		...completed,
		readinessSummary(readiness),
	].join("\n");
}

function readinessComplete(readiness) {
	return readiness.configValid && readiness.engineeringReady && readiness.trackerReady && readiness.runtimeReady && (!readiness.docsConfigured || readiness.docsReady);
}

function failedVerificationReport(plan, readiness) {
	return verifiedReport(plan, readiness).replace("WS setup verified", "WS setup verification failed");
}

export async function applyPlan(root, plan, injectedFailure) {
	const operations = [];
	const completed = [];
	const pending = [];
	for (const effect of plan.effects) {
		if (!isWriteEffect(effect)) continue;
		const current = effect.kind === "state" ? { kind: "state" } : await readSnapshotEntry(root, effect.target, effect.kind);
		if (current.fingerprint !== effect.fingerprint && effect.kind !== "state") throw new Error(`Authorization is stale: ${effect.target} changed before apply.`);
		pending.push(effect.target);
	}
	for (const effect of plan.effects) {
		if (!isWriteEffect(effect)) continue;
		try {
			if (injectedFailure?.phase === "write" && injectedFailure?.target === effect.target) {
				throw new Error("Injected write failure");
			}
			const absolute = path.join(root, effect.target);
			operations.push({ action: "write", target: effect.target });
			if (effect.kind === "directory") {
				await mkdir(absolute, { recursive: true });
			} else if (effect.kind === "file") {
				await mkdir(path.dirname(absolute), { recursive: true });
				await writeFile(absolute, effect.after, "utf8");
			} else if (effect.kind === "state") {
				if (effect.target === "git:repository") {
					await runGit(root, ["init"]);
				} else if (effect.target === "git:origin") {
					await runGit(root, ["remote", "add", "origin", effect.after]);
				}
			}

			if (injectedFailure?.phase === "verify" && injectedFailure?.target === effect.target) {
				throw new Error("Injected verify failure");
			}
			const verified = effect.kind === "state" ? { kind: "state" } : await readSnapshotEntry(root, effect.target, effect.kind);
			if (effect.kind === "directory" ? verified.kind !== "directory" : (effect.kind === "file" && verified.content !== effect.after)) {
				throw new Error(`Verification failed after writing ${effect.target}.`);
			}
			operations.push({ action: "verify", target: effect.target });
			completed.push(effect.target);
			pending.shift();
		} catch (error) {
			return { operations, failure: { target: effect.target, error, completed, pending } };
		}
	}
	return { operations, failure: null };
}

/** Deterministic plan/authorize/apply seam used by both harnesses. */
export async function runSetupTransaction(request) {
	if ((await realpath(path.resolve(request.root))) !== request.discovery.root) throw new Error("Transaction root does not match the discovered root.");

	const isNotGit = request.discovery.projectShape === "not_git";
	let choices = request.choices;
	if (!choices) {
		const configEntry = request.discovery.entries[".wsagency/config.yaml"];
		const validation = configEntry?.kind === "file" ? validateCanonicalConfig(configEntry.content) : null;
		if (validation?.status === "valid" && !isNotGit) choices = { profile: "canonical", targetConfig: configEntry.content, capabilities: request.discovery.machine };
	}
	const needsProfile = !choices?.profile;
	const needsCreateRepo = isNotGit && choices?.createRepository === undefined;
	const needsOrigin = isNotGit && choices?.createRepository && typeof choices?.origin !== "string";

	if (needsProfile || needsCreateRepo || needsOrigin) {
		const questions = [];
		if (needsProfile) {
			questions.push({
				id: "setup_profile",
				question: "Use the recommended Local Markdown engineering setup?",
				recommended: "recommended_local",
			});
		}
		if (needsCreateRepo) {
			questions.push({
				id: "create_repository",
				question: "No Git repository found. Create one?",
				recommended: true,
			});
		} else if (needsOrigin) {
			questions.push({
				id: "origin_url",
				question: "Repository origin URL (required):",
			});
		}
		return {
			discovery: request.discovery,
			questions,
			requiresConfirmation: false,
			operations: [],
			report: "Discovery complete. No files have been changed.",
		};
	}
	if (!["recommended_local", "canonical", "materialized"].includes(choices.profile)) throw new Error(`Unsupported setup profile: ${choices.profile}`);
	const plan = buildPlan(request.discovery, choices, request.injectedOriginValidation);
	const blockers = blockingEffects(plan);
	if (blockers.length > 0) {
		return {
			discovery: request.discovery,
			questions: [],
			plan,
			requiresConfirmation: false,
			operations: [],
			report: ["Setup blocked before writes:", ...blockers.map(effect => `  ${effect.target}: ${effect.reason}`)].join("\n"),
		};
	}
	if (!hasWrites(plan)) {
		const readiness = deriveReadiness(request.discovery, choices);
		return {
			discovery: request.discovery,
			questions: [],
			plan,
			requiresConfirmation: false,
			operations: [],
			readiness,
			report: noChangeReport(readiness),
		};
	}
	if (!request.authorization) {
		return {
			discovery: request.discovery,
			questions: [],
			plan,
			requiresConfirmation: true,
			operations: [],
			report: "Complete plan ready. No files have been changed.",
		};
	}
	const freshDiscovery = await discoverStandaloneRepository(request.root, request.discovery.machine);
	const freshPlan = buildPlan(freshDiscovery, choices, request.injectedOriginValidation);
	if (request.authorization !== plan.hash || request.authorization !== freshPlan.hash) {
		throw new Error("Authorization is stale because the planned target set or payload changed.");
	}
	const applyResult = await applyPlan(request.root, freshPlan, request.injectedFailure);
	const verifiedDiscovery = await discoverStandaloneRepository(request.root, request.discovery.machine);
	const readiness = deriveReadiness(verifiedDiscovery, choices);

	if (applyResult.failure) {
		const f = applyResult.failure;
		return {
			discovery: verifiedDiscovery,
			questions: [],
			plan: freshPlan,
			requiresConfirmation: false,
			operations: applyResult.operations,
			readiness,
			report: [
				`Transaction stopped at ${f.target}: ${f.error.message}`,
				"No rollback was performed. The repository is in a partial setup state.",
				`Completed: ${f.completed.length === 0 ? "none" : f.completed.join(", ")}`,
				`Pending: ${f.pending.join(", ")}`,
				"To resume, run exactly:",
				"  omp ws-setup",
			].join("\n"),
		};
	}

	return {
		discovery: verifiedDiscovery,
		questions: [],
		plan: freshPlan,
		requiresConfirmation: false,
		operations: applyResult.operations,
		readiness,
		report: readinessComplete(readiness) ? verifiedReport(freshPlan, readiness) : failedVerificationReport(freshPlan, readiness),
	};
}

function commandLineArgument(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

async function runCommandLine() {
	const verb = process.argv[2];
	const root = commandLineArgument("--root");
	const machineJson = commandLineArgument("--machine");
	if (!verb || !root || !machineJson) throw new Error("Usage: transaction.mjs <discover|plan|apply> --root <path> --machine <json> [--profile recommended_local] [--authorization <hash>]");
	const machine = JSON.parse(machineJson);
	const discovery = await discoverStandaloneRepository(root, machine);
	if (verb === "discover") {
		console.log(JSON.stringify(discovery, null, 2));
		return;
	}
	const profile = commandLineArgument("--profile");
	const choices = profile ? { profile } : undefined;
	const authorization = commandLineArgument("--authorization");
	const result = await runSetupTransaction({ root, discovery, choices, authorization });
	console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	runCommandLine().catch(error => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
