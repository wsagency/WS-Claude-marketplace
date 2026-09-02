import { lstat, readFile, readdir, realpath, rm } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { parseCanonicalConfigYaml, serializeCanonicalConfig, validateCanonicalConfig, validateCanonicalConfigObject } from "./config.mjs";
import { flattenPaths, getPath, migrationEffect, setPath, sha256 } from "./migration-primitives.mjs";
import { discoverDocsRuntimeState, planDocsRuntimeMigration } from "./migration-docs-runtime.mjs";
import { discoverEngineeringState, planEngineeringMigration } from "./migration-engineering.mjs";
import { discoverJiraState, planJiraMigration } from "./migration-jira.mjs";
import { getAdapterContent } from "./trackers.mjs";
import { CANONICAL_CONFIG_YAML } from "./transaction.mjs";

const LOCAL_LEGACY_SOURCES = [".claude/ws-project.yaml", ".claude/docs-config.yaml", ".claude/settings.json"];
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
		if (stat.isDirectory()) return { kind: "directory", content: null, fingerprint: sha256("directory") };
		if (!stat.isFile()) return { kind: "blocked", content: null, fingerprint: null };
		const content = await readFile(absolute, "utf8");
		return { kind: "file", content, fingerprint: sha256(content) };
	} catch (error) {
		if (error?.code === "ENOENT") return { kind: "missing", content: null, fingerprint: null };
		return { kind: "blocked", content: null, fingerprint: null };
	}
}


function mergeClaims(claims, resolutions, selections) {
	const config = { schema_version: 1 };
	const conflicts = [];
	const fields = [...new Set(claims.flatMap(claim => Object.keys(flattenPaths(claim.config))))].filter(field => field !== "schema_version").sort();
	for (const field of fields) {
		if (Object.hasOwn(resolutions, field)) {
			setPath(config, field, resolutions[field]);
			continue;
		}
		const values = claims
			.map(claim => ({ source: claim.source, value: getPath(claim.config, field) }))
			.filter(claim => claim.value !== undefined);
		const distinct = new Map(values.map(value => [JSON.stringify(value.value), value]));
		if (distinct.size > 1) conflicts.push({ field, classification: "ambiguous", values });
		else if (values.length > 0) setPath(config, field, values[0].value);
	}
	for (const [field, value] of Object.entries(selections ?? {})) if (getPath(config, field) === undefined) setPath(config, field, value);
	return { config, conflicts };
}

function applyDefaults(config, includeDocs) {
	const merged = structuredClone(config);
	for (const [field, value] of Object.entries(flattenPaths(DEFAULT_CONFIG))) if (getPath(merged, field) === undefined) setPath(merged, field, value);
	if (!includeDocs) delete merged.docs;
	if (merged.tracker.primary === "jira") {
		merged.jira ??= { project: "", default_issue_type: "Task", sync: "disabled" };
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
	return { root: resolvedRoot, entries, machine, activeLocalWork, canonicalValidation };
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
	const hasReleasedEngineeringAdapter = engineeringDiscovery.tracker?.generated === true
		|| engineeringDiscovery.triage?.generated === true
		|| engineeringDiscovery.domain?.generated === true;
	const hasRepositoryLegacy = LOCAL_LEGACY_SOURCES.slice(0, 2).some(target => discovery.entries[target]?.kind !== "missing")
		|| hasRuntimeLegacy
		|| hasReleasedEngineeringAdapter;
	if (canonical?.status === "valid" && !hasRepositoryLegacy) {
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
		"~/.claude/ws/config.yaml": options.confirmedMachineHints ?? {},
	});
	const jira = planJiraMigration(jiraDiscovery, baseline, resolutions);
	const claims = [
		{ source: "legacy engineering adapters", config: engineering.patch },
		{ source: "legacy docs/runtime policy", config: docs.patch },
		{ source: "legacy Jira initializer", config: jira.patch },
	];
	const merged = mergeClaims(claims, resolutions, selections);
	if (getPath(merged.config, "tracker.primary") === undefined && getPath(merged.config, "jira.project") !== undefined) setPath(merged.config, "tracker.primary", "jira");
	const includeDocs = baseline.docs !== undefined || docsDiscovery.entries[".claude/docs-config.yaml"]?.kind !== "missing" || Object.keys(merged.config.docs ?? {}).length > 0;
	const config = applyDefaults(merged.config, includeDocs);
	const blockers = [...engineering.blockers, ...docs.blockers, ...jira.blockers];
	const conflicts = [...engineering.conflicts, ...docs.conflicts, ...jira.conflicts, ...merged.conflicts];
	for (const conflict of merged.conflicts) blockers.push(`Explicit resolution required for conflicting ${conflict.field}.`);
	for (const suggestion of jira.suggestions) {
		if (Object.hasOwn(options.confirmedMachineHints ?? {}, suggestion.field) && getPath(config, suggestion.field) === undefined) setPath(config, suggestion.field, suggestion.value);
	}
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
	for (const sourceEffect of [...engineering.effects, ...docs.effects]) {
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
		const known = target !== ".claude/settings.json" || (docsDiscovery.runtime.repositoryOwned && !docsDiscovery.runtime.customized);
		effects.push(migrationEffect(900 + index, target, "file", blockers.length === 0 && known ? "UPDATE" : "PRESERVE", blockers.length === 0 && known ? "Final cleanup: delete the verified repository-local legacy source after all readiness gates pass." : "Preserve unknown, customized, or blocked legacy source.", entry, blockers.length === 0 && known ? null : entry.content));
	}
	effects.sort((left, right) => left.order - right.order || left.target.localeCompare(right.target));
	const requiresConfirmation = blockers.length === 0 && effects.some(item => ["CREATE", "UPDATE"].includes(item.classification));
	const plan = { config: validation.status === "valid" ? config : null, effects, blockers, conflicts, requiresConfirmation, report: blockers.length > 0 ? "Legacy migration blocked before writes." : requiresConfirmation ? "Complete lossless migration plan requires confirmation." : "No migration changes required." };
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
	if (!hasManagedContext || claude.kind !== "file" || claude.content.trim() !== "@AGENTS.md" || context.kind !== "file") {
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

function verifyJiraRecovery(discovery, config) {
	if (!config.jira || config.jira.sync !== "all_local_tickets" || !discovery.activeLocalWork) return;
	throw new Error("Legacy cleanup is not eligible: Jira recovery for active Local tickets is not verified.");
}

async function verifyAuthorizedEffects(root, plan) {
	for (const item of plan.effects) {
		if (item.kind !== "file") continue;
		const current = await snapshotEntry(root, item.target);
		if (item.order >= 900 && item.classification === "UPDATE" && item.after == null) {
			if (current.kind !== "file" || current.fingerprint !== item.fingerprint) throw new Error(`Legacy cleanup drift detected for ${item.target}.`);
			continue;
		}
		if (["CREATE", "UPDATE", "NO-OP"].includes(item.classification) && item.after != null && item.target !== ".wsagency/config.yaml") {
			if (current.kind !== "file" || current.content !== item.after) throw new Error(`Legacy cleanup drift detected for ${item.target}.`);
		}
	}
}

export async function applyLegacyCleanup(root, plan, authorization, runtimeEvidence = {}) {
	const resolvedRoot = await realpath(path.resolve(root));
	if (authorization !== plan.hash || plan.hash !== sha256(JSON.stringify(planHashPayload(plan)))) throw new Error("Legacy cleanup authorization is stale or invalid.");
	if (plan.blockers.length > 0 || plan.conflicts.length > 0 || !plan.config) throw new Error("Legacy cleanup is not eligible: the authorized migration plan is blocked.");
	await verifyCanonicalReadBack(resolvedRoot, plan);
	await verifyEngineeringEvidence(resolvedRoot, plan.config);
	await verifyContextEvidence(resolvedRoot, plan.config);
	if (!runtimeEvidenceAligned(plan.config, runtimeEvidence)) throw new Error("Legacy cleanup is not eligible: active runtime delivery is not verified.");
	await verifyDocsEvidence(resolvedRoot, plan.config);
	const discovery = await discoverLegacySetup(resolvedRoot, runtimeEvidence);
	verifyJiraRecovery(discovery, plan.config);
	await verifyAuthorizedEffects(resolvedRoot, plan);

	const cleanup = plan.effects.filter(item => item.order >= 900 && item.classification === "UPDATE" && item.after == null);
	const operations = [];
	for (const item of cleanup) {
		const current = await snapshotEntry(resolvedRoot, item.target);
		if (current.kind !== "file" || current.fingerprint !== item.fingerprint) throw new Error(`Legacy cleanup drift detected for ${item.target}.`);
		const target = await repositoryLocalTarget(resolvedRoot, item.target);
		if (!target) throw new Error(`Legacy cleanup refused non-local target ${item.target}.`);
		await rm(target);
		const verified = await snapshotEntry(resolvedRoot, item.target);
		if (verified.kind !== "missing") throw new Error(`Legacy cleanup verification failed for ${item.target}.`);
		operations.push({ action: "delete", target: item.target });
	}
	return operations;
}
