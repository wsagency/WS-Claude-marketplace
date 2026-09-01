import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
		return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
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

function discoveryIsAligned(discovery) {
	if (discovery.projectShape !== "standalone") return false;
	if (!discovery.machine.sessionDiscipline || !discovery.machine.dangerousGitGuard) return false;
	if (discovery.entries[".wsagency/config.yaml"]?.content !== CANONICAL_CONFIG_YAML) return false;
	for (const target of DIRECTORY_TARGETS) {
		if (discovery.entries[target]?.kind !== "directory") return false;
	}
	for (const target of Object.keys(TEMPLATE_CONTENT).filter(target => target !== "CONTEXT.md")) {
		const entry = discovery.entries[target];
		const markers = MANAGED_MARKERS[target];
		if (!entry || entry.kind !== "file" || !markers) return false;
		if (!managedRegionAligned(entry.content ?? "", TEMPLATE_CONTENT[target], markers[0], markers[1])) return false;
	}
	if (discovery.entries["CONTEXT.md"]?.kind !== "file") return false;
	const agents = discovery.entries["AGENTS.md"];
	if (!agents || agents.kind !== "file" || !managedRegionAligned(agents.content ?? "", AGENT_SKILLS_BLOCK, AGENT_BLOCK_START, AGENT_BLOCK_END)) {
		return false;
	}
	return discovery.entries["CLAUDE.md"]?.content?.trim() === "@AGENTS.md";
}

/** Read-only discovery for the standalone Local transaction. */
export async function discoverStandaloneRepository(root, machine) {
	const resolvedRoot = await realpath(path.resolve(root));
	const gitRoot = runGit(resolvedRoot, ["rev-parse", "--show-toplevel"]);
	const resolvedGitRoot = gitRoot === null ? null : await realpath(path.resolve(gitRoot));
	const isRepository = resolvedGitRoot === resolvedRoot;
	const projectShape = await detectProjectShape(resolvedRoot, isRepository);
	const entries = {};
	for (const target of DIRECTORY_TARGETS) entries[target] = await readSnapshotEntry(resolvedRoot, target, "directory");
	for (const target of FILE_TARGETS) entries[target] = await readSnapshotEntry(resolvedRoot, target, "file");
	const discovery = {
		root: resolvedRoot,
		projectShape,
		setupState: "unconfigured",
		git: {
			isRepository,
			root: resolvedGitRoot,
			origin: isRepository ? runGit(resolvedRoot, ["config", "--get", "remote.origin.url"]) : null,
		},
		machine: {
			activeHarness: machine.activeHarness,
			sessionDiscipline: machine.sessionDiscipline === true,
			dangerousGitGuard: machine.dangerousGitGuard === true,
		},
		entries,
	};
	const config = entries[".wsagency/config.yaml"];
	if (config.kind === "missing") discovery.setupState = "unconfigured";
	else if (config.content !== CANONICAL_CONFIG_YAML) discovery.setupState = "conflicting";
	else discovery.setupState = discoveryIsAligned(discovery) ? "aligned" : "drifted";
	return discovery;
}

function renderDiff(target, before, after) {
	if (before === after) return "";
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

function buildPlan(discovery, choices) {
	const effects = [];
	const gitClassification = discovery.git.isRepository ? "NO-OP" : "BLOCKING_CONFLICT";
	effects.push(baseEffect(0, "git:repository", "state", gitClassification, discovery.git.isRepository ? "Existing Git repository detected." : "Setup requires an existing Git repository.", null));
	effects.push(
		baseEffect(
			1,
			"git:origin",
			"state",
			discovery.git.origin ? "PRESERVE" : "SKIP",
			discovery.git.origin ? "Preserve the detected origin; it is never copied into WS configuration." : "Origin handling belongs to the repository-boundary transaction.",
			null,
		),
	);
	if (discovery.projectShape !== "standalone") {
		effects.push(baseEffect(2, "project:shape", "state", "BLOCKING_CONFLICT", `This transaction supports standalone repositories, not ${discovery.projectShape}.`, null));
	} else {
		effects.push(baseEffect(2, "project:shape", "state", "NO-OP", "Standalone repository scope detected.", null));
	}

	const configEntry = discovery.entries[".wsagency/config.yaml"];
	if (configEntry.kind === "missing") {
		effects.push(baseEffect(10, ".wsagency/config.yaml", "file", "CREATE", "Write the strict versioned recommended Local policy.", configEntry, CANONICAL_CONFIG_YAML));
	} else if (configEntry.kind === "file" && configEntry.content === CANONICAL_CONFIG_YAML) {
		effects.push(baseEffect(10, ".wsagency/config.yaml", "file", "NO-OP", "Canonical configuration is already aligned.", configEntry, CANONICAL_CONFIG_YAML));
	} else {
		effects.push(baseEffect(10, ".wsagency/config.yaml", "file", "BLOCKING_CONFLICT", "Existing configuration is not the verified recommended Local v1 payload.", configEntry));
	}

	effects.push(directoryEffect(20, "dev-docs/tickets/open", discovery));
	effects.push(directoryEffect(21, "dev-docs/tickets/done", discovery));
	effects.push(managedFileEffect(30, "dev-docs/agents/issue-tracker.md", TEMPLATE_CONTENT["dev-docs/agents/issue-tracker.md"], discovery, false));
	effects.push(managedFileEffect(31, "dev-docs/agents/triage-labels.md", TEMPLATE_CONTENT["dev-docs/agents/triage-labels.md"], discovery, false));
	effects.push(managedFileEffect(32, "dev-docs/agents/domain.md", TEMPLATE_CONTENT["dev-docs/agents/domain.md"], discovery, false));
	effects.push(contextEffect(40, discovery));
	effects.push(managedFileEffect(50, "AGENTS.md", AGENT_SKILLS_BLOCK, discovery, true));
	effects.push(claudeEffect(60, discovery));
	effects.push(
		baseEffect(
			70,
			"runtime:session_discipline",
			"state",
			discovery.machine.sessionDiscipline ? "NO-OP" : "BLOCKING_CONFLICT",
			discovery.machine.sessionDiscipline ? "Active harness delivers the required session discipline." : "Active harness does not deliver required session discipline.",
			null,
		),
	);
	effects.push(
		baseEffect(
			71,
			"runtime:dangerous_git_guard",
			"state",
			discovery.machine.dangerousGitGuard ? "NO-OP" : "BLOCKING_CONFLICT",
			discovery.machine.dangerousGitGuard ? "Active harness delivers the required dangerous-git guard." : "Active harness does not deliver the required dangerous-git guard.",
			null,
		),
	);
	effects.push(baseEffect(80, "integration:jira", "state", "SKIP", "Recommended Local setup does not bind Jira.", null));
	effects.push(baseEffect(81, "documentation:bootstrap", "state", "SKIP", "Documentation bootstrap is outside this core setup transaction.", null));

	effects.sort((left, right) => left.order - right.order);
	const scope = { root: discovery.root, projectShape: discovery.projectShape };
	const hashPayload = {
		scope,
		choices,
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

function deriveReadiness(discovery) {
	const configValid = discovery.entries[".wsagency/config.yaml"]?.content === CANONICAL_CONFIG_YAML;
	const trackerReady =
		configValid &&
		discovery.entries["dev-docs/tickets/open"]?.kind === "directory" &&
		discovery.entries["dev-docs/tickets/done"]?.kind === "directory";
	const runtimeReady = discovery.machine.sessionDiscipline && discovery.machine.dangerousGitGuard;
	return {
		configValid,
		engineeringReady: discoveryIsAligned(discovery),
		trackerReady,
		runtimeReady,
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

function noChangeReport(readiness) {
	return [
		"Detected standalone repository with aligned WS setup.",
		"No changes required",
		`Readiness: config=${readiness.configValid ? "ready" : "blocked"}, engineering=${readiness.engineeringReady ? "ready" : "blocked"}, tracker=${readiness.trackerReady ? "ready" : "blocked"}, runtime=${readiness.runtimeReady ? "ready" : "blocked"}.`,
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
		`Readiness: config=${readiness.configValid ? "ready" : "blocked"}, engineering=${readiness.engineeringReady ? "ready" : "blocked"}, tracker=${readiness.trackerReady ? "ready" : "blocked"}, runtime=${readiness.runtimeReady ? "ready" : "blocked"}.`,
	].join("\n");
}

function readinessComplete(readiness) {
	return readiness.configValid && readiness.engineeringReady && readiness.trackerReady && readiness.runtimeReady;
}

function failedVerificationReport(plan, readiness) {
	return verifiedReport(plan, readiness).replace("WS setup verified", "WS setup verification failed");
}

async function applyPlan(root, plan) {
	const operations = [];
	for (const effect of plan.effects) {
		if (!isWriteEffect(effect)) continue;
		const current = await readSnapshotEntry(root, effect.target, effect.kind);
		if (current.fingerprint !== effect.fingerprint) throw new Error(`Authorization is stale: ${effect.target} changed before apply.`);
	}
	for (const effect of plan.effects) {
		if (!isWriteEffect(effect)) continue;
		const absolute = path.join(root, effect.target);
		operations.push({ action: "write", target: effect.target });
		if (effect.kind === "directory") {
			await mkdir(absolute, { recursive: true });
		} else {
			await mkdir(path.dirname(absolute), { recursive: true });
			await writeFile(absolute, effect.after, "utf8");
		}
		const verified = await readSnapshotEntry(root, effect.target, effect.kind);
		if (effect.kind === "directory" ? verified.kind !== "directory" : verified.content !== effect.after) {
			throw new Error(`Verification failed after writing ${effect.target}.`);
		}
		operations.push({ action: "verify", target: effect.target });
	}
	return operations;
}

/** Deterministic plan/authorize/apply seam used by both harnesses. */
export async function runSetupTransaction(request) {
	if ((await realpath(path.resolve(request.root))) !== request.discovery.root) throw new Error("Transaction root does not match the discovered root.");
	const configPresent = request.discovery.entries[".wsagency/config.yaml"]?.kind !== "missing";
	const choices = request.choices ?? (configPresent ? RECOMMENDED_LOCAL_CHOICES : undefined);
	if (!choices) {
		return {
			discovery: request.discovery,
			questions: [
				{
					id: "setup_profile",
					question: "Use the recommended Local Markdown engineering setup?",
					recommended: "recommended_local",
				},
			],
			requiresConfirmation: false,
			operations: [],
			report: "Discovery complete. No files have been changed.",
		};
	}
	if (choices.profile !== "recommended_local") throw new Error(`Unsupported setup profile: ${choices.profile}`);
	const plan = buildPlan(request.discovery, choices);
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
		const readiness = deriveReadiness(request.discovery);
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
	const freshPlan = buildPlan(freshDiscovery, choices);
	if (request.authorization !== plan.hash || request.authorization !== freshPlan.hash) {
		throw new Error("Authorization is stale because the planned target set or payload changed.");
	}
	const operations = await applyPlan(request.root, freshPlan);
	const verifiedDiscovery = await discoverStandaloneRepository(request.root, request.discovery.machine);
	const readiness = deriveReadiness(verifiedDiscovery);
	return {
		discovery: verifiedDiscovery,
		questions: [],
		plan: freshPlan,
		requiresConfirmation: false,
		operations,
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
