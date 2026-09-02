import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { parseCanonicalConfigYaml, serializeCanonicalConfig, validateCanonicalConfig, validateCanonicalConfigObject } from "./config.mjs";
import { discoverDocsRuntimeState, planDocsRuntimeMigration } from "./migration-docs-runtime.mjs";
import { discoverEngineeringState, planEngineeringMigration } from "./migration-engineering.mjs";
import { discoverJiraState, planJiraMigration } from "./migration-jira.mjs";
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

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

async function snapshotEntry(root, target) {
	const absolute = path.resolve(root, target);
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

function flatten(value, prefix = "", output = {}) {
	for (const [key, child] of Object.entries(value ?? {})) {
		const field = prefix ? `${prefix}.${key}` : key;
		if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, field, output);
		else output[field] = child;
	}
	return output;
}

function setPath(target, field, value) {
	const parts = field.split(".");
	let cursor = target;
	for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
	cursor[parts.at(-1)] = structuredClone(value);
}

function getPath(target, field) {
	return field.split(".").reduce((cursor, part) => cursor?.[part], target);
}

function mergeClaims(claims, resolutions, selections) {
	const config = { schema_version: 1 };
	const conflicts = [];
	const fields = [...new Set(claims.flatMap(claim => Object.keys(flatten(claim.config))))].filter(field => field !== "schema_version").sort();
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
	for (const [field, value] of Object.entries(flatten(DEFAULT_CONFIG))) if (getPath(merged, field) === undefined) setPath(merged, field, value);
	if (!includeDocs) delete merged.docs;
	if (merged.tracker.primary === "jira") {
		merged.jira ??= { project: "", default_issue_type: "Task", sync: "disabled" };
		merged.jira.sync = "disabled";
	}
	if (merged.jira?.sync === "all_local_tickets") merged.tracker.primary = "local";
	return merged;
}

function effect(order, target, kind, classification, reason, entry, after) {
	const before = entry?.content ?? null;
	const renderedAfter = arguments.length >= 7 ? after : before;
	return {
		order,
		target,
		kind,
		classification,
		reason,
		before,
		after: renderedAfter,
		diff: classification === "PRESERVE" || classification === "NO-OP" ? "unchanged" : `${JSON.stringify(before)} -> ${JSON.stringify(renderedAfter)}`,
		fingerprint: entry?.fingerprint ?? null,
	};
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
		const plan = { config: null, effects: [effect(1, ".wsagency/config.yaml", "file", "BLOCKING_CONFLICT", blocker, discovery.entries[".wsagency/config.yaml"])], blockers: [blocker], conflicts: [], requiresConfirmation: false, report: blocker };
		return { ...plan, hash: sha256(JSON.stringify(planHashPayload(plan))) };
	}
	if (canonical?.status === "valid") {
		const effects = LOCAL_LEGACY_SOURCES
			.filter(target => discovery.entries[target]?.kind !== "missing")
			.map((target, index) => effect(100 + index, target, "file", "PRESERVE", "Valid canonical policy wins; leave legacy source inert unless separately reviewed for cleanup.", discovery.entries[target]));
		const plan = { config: canonical.config, effects, blockers: [], conflicts: [], requiresConfirmation: false, report: "Valid canonical configuration wins. No migration changes required." };
		return { ...plan, hash: sha256(JSON.stringify(planHashPayload(plan))) };
	}
	if (canonical?.status === "invalid") {
		const blocker = "Malformed canonical configuration must be repaired explicitly before legacy migration.";
		const plan = { config: null, effects: [effect(1, ".wsagency/config.yaml", "file", "BLOCKING_CONFLICT", blocker, discovery.entries[".wsagency/config.yaml"])], blockers: [blocker], conflicts: [], requiresConfirmation: false, report: blocker };
		return { ...plan, hash: sha256(JSON.stringify(planHashPayload(plan))) };
	}

	const snapshots = Object.fromEntries(Object.entries(discovery.entries).map(([target, entry]) => [target, entry]));
	snapshots.activeLocalWork = discovery.activeLocalWork;
	const engineeringDiscovery = discoverEngineeringState(snapshots);
	const engineering = planEngineeringMigration(engineeringDiscovery, { schema_version: 1 }, resolutions);
	const docsDiscovery = discoverDocsRuntimeState(snapshots, discovery.machine);
	const docs = planDocsRuntimeMigration(docsDiscovery, { schema_version: 1 }, resolutions);
	const jiraDiscovery = discoverJiraState({
		".claude/ws-project.yaml": docsDiscovery.project,
		".claude/docs-config.yaml": docsDiscovery.docs,
		"~/.claude/ws/config.yaml": options.confirmedMachineHints ?? {},
	});
	const jira = planJiraMigration(jiraDiscovery, { schema_version: 1 }, resolutions);
	const claims = [
		{ source: "legacy engineering adapters", config: engineering.patch },
		{ source: "legacy docs/runtime policy", config: docs.patch },
		{ source: "legacy Jira initializer", config: jira.patch },
	];
	const merged = mergeClaims(claims, resolutions, selections);
	if (getPath(merged.config, "tracker.primary") === undefined && getPath(merged.config, "jira.project") !== undefined) setPath(merged.config, "tracker.primary", "jira");
	const includeDocs = docsDiscovery.entries[".claude/docs-config.yaml"]?.kind !== "missing" || Object.keys(merged.config.docs ?? {}).length > 0;
	const config = applyDefaults(merged.config, includeDocs);
	const blockers = [...engineering.blockers, ...docs.blockers];
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
	effects.push(effect(20, ".wsagency/config.yaml", "file", blockers.length > 0 ? "BLOCKING_CONFLICT" : configEntry.kind === "missing" ? "CREATE" : "UPDATE", blockers.length > 0 ? "Migration is blocked before every write." : "Write the single canonical policy after lossless conversion.", configEntry, serialized));
	for (const sourceEffect of [...engineering.effects, ...docs.effects]) {
		if (sourceEffect.target.startsWith("config:") || LOCAL_LEGACY_SOURCES.includes(sourceEffect.target)) continue;
		effects.push({ ...sourceEffect, classification: sourceEffect.classification === "BLOCKING_CONFLICT" ? "BLOCKING_CONFLICT" : "PRESERVE", reason: sourceEffect.classification === "BLOCKING_CONFLICT" ? sourceEffect.reason : `Preserve through core cutover: ${sourceEffect.reason}` });
	}
	for (const [index, target] of LOCAL_LEGACY_SOURCES.entries()) {
		const entry = discovery.entries[target];
		if (!entry || entry.kind === "missing") continue;
		const known = target !== ".claude/settings.json" || (docsDiscovery.runtime.repositoryOwned && !docsDiscovery.runtime.customized);
		effects.push(effect(900 + index, target, "file", blockers.length === 0 && known ? "UPDATE" : "PRESERVE", blockers.length === 0 && known ? "Final cleanup: delete the verified repository-local legacy source after all readiness gates pass." : "Preserve unknown, customized, or blocked legacy source.", entry, blockers.length === 0 && known ? null : entry.content));
	}
	effects.sort((left, right) => left.order - right.order || left.target.localeCompare(right.target));
	const requiresConfirmation = blockers.length === 0 && effects.some(item => ["CREATE", "UPDATE"].includes(item.classification));
	const plan = { config: validation.status === "valid" ? config : null, effects, blockers, conflicts, requiresConfirmation, report: blockers.length > 0 ? "Legacy migration blocked before writes." : requiresConfirmation ? "Complete lossless migration plan requires confirmation." : "No migration changes required." };
	return { ...plan, hash: sha256(JSON.stringify(planHashPayload(plan))) };
}

export async function applyLegacyCleanup(root, plan, authorization, readiness) {
	const resolvedRoot = await realpath(path.resolve(root));
	if (authorization !== plan.hash || plan.hash !== sha256(JSON.stringify(planHashPayload(plan)))) throw new Error("Legacy cleanup authorization is stale or invalid.");
	const required = ["configValid", "semanticReadBack", "engineeringReady", "contextReady", "runtimeReady", "fingerprintsReady"];
	if (plan.config?.docs) required.push("docsReady");
	if (plan.config?.jira) required.push("jiraReady");
	const missing = required.filter(key => readiness?.[key] !== true);
	if (missing.length > 0) throw new Error(`Legacy cleanup is not eligible: ${missing.join(", ")}.`);
	const cleanup = plan.effects.filter(item => item.order >= 900 && item.classification === "UPDATE" && item.after == null);
	for (const item of cleanup) {
		const current = await snapshotEntry(resolvedRoot, item.target);
		if (current.kind !== "file" || current.fingerprint !== item.fingerprint) throw new Error(`Legacy cleanup drift detected for ${item.target}.`);
	}
	const operations = [];
	for (const item of cleanup) {
		await rm(path.resolve(resolvedRoot, item.target));
		const verified = await snapshotEntry(resolvedRoot, item.target);
		if (verified.kind !== "missing") throw new Error(`Legacy cleanup verification failed for ${item.target}.`);
		operations.push({ action: "delete", target: item.target });
	}
	return operations;
}
