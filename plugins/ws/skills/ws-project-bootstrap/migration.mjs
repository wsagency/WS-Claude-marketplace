import { lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { parseCanonicalConfigYaml, serializeCanonicalConfig, validateCanonicalConfig, validateCanonicalConfigObject } from "./config.mjs";
import { flattenPaths, getPath, migrationEffect, setPath, sha256 } from "./migration-primitives.mjs";
import { discoverDocsRuntimeState, planDocsRuntimeMigration } from "./migration-docs-runtime.mjs";
import { discoverEngineeringState, planEngineeringMigration } from "./migration-engineering.mjs";
import { discoverJiraState, planJiraMigration } from "./migration-jira.mjs";
import { getAdapterContent } from "./trackers.mjs";
import { CANONICAL_CONFIG_YAML } from "./transaction.mjs";
import { DOCUMENTATION_CONTEXT_FRAGMENTS } from "../ws-docs-bootstrap/transaction.mjs";

const LOCAL_LEGACY_SOURCES = [".claude/ws-project.yaml", ".claude/docs-config.yaml", ".claude/settings.json", ".scratch", ".omp/rules/omp-edge-discipline.md"];
const DISCOVERY_TARGETS = [
	".wsagency/config.yaml",
	...LOCAL_LEGACY_SOURCES,
	"dev-docs/agents/issue-tracker.md",
	"dev-docs/agents/triage-labels.md",
	"dev-docs/agents/domain.md",
	"AGENTS.md",
	"CLAUDE.md",
	"CONTEXT.md",
	"CONTEXT-MAP.md",
];
const DEFAULT_CONFIG = parseCanonicalConfigYaml(CANONICAL_CONFIG_YAML);
const CANONICAL_ROOTS = new Set(["tracker", "triage", "domain", "commit", "changelog", "ui", "runtime", "jira", "docs"]);
const SENSITIVE_MACHINE_HINT = /(?:^|[._-])(?:auth|credential|password|secret|site|token|user|username|account|account_id|cloud_id)(?:$|[._-])/i;
const MACHINE_HINT_ALIASES = new Map([
	["jiraProject", "jira.project"],
	["jira.project", "jira.project"],
	["defaults.jira_actions", "commit.jira.actions"],
	["commit.jira.actions", "commit.jira.actions"],
	["defaults.pr_transition", "commit.jira.pr_transition"],
	["commit.jira.pr_transition", "commit.jira.pr_transition"],
	["defaults.smart_commit_trailer", "commit.jira.smart_commit_trailer"],
	["commit.jira.smart_commit_trailer", "commit.jira.smart_commit_trailer"],
	["defaults.commit_comment", "commit.jira.post_commit_comment"],
	["commit.jira.post_commit_comment", "commit.jira.post_commit_comment"],
	["guard", "runtime.dangerous_git_guard"],
	["runtime.dangerous_git_guard", "runtime.dangerous_git_guard"],
	["dashboard", "ui.session_start_dashboard"],
	["ui.session_start_dashboard", "ui.session_start_dashboard"],
]);

function canonicalOptionField(field) {
	return typeof field === "string" && CANONICAL_ROOTS.has(field.split(".")[0]);
}

function normalizeMachineHint(field, value) {
	if (field === "jira.project") return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : undefined;
	if (field === "commit.jira.actions") return value === "never" ? "disabled" : value;
	if (field === "runtime.dangerous_git_guard") {
		if (value === true || value === "enabled") return "enabled";
		if (value === false || value === "disabled") return "disabled";
		return value;
	}
	if (field === "ui.session_start_dashboard") {
		if (value === true || value === "jira_assignments") return "jira_assignments";
		if (value === false || value === "disabled") return "disabled";
		return value;
	}
	return value;
}

function normalizedConfirmedMachineHints(hints) {
	const normalized = {};
	for (const [sourceField, value] of Object.entries(flattenPaths(hints ?? {}))) {
		if (SENSITIVE_MACHINE_HINT.test(sourceField)) continue;
		const field = MACHINE_HINT_ALIASES.get(sourceField);
		if (!field) continue;
		const normalizedValue = normalizeMachineHint(field, value);
		if (normalizedValue !== undefined) normalized[field] = normalizedValue;
	}
	return normalized;
}

function repositoryClaimFields(engineering, docs, jira) {
	const fields = new Set();
	if (engineering.tracker?.recognized && !engineering.tracker.managed) {
		fields.add("tracker.primary");
		if (engineering.tracker.jiraProject) {
			fields.add("jira.project");
			fields.add("jira.sync");
		}
	}
	if (engineering.triage?.labels && !engineering.triage.managed) {
		for (const field of Object.keys(flattenPaths({ triage: { labels: engineering.triage.labels } }))) fields.add(field);
	}
	if (engineering.domain?.layout && !engineering.domain.managed) fields.add("domain.layout");

	const projectMappings = {
		"jira.project": "jira.project",
		"jira.board": "jira.board",
		"jira.default_issue_type": "jira.default_issue_type",
		"changelog.path": "changelog.path",
		"changelog.skip_types": "changelog.skip_types",
		"hooks.session_start_dashboard": "ui.session_start_dashboard",
	};
	for (const [legacy, canonical] of Object.entries(projectMappings)) {
		if (Object.hasOwn(jira.projectValues ?? {}, legacy)) fields.add(canonical);
	}
	const docsMappings = {
		"docs.user_track": "docs.user_track",
		"docs.dev_track": "docs.dev_track",
		"docs.default_audience": "docs.default_audience",
		"docs.default_scope": "docs.default_scope",
		"docs.auto.adr_for_arch_changes": "docs.adr_for_arch_changes",
		"auto.adr_for_arch_changes": "docs.adr_for_arch_changes",
		"docs.changelog.skip_types": "changelog.skip_types",
	};
	for (const [legacy, canonical] of Object.entries(docsMappings)) {
		if (Object.hasOwn(jira.docsValues ?? {}, legacy)) fields.add(canonical);
	}
	if (Object.hasOwn(jira.projectValues ?? {}, "changelog.auto_update")
		|| Object.hasOwn(jira.docsValues ?? {}, "auto.changelog_per_commit")
		|| Object.hasOwn(jira.docsValues ?? {}, "docs.auto.changelog_per_commit")) {
		fields.add("changelog.update_mode");
	}
	return fields;
}

function isWithinRepository(root, candidate) {
	const relative = path.relative(root, candidate);
	return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function nearestExistingRealPath(target) {
	let candidate = target;
	while (true) {
		try {
			return await realpath(candidate);
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
			const parent = path.dirname(candidate);
			if (parent === candidate) throw error;
			candidate = parent;
		}
	}
}

async function repositoryLocalTarget(root, target) {
	const absolute = path.resolve(root, target);
	if (!isWithinRepository(root, absolute)) return null;
	try {
		const resolved = await nearestExistingRealPath(absolute);
		return isWithinRepository(root, resolved) ? absolute : null;
	} catch {
		return null;
	}
}


async function snapshotEntry(root, target) {
	const absolute = await repositoryLocalTarget(root, target);
	if (!absolute) return { kind: "blocked", content: null, fingerprint: null };
	if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) return { kind: "blocked", content: null, fingerprint: null };
	try {
		const stat = await lstat(absolute);
		if (stat.isSymbolicLink()) return { kind: "blocked", content: null, fingerprint: null };
		if (stat.isDirectory()) {
			let isEmpty = false;
			try {
				const children = await readdir(absolute);
				isEmpty = children.length === 0 || (children.length === 1 && children[0] === ".gitkeep");
			} catch {}
			return { kind: "directory", content: null, fingerprint: sha256(`directory:${isEmpty}`), empty: isEmpty };
		}
		if (!stat.isFile()) return { kind: "blocked", content: null, fingerprint: null };
		const content = await readFile(absolute, "utf8");
		return { kind: "file", content, fingerprint: sha256(content) };
	} catch (error) {
		if (error?.code === "ENOENT") return { kind: "missing", content: null, fingerprint: null };
		return { kind: "blocked", content: null, fingerprint: null };
	}
}


function mergeClaims(claims, canonical, resolutions, repositoryFields, machineHints, selections) {
	const config = structuredClone(canonical ?? { schema_version: 1 });
	const conflicts = [];
	for (const [field, value] of Object.entries(resolutions ?? {})) {
		if (!canonicalOptionField(field) || field === "schema_version" || getPath(config, field) !== undefined) continue;
		setPath(config, field, value);
	}
	for (const field of [...repositoryFields].sort()) {
		if (getPath(config, field) !== undefined) continue;
		const values = claims
			.map(claim => ({ source: claim.source, value: getPath(claim.config, field) }))
			.filter(claim => claim.value !== undefined);
		const distinct = new Map(values.map(value => [JSON.stringify(value.value), value]));
		if (distinct.size > 1) conflicts.push({ field, classification: "ambiguous", values });
		else if (values.length > 0) setPath(config, field, values[0].value);
	}
	for (const [field, value] of Object.entries(machineHints)) {
		if (getPath(config, field) === undefined) setPath(config, field, value);
	}
	for (const [field, value] of Object.entries(flattenPaths(selections ?? {}))) {
		if (canonicalOptionField(field) && getPath(config, field) === undefined) setPath(config, field, value);
	}
	return { config, conflicts };
}

function applyDefaults(config, includeDocs, docsDefaults) {
	const merged = structuredClone(config);
	for (const [field, value] of Object.entries(flattenPaths(DEFAULT_CONFIG))) if (getPath(merged, field) === undefined) setPath(merged, field, value);
	if (includeDocs) {
		for (const [field, value] of Object.entries(flattenPaths(docsDefaults ?? {}))) {
			if (field.startsWith("docs.") && getPath(merged, field) === undefined) setPath(merged, field, value);
		}
	} else {
		delete merged.docs;
	}
	if (merged.tracker.primary === "jira") {
		merged.jira ??= {};
		merged.jira.default_issue_type ??= "Task";
		merged.jira.sync = "disabled";
	}
	if (merged.jira?.sync === "all_local_tickets") merged.tracker.primary = "local";
	return merged;
}


function planHashPayload(plan) {
	return { config: plan.config, effects: plan.effects, blockers: plan.blockers, conflicts: plan.conflicts };
}

export async function discoverLegacySetup(root, machine = {}) {
	const resolvedRoot = await realpath(path.resolve(root));
	const entries = {};
	for (const target of DISCOVERY_TARGETS) entries[target] = await snapshotEntry(resolvedRoot, target);
	let activeLocalWork = false;
	try {
		activeLocalWork = (await readdir(path.join(resolvedRoot, "dev-docs/tickets/open"))).some(name => name.endsWith(".md"));
	} catch {}
	const canonicalEntry = entries[".wsagency/config.yaml"];
	const canonicalValidation = canonicalEntry.kind === "file" ? validateCanonicalConfig(canonicalEntry.content) : null;
	let ompEdgeTemplate = "";
	try {
		ompEdgeTemplate = await readFile(new URL("../../rules/omp-edge-discipline.md", import.meta.url), "utf8");
	} catch {}
	return { root: resolvedRoot, entries, machine, activeLocalWork, canonicalValidation, ompEdgeTemplate };
}

export function planLegacyMigration(discovery, options = {}) {
	const resolutions = options.resolutions ?? {};
	const selections = options.selections ?? {};
	const canonical = discovery.canonicalValidation;
	if (canonical?.status === "future") {
		const blocker = "Future canonical schema detected; update the WS package before setup.";
		const plan = { config: null, effects: [migrationEffect(1, ".wsagency/config.yaml", "file", "BLOCKING_CONFLICT", blocker, discovery.entries[".wsagency/config.yaml"])], blockers: [blocker], conflicts: [], requiresConfirmation: false, report: blocker };
		return { ...plan, hash: sha256(JSON.stringify(planHashPayload(plan))) };
	}
	if (canonical?.status === "invalid") {
		const blocker = "Malformed canonical configuration must be repaired explicitly before legacy migration.";
		const plan = { config: null, effects: [migrationEffect(1, ".wsagency/config.yaml", "file", "BLOCKING_CONFLICT", blocker, discovery.entries[".wsagency/config.yaml"])], blockers: [blocker], conflicts: [], requiresConfirmation: false, report: blocker };
		return { ...plan, hash: sha256(JSON.stringify(planHashPayload(plan))) };
	}

	const settingsEntry = discovery.entries[".claude/settings.json"];
	const hasRuntimeLegacy = settingsEntry?.kind === "file" && /ws[^\n]*(session|guard|dashboard)|dangerous[-_ ]git/i.test(settingsEntry.content);
	const snapshots = Object.fromEntries(Object.entries(discovery.entries).map(([target, entry]) => [target, entry]));
	snapshots.activeLocalWork = discovery.activeLocalWork;
	const engineeringDiscovery = discoverEngineeringState(snapshots);
	const hasUnmanagedOperationalAdapter = (engineeringDiscovery.tracker && !engineeringDiscovery.tracker.managed)
		|| (engineeringDiscovery.triage && !engineeringDiscovery.triage.managed)
		|| (engineeringDiscovery.domain && !engineeringDiscovery.domain.managed);
	const hasRepositoryLegacy = LOCAL_LEGACY_SOURCES.slice(0, 2).some(target => discovery.entries[target]?.kind !== "missing")
		|| hasRuntimeLegacy
		|| hasUnmanagedOperationalAdapter;
	const hasResidualState = LOCAL_LEGACY_SOURCES.slice(3).some(target => discovery.entries[target]?.kind !== "missing");
	if (canonical?.status === "valid" && !hasRepositoryLegacy && !hasResidualState) {
		const plan = { config: canonical.config, effects: [], blockers: [], conflicts: [], requiresConfirmation: false, report: "Valid canonical configuration wins. No migration changes required." };
		return { ...plan, hash: sha256(JSON.stringify(planHashPayload(plan))) };
	}

	const baseline = canonical?.status === "valid" ? canonical.config : { schema_version: 1 };
	const engineering = planEngineeringMigration(engineeringDiscovery, baseline, resolutions);
	const docsSnapshots = canonical?.status === "valid"
		? Object.fromEntries(LOCAL_LEGACY_SOURCES.map(target => [target, snapshots[target]]))
		: snapshots;
	const docsDiscovery = discoverDocsRuntimeState(docsSnapshots, discovery.machine);
	const docs = planDocsRuntimeMigration(docsDiscovery, baseline, resolutions);
	const jiraDiscovery = discoverJiraState({
		".claude/ws-project.yaml": docsDiscovery.project,
		".claude/docs-config.yaml": docsDiscovery.docs,
		"~/.claude/ws/config.yaml": {},
	});
	const jira = planJiraMigration(jiraDiscovery, baseline, resolutions);
	const claims = [
		{ source: "legacy engineering adapters", config: engineering.patch },
		{ source: "legacy docs/runtime policy", config: docs.patch },
		{ source: "legacy Jira initializer", config: jira.patch },
	];
	const repositoryFields = repositoryClaimFields(engineeringDiscovery, docsDiscovery, jiraDiscovery);
	const machineHints = normalizedConfirmedMachineHints(options.confirmedMachineHints);
	const merged = mergeClaims(claims, canonical?.status === "valid" ? canonical.config : null, resolutions, repositoryFields, machineHints, selections);
	if (getPath(merged.config, "tracker.primary") === undefined && getPath(merged.config, "jira.project") !== undefined) setPath(merged.config, "tracker.primary", "jira");
	const includeDocs = baseline.docs !== undefined || docsDiscovery.entries[".claude/docs-config.yaml"]?.kind !== "missing" || Object.keys(merged.config.docs ?? {}).length > 0;
	const config = applyDefaults(merged.config, includeDocs, docs.patch);
	const blockers = [...engineering.blockers, ...docs.blockers, ...jira.blockers];
	const conflicts = [...engineering.conflicts, ...docs.conflicts, ...jira.conflicts, ...merged.conflicts];
	for (const conflict of merged.conflicts) blockers.push(`Explicit resolution required for conflicting ${conflict.field}.`);
	const validation = validateCanonicalConfigObject(config);
	if (validation.status !== "valid") blockers.push(...validation.errors.map(error => `Canonical migration result ${error.path}: ${error.message}`));

	const effects = [];
	const configEntry = discovery.entries[".wsagency/config.yaml"];
	const serialized = validation.status === "valid" ? serializeCanonicalConfig(config) : null;
	const configClassification = blockers.length > 0
		? "BLOCKING_CONFLICT"
		: configEntry.kind === "missing"
			? "CREATE"
			: configEntry.content === serialized
				? "NO-OP"
				: "UPDATE";
	effects.push(migrationEffect(20, ".wsagency/config.yaml", "file", configClassification, blockers.length > 0 ? "Migration is blocked before every write." : configClassification === "NO-OP" ? "Canonical policy already contains the complete migrated state." : "Write the single canonical policy after lossless conversion.", configEntry, serialized));
	const sourceEffects = canonical?.status === "valid" ? engineering.effects : [...engineering.effects, ...docs.effects];
	for (const sourceEffect of sourceEffects) {
		if (sourceEffect.target.startsWith("config:") || LOCAL_LEGACY_SOURCES.includes(sourceEffect.target)) continue;
		const mustSuppressWrite = blockers.length > 0 && ["CREATE", "UPDATE"].includes(sourceEffect.classification);
		effects.push({
			...sourceEffect,
			classification: mustSuppressWrite ? "PRESERVE" : sourceEffect.classification,
			reason: mustSuppressWrite ? `Preserve while migration is blocked: ${sourceEffect.reason}` : sourceEffect.reason,
		});
	}
	for (const [index, target] of LOCAL_LEGACY_SOURCES.entries()) {
		const entry = discovery.entries[target];
		if (!entry || entry.kind === "missing") continue;
		const order = 900 + index;
		let classification = "PRESERVE";
		let after = entry.content;
		let reason = "Preserve unknown, customized, or blocked legacy source.";
		if (blockers.length === 0 && target === ".scratch" && entry.kind === "directory" && entry.empty === true) {
			classification = "UPDATE";
			after = null;
			reason = "Remove the verified empty or generated scratch remnant after all readiness gates pass.";
		} else if (blockers.length === 0 && target === ".omp/rules/omp-edge-discipline.md" && entry.kind === "file") {
			if (discovery.ompEdgeTemplate && entry.content === discovery.ompEdgeTemplate) {
				classification = "UPDATE";
				after = null;
				reason = "Remove the exact generated omp rule now supplied by the native package.";
			} else if (discovery.ompEdgeTemplate && entry.content.split(discovery.ompEdgeTemplate).length === 2) {
				classification = "UPDATE";
				after = entry.content.replace(discovery.ompEdgeTemplate, "");
				reason = "Remove only the exact generated graph contract and byte-preserve project-specific rule prose.";
			}
		} else if (blockers.length === 0 && target !== ".claude/settings.json" && entry.kind === "file") {
			classification = "UPDATE";
			after = null;
			reason = "Delete the verified repository-local legacy source after all readiness gates pass.";
		} else if (target === ".claude/settings.json") {
			reason = "Preserve repository- or user-owned Claude settings; setup only inspects runtime delivery.";
		}
		effects.push(migrationEffect(order, target, target === ".scratch" ? "directory" : "file", classification, reason, entry, after));
	}
	effects.sort((left, right) => left.order - right.order || left.target.localeCompare(right.target));
	const requiresConfirmation = blockers.length === 0 && effects.some(item => ["CREATE", "UPDATE"].includes(item.classification));
	const plan = { config: validation.status === "valid" ? config : null, effects, blockers, conflicts, requiresConfirmation, report: blockers.length > 0 ? "Legacy migration blocked before writes." : requiresConfirmation ? "Complete lossless migration plan requires confirmation." : canonical?.status === "valid" ? "Valid canonical configuration wins. No migration changes required." : "No migration changes required." };
	return { ...plan, hash: sha256(JSON.stringify(planHashPayload(plan))) };
}

function managedContentAligned(content, expected) {
	const managed = expected.trimEnd();
	return typeof content === "string" && content.split(managed).length === 2;
}

function runtimeEvidenceAligned(config, runtimeEvidence) {
	if (config.runtime?.session_discipline === "required" && runtimeEvidence?.sessionDiscipline !== true) return false;
	if (config.runtime?.dangerous_git_guard === "enabled" && runtimeEvidence?.dangerousGitGuard !== true) return false;
	return true;
}

async function verifyCanonicalReadBack(root, plan) {
	const entry = await snapshotEntry(root, ".wsagency/config.yaml");
	if (entry.kind !== "file") throw new Error("Legacy cleanup is not eligible: canonical configuration is missing.");
	const validation = validateCanonicalConfig(entry.content);
	if (validation.status !== "valid") throw new Error("Legacy cleanup is not eligible: canonical schema is invalid.");
	if (!isDeepStrictEqual(validation.config, plan.config)) throw new Error("Legacy cleanup is not eligible: canonical semantic read-back does not match the authorized plan.");
	if (entry.content !== serializeCanonicalConfig(plan.config)) throw new Error("Legacy cleanup is not eligible: canonical file bytes do not match the authorized plan.");
}

async function verifyEngineeringEvidence(root, config) {
	const expectedAdapters = [
		["dev-docs/agents/issue-tracker.md", getAdapterContent(config.tracker.primary)],
		["dev-docs/agents/triage-labels.md", await readFile(new URL("./templates/triage-labels.md", import.meta.url), "utf8")],
		["dev-docs/agents/domain.md", await readFile(new URL("./templates/domain.md", import.meta.url), "utf8")],
	];
	for (const [target, expected] of expectedAdapters) {
		const entry = await snapshotEntry(root, target);
		if (entry.kind !== "file" || !managedContentAligned(entry.content, expected)) {
			throw new Error(`Legacy cleanup is not eligible: migrated adapter ${target} is missing or drifted.`);
		}
	}
}

async function verifyContextEvidence(root, config) {
	const agents = await snapshotEntry(root, "AGENTS.md");
	const claude = await snapshotEntry(root, "CLAUDE.md");
	const contextTarget = config.domain.layout === "multi_context" ? "CONTEXT-MAP.md" : "CONTEXT.md";
	const context = await snapshotEntry(root, contextTarget);
	const start = "<!-- WS-AGENT-SKILLS:START -->";
	const end = "<!-- WS-AGENT-SKILLS:END -->";
	const hasManagedContext = agents.kind === "file"
		&& agents.content.split(start).length === 2
		&& agents.content.split(end).length === 2
		&& agents.content.indexOf(start) < agents.content.indexOf(end);
	const normalizedClaude = claude.kind === "file" ? claude.content.replaceAll("\r\n", "\n").trim() : "";
	const knownThinClaude = normalizedClaude === "@AGENTS.md"
		|| normalizedClaude === DOCUMENTATION_CONTEXT_FRAGMENTS.claude.trim();
	if (!hasManagedContext || !knownThinClaude || context.kind !== "file") {
		throw new Error("Legacy cleanup is not eligible: shared context is missing or drifted.");
	}
}

async function verifyDocsEvidence(root, config) {
	if (!config.docs) return;
	const docsTargets = new Set([config.docs.user_track, config.docs.dev_track]);
	for (const target of docsTargets) {
		const entry = await snapshotEntry(root, target);
		if (entry.kind !== "directory") throw new Error(`Legacy cleanup is not eligible: selected documentation path ${target} is missing or drifted.`);
	}
	const changelog = await snapshotEntry(root, config.changelog.path);
	if (changelog.kind !== "file") throw new Error(`Legacy cleanup is not eligible: selected changelog ${config.changelog.path} is missing or drifted.`);
}

const LOCAL_TICKET_DIRECTORIES = ["dev-docs/tickets/open", "dev-docs/tickets/done"];
const JIRA_KEY = /^[A-Z][A-Z0-9_]*-[1-9]\d*$/;
const JIRA_RETURNED_ID = /^(?:[A-Z][A-Z0-9_]*-[1-9]\d*|[1-9]\d*)$/;
const JIRA_CORRELATION = /^[a-f0-9]{64}$/;
const RECOVERY_FIELDS = new Set(["jira", "jira_sync", "jira_correlation", "jira_returned_id"]);

function ticketRecoveryMetadata(content) {
	const metadata = {};
	let fence = null;
	for (const line of content.replaceAll("\r\n", "\n").split("\n")) {
		const fenceMarker = line.match(/^(`{3,}|~{3,})/u)?.[1];
		if (fenceMarker) {
			if (fence === null) fence = fenceMarker[0];
			else if (fenceMarker[0] === fence) fence = null;
			continue;
		}
		if (fence !== null) continue;
		const field = line.match(/^([a-z_]+):[ \t]*(.*)$/u);
		if (!field || !RECOVERY_FIELDS.has(field[1])) continue;
		if (Object.hasOwn(metadata, field[1])) return { error: `duplicate ${field[1]} evidence` };
		metadata[field[1]] = field[2].trim();
	}

	if (Object.hasOwn(metadata, "jira") && !JIRA_KEY.test(metadata.jira)) return { error: "empty or malformed jira evidence" };
	if (Object.hasOwn(metadata, "jira_sync") && metadata.jira_sync !== "pending") return { error: "empty or malformed jira_sync evidence" };
	if (Object.hasOwn(metadata, "jira_correlation") && !JIRA_CORRELATION.test(metadata.jira_correlation)) return { error: "empty or malformed jira_correlation evidence" };
	if (Object.hasOwn(metadata, "jira_returned_id") && !JIRA_RETURNED_ID.test(metadata.jira_returned_id)) return { error: "empty or malformed jira_returned_id evidence" };
	if (metadata.jira) return { recoverable: true, jiraKey: metadata.jira };
	if (metadata.jira_sync === "pending" && (metadata.jira_correlation || metadata.jira_returned_id)) {
		return {
			recoverable: true,
			correlation: metadata.jira_correlation,
			jiraKey: JIRA_KEY.test(metadata.jira_returned_id ?? "") ? metadata.jira_returned_id : undefined,
			returnedId: metadata.jira_returned_id,
		};
	}
	return { recoverable: false };
}

async function discoverLocalTickets(root) {
	const tickets = [];
	for (const directory of LOCAL_TICKET_DIRECTORIES) {
		const directoryEntry = await snapshotEntry(root, directory);
		if (directoryEntry.kind !== "directory") throw new Error(`Legacy cleanup is not eligible: Local ticket directory ${directory} is missing, unreadable, or symlinked.`);
		const absolute = await repositoryLocalTarget(root, directory);
		if (!absolute) throw new Error(`Legacy cleanup is not eligible: Local ticket directory ${directory} is outside the repository.`);
		let names;
		try {
			names = (await readdir(absolute)).filter(name => name.endsWith(".md")).sort();
		} catch {
			throw new Error(`Legacy cleanup is not eligible: Local ticket directory ${directory} is unreadable.`);
		}
		for (const name of names) {
			const target = `${directory}/${name}`;
			const entry = await snapshotEntry(root, target);
			if (entry.kind !== "file") throw new Error(`Legacy cleanup is not eligible: Local ticket ${target} is unreadable, not a file, or symlinked.`);
			tickets.push({ target, content: entry.content });
		}
	}
	return tickets;
}

async function verifyJiraRecovery(root, config) {
	if (!config.jira || config.jira.sync !== "all_local_tickets") return;
	const tickets = await discoverLocalTickets(root);
	const correlations = new Map();
	const jiraIdentities = new Map();
	for (const ticket of tickets) {
		const evidence = ticketRecoveryMetadata(ticket.content);
		if (evidence.error) throw new Error(`Legacy cleanup is not eligible: ${ticket.target} has ${evidence.error}.`);
		if (!evidence.recoverable) throw new Error(`Legacy cleanup is not eligible: Local ticket ${ticket.target} is unmapped and has no durable Jira recovery evidence.`);
			if (evidence.correlation) {
				const duplicate = correlations.get(evidence.correlation);
				if (duplicate) throw new Error(`Legacy cleanup is not eligible: Local tickets ${duplicate} and ${ticket.target} share Jira correlation evidence.`);
				correlations.set(evidence.correlation, ticket.target);
			}
			const jiraIdentity = evidence.jiraKey ?? evidence.returnedId;
			if (jiraIdentity) {
				const duplicate = jiraIdentities.get(jiraIdentity);
				if (duplicate) throw new Error(`Legacy cleanup is not eligible: Local tickets ${duplicate} and ${ticket.target} share Jira identity evidence.`);
				jiraIdentities.set(jiraIdentity, ticket.target);
			}
		}
	}

async function verifyAuthorizedEffects(root, plan) {
	for (const item of plan.effects) {
		if (item.kind !== "file" && item.kind !== "directory") continue;
		const current = await snapshotEntry(root, item.target);
		if (item.order >= 900 && item.classification === "UPDATE") {
			if (current.kind !== item.kind || current.fingerprint !== item.fingerprint) {
				throw new Error(`Legacy cleanup drift detected for ${item.target}.`);
			}
			continue;
		}
		if (["CREATE", "UPDATE", "NO-OP"].includes(item.classification) && item.after != null && item.target !== ".wsagency/config.yaml") {
			const exact = current.kind === "file" && current.content === item.after;
			const embeddedOnce = current.kind === "file"
				&& item.after.length > 0
				&& current.content.split(item.after).length === 2;
			if (!exact && !embeddedOnce) {
				throw new Error(`Legacy cleanup drift detected for ${item.target}.`);
			}
		}
	}
}

export async function applyLegacyCleanup(root, plan, authorization, runtimeEvidence = {}, injectedFailure) {
	const resolvedRoot = await realpath(path.resolve(root));
	if (authorization !== plan.hash || plan.hash !== sha256(JSON.stringify(planHashPayload(plan)))) throw new Error("Legacy cleanup authorization is stale or invalid.");
	if (plan.blockers.length > 0 || plan.conflicts.length > 0 || !plan.config) throw new Error("Legacy cleanup is not eligible: the authorized migration plan is blocked.");

	const cleanup = plan.effects.filter(item => item.order >= 900 && item.classification === "UPDATE");
	const operations = [];
	const pending = cleanup.map(item => item.target);
	const completed = [];
	let currentTarget = "migration:cleanup:preflight";
	try {
		await verifyCanonicalReadBack(resolvedRoot, plan);
		await verifyEngineeringEvidence(resolvedRoot, plan.config);
		await verifyContextEvidence(resolvedRoot, plan.config);
		if (!runtimeEvidenceAligned(plan.config, runtimeEvidence)) throw new Error("Legacy cleanup is not eligible: active runtime delivery is not verified.");
		await verifyDocsEvidence(resolvedRoot, plan.config);
		await verifyAuthorizedEffects(resolvedRoot, plan);
		await verifyJiraRecovery(resolvedRoot, plan.config);
		if (injectedFailure === "migration:cleanup") {
			currentTarget = injectedFailure;
			throw new Error("Injected cleanup failure");
		}

		for (const item of cleanup) {
			currentTarget = item.target;
			if (injectedFailure === item.target) throw new Error(`Injected cleanup failure at ${item.target}`);
			const current = await snapshotEntry(resolvedRoot, item.target);
			if (current.kind !== item.kind || current.fingerprint !== item.fingerprint) {
				throw new Error(`Legacy cleanup drift detected for ${item.target}.`);
			}
			const target = await repositoryLocalTarget(resolvedRoot, item.target);
			if (!target) throw new Error(`Legacy cleanup refused non-local target ${item.target}.`);
			if (item.after == null) {
				await rm(target, { recursive: item.kind === "directory", force: true });
				const verified = await snapshotEntry(resolvedRoot, item.target);
				if (verified.kind !== "missing") throw new Error(`Legacy cleanup verification failed for ${item.target}.`);
				operations.push({ action: "delete", target: item.target });
			} else {
				if (item.kind !== "file") throw new Error(`Legacy cleanup cannot rewrite non-file target ${item.target}.`);
				await writeFile(target, item.after, "utf8");
				const verified = await snapshotEntry(resolvedRoot, item.target);
				if (verified.kind !== "file" || verified.content !== item.after) {
					throw new Error(`Legacy cleanup verification failed for ${item.target}.`);
				}
				operations.push({ action: "update", target: item.target });
			}
			pending.shift();
			completed.push(operations.at(-1));
		}
		return operations;
	} catch (cause) {
		if (cause?.cleanupProgress) throw cause;
		const failedTarget = cleanup.find(item => cause?.message?.includes(item.target))?.target ?? currentTarget;
		const error = new Error(cause?.message ?? String(cause), { cause });
		error.cleanupProgress = {
			completed: [...completed],
			failed: { target: failedTarget, reason: error.message },
			pending: [...pending],
		};
		throw error;
	}
}
