import { createHash } from "node:crypto";
import { parseCanonicalConfigYaml } from "./config.mjs";

const DOCS_CONFIG = ".claude/docs-config.yaml";
const PROJECT_CONFIG = ".claude/ws-project.yaml";
const REPO_SETTINGS = ".claude/settings.json";
const KNOWN_DOCS_LEAVES = new Set([
	"docs.initialized",
	"docs.version",
	"docs.user_track",
	"docs.dev_track",
	"docs.default_audience",
	"docs.default_scope",
	"docs.changelog.skip_types",
	"docs.auto.changelog_per_commit",
	"docs.auto.adr_for_arch_changes",
	"docs.auto.enforce_via_hooks",
	"docs.surface.subagent_status",
	"auto.changelog_per_commit",
	"auto.adr_for_arch_changes",
	"auto.enforce_via_hooks",
	"surface.subagent_status",
]);

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function normalizeEntry(value) {
	if (value == null) return { kind: "missing", content: null, fingerprint: null };
	if (typeof value === "string") return { kind: "file", content: value, fingerprint: sha256(value) };
	if (typeof value === "object" && Object.hasOwn(value, "content")) return {
		kind: value.kind ?? "file",
		content: value.content,
		fingerprint: value.fingerprint ?? (typeof value.content === "string" ? sha256(value.content) : null),
	};
	return { kind: "state", content: value, fingerprint: sha256(JSON.stringify(value)) };
}

function parseObject(entry, source) {
	if (entry.kind === "missing") return { value: {}, malformed: null };
	if (entry.kind === "state") return { value: entry.content ?? {}, malformed: null };
	if (entry.kind !== "file" || typeof entry.content !== "string") return { value: {}, malformed: `${source} is not a readable file.` };
	try {
		if (source.endsWith(".json")) return { value: JSON.parse(entry.content), malformed: null };
		return { value: parseCanonicalConfigYaml(entry.content), malformed: null };
	} catch (error) {
		return { value: {}, malformed: `${source}: ${error.message}` };
	}
}

function flatten(value, prefix = "", result = {}) {
	for (const [key, child] of Object.entries(value ?? {})) {
		const target = prefix ? `${prefix}.${key}` : key;
		if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, target, result);
		else result[target] = child;
	}
	return result;
}

function valueAt(value, ...paths) {
	for (const path of paths) {
		let cursor = value;
		for (const part of path.split(".")) cursor = cursor?.[part];
		if (cursor !== undefined) return cursor;
	}
	return undefined;
}

function setIfAbsent(target, path, value, changes, source) {
	if (value === undefined || value === null) return;
	const parts = path.split(".");
	let cursor = target;
	for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
	const key = parts.at(-1);
	if (cursor[key] !== undefined) return;
	cursor[key] = value;
	changes.push({ field: path, value, source });
}

function fullEffect(order, target, kind, classification, reason, entry, after) {
	const before = entry?.content ?? null;
	const renderedAfter = kind === "state" && after !== undefined ? JSON.stringify(after) : (after ?? before);
	return {
		order,
		target,
		kind,
		classification,
		reason,
		before,
		after: renderedAfter,
		diff: classification === "PRESERVE" || classification === "NO-OP" ? "unchanged" : `${JSON.stringify(before)} -> ${JSON.stringify(renderedAfter ?? null)}`,
		fingerprint: entry?.fingerprint ?? null,
	};
}

function contextShape(agentsContent, claudeContent) {
	const normalizedClaude = (claudeContent ?? "").replaceAll("\r\n", "\n").trim();
	const thinClaude = normalizedClaude === "@AGENTS.md" || /^<!-- Canonical project context[^\n]*-->\n@AGENTS\.md$/.test(normalizedClaude);
	const fatClaude = Boolean(normalizedClaude) && !thinClaude;
	const authoredAgents = Boolean((agentsContent ?? "").trim());
	return { thinClaude, fatClaude, authoredAgents, conflicting: fatClaude && authoredAgents };
}

function changelogMode(project, docs, resolutions, conflicts) {
	if (resolutions["changelog.update_mode"] !== undefined) return resolutions["changelog.update_mode"];
	const pullRequest = valueAt(project, "changelog.auto_update");
	const perCommit = valueAt(docs, "docs.auto.changelog_per_commit", "auto.changelog_per_commit");
	if (pullRequest === true && perCommit === true) {
		conflicts.push({ field: "changelog.update_mode", classification: "ambiguous", sources: [PROJECT_CONFIG, DOCS_CONFIG] });
		return undefined;
	}
	if (pullRequest === true) return "pull_request";
	if (perCommit === true) return "commit";
	if (pullRequest === false && perCommit === false) return "disabled";
	if (pullRequest === false && perCommit === undefined) return "disabled";
	if (pullRequest === undefined && perCommit === false && Object.keys(docs).length > 0) {
		conflicts.push({ field: "changelog.update_mode", classification: "insufficient-evidence", sources: [DOCS_CONFIG] });
	}
	return undefined;
}

export function discoverDocsRuntimeState(snapshots, machine = {}) {
	const entries = Object.fromEntries(Object.entries(snapshots ?? {}).map(([target, value]) => [target, normalizeEntry(value)]));
	const docsParsed = parseObject(entries[DOCS_CONFIG] ?? normalizeEntry(null), DOCS_CONFIG);
	const projectParsed = parseObject(entries[PROJECT_CONFIG] ?? normalizeEntry(null), PROJECT_CONFIG);
	const settingsParsed = parseObject(entries[REPO_SETTINGS] ?? normalizeEntry(null), REPO_SETTINGS);
	const unknownDocsFields = Object.keys(flatten(docsParsed.value)).filter(key => !KNOWN_DOCS_LEAVES.has(key));
	const context = contextShape(entries["AGENTS.md"]?.content, entries["CLAUDE.md"]?.content);
	const settingsText = entries[REPO_SETTINGS]?.content ?? "";
	const runtimeOwned = typeof settingsText === "string" && /ws[^\n]*(session|guard|dashboard)|dangerous[-_ ]git/i.test(settingsText);
	const runtimeCustomized = runtimeOwned && !settingsParsed.malformed && Object.keys(settingsParsed.value ?? {}).some(key => key !== "hooks");
	return {
		entries,
		docs: docsParsed.value,
		project: projectParsed.value,
		settings: settingsParsed.value,
		malformed: [docsParsed.malformed, projectParsed.malformed, settingsParsed.malformed].filter(Boolean),
		unknownDocsFields,
		context,
		runtime: {
			sessionDiscipline: machine.sessionDiscipline === true,
			dangerousGitGuard: machine.dangerousGitGuard === true,
			repositoryOwned: runtimeOwned,
			customized: runtimeCustomized,
		},
	};
}

export function planDocsRuntimeMigration(discovery, currentCanonical = {}, resolutions = {}) {
	const patch = structuredClone(currentCanonical ?? {});
	const changes = [];
	const conflicts = [];
	const blockers = [];
	const effects = [];
	for (const malformed of discovery.malformed) blockers.push(`Malformed legacy source: ${malformed}`);
	if (discovery.unknownDocsFields.length > 0) blockers.push(`Unknown legacy documentation fields: ${discovery.unknownDocsFields.join(", ")}.`);

	const docs = discovery.docs;
	const project = discovery.project;
	const hasDocsPolicy = Object.keys(flatten(docs)).length > 0 || Object.keys(resolutions).some(field => field.startsWith("docs."));
	if (hasDocsPolicy) {
		setIfAbsent(patch, "docs.user_track", resolutions["docs.user_track"] ?? valueAt(docs, "docs.user_track") ?? "docs", changes, DOCS_CONFIG);
		setIfAbsent(patch, "docs.dev_track", resolutions["docs.dev_track"] ?? valueAt(docs, "docs.dev_track") ?? "dev-docs", changes, DOCS_CONFIG);
		setIfAbsent(patch, "docs.default_audience", resolutions["docs.default_audience"] ?? valueAt(docs, "docs.default_audience") ?? "ask", changes, DOCS_CONFIG);
		setIfAbsent(patch, "docs.default_scope", resolutions["docs.default_scope"] ?? valueAt(docs, "docs.default_scope") ?? "repo", changes, DOCS_CONFIG);
		setIfAbsent(patch, "docs.adr_for_arch_changes", resolutions["docs.adr_for_arch_changes"] ?? valueAt(docs, "docs.auto.adr_for_arch_changes", "auto.adr_for_arch_changes") ?? true, changes, DOCS_CONFIG);
	}
	setIfAbsent(patch, "changelog.path", resolutions["changelog.path"] ?? valueAt(project, "changelog.path") ?? "CHANGELOG.md", changes, PROJECT_CONFIG);
	const projectSkip = valueAt(project, "changelog.skip_types");
	const docsSkip = valueAt(docs, "docs.changelog.skip_types");
	if (patch.changelog?.skip_types === undefined) {
		if (resolutions["changelog.skip_types"] !== undefined) setIfAbsent(patch, "changelog.skip_types", resolutions["changelog.skip_types"], changes, "explicit resolution");
		else if (projectSkip !== undefined && docsSkip !== undefined && JSON.stringify(projectSkip) !== JSON.stringify(docsSkip)) conflicts.push({ field: "changelog.skip_types", classification: "ambiguous", sources: [PROJECT_CONFIG, DOCS_CONFIG] });
		else setIfAbsent(patch, "changelog.skip_types", projectSkip ?? docsSkip ?? ["docs", "chore", "test", "style", "build", "ci"], changes, projectSkip !== undefined ? PROJECT_CONFIG : DOCS_CONFIG);
	}
	setIfAbsent(patch, "changelog.update_mode", changelogMode(project, docs, resolutions, conflicts) ?? "pull_request", changes, "legacy changelog truth table");
	setIfAbsent(patch, "runtime.session_discipline", "required", changes, "active harness contract");
	setIfAbsent(patch, "runtime.dangerous_git_guard", discovery.runtime.dangerousGitGuard ? "enabled" : "disabled", changes, "active harness contract");

	if (discovery.context.conflicting && !resolutions["context.source"]) conflicts.push({ field: "context.source", classification: "ambiguous", sources: ["AGENTS.md", "CLAUDE.md"] });
	if (discovery.context.fatClaude) effects.push(fullEffect(45, "CLAUDE.md", "file", "PRESERVE", "Preserve fat context until its reviewed diff is accepted into AGENTS.md.", discovery.entries["CLAUDE.md"]));
	if (discovery.context.authoredAgents) effects.push(fullEffect(45, "AGENTS.md", "file", "PRESERVE", "Byte-preserve authored canonical context.", discovery.entries["AGENTS.md"]));
	if (discovery.runtime.repositoryOwned) effects.push(fullEffect(50, REPO_SETTINGS, "file", discovery.runtime.customized ? "PRESERVE" : "UPDATE", discovery.runtime.customized ? "Preserve customized runtime instructions for reviewed extraction." : "Remove exact redundant runtime delivery only after active harness verification.", discovery.entries[REPO_SETTINGS]));

	for (const change of changes) effects.push(fullEffect(20, `config:${change.field}`, "state", "UPDATE", `Migrate ${change.field} from ${change.source}.`, null, change.value));
	for (const conflict of conflicts) {
		blockers.push(`Explicit resolution required for ${conflict.field}.`);
		effects.push(fullEffect(10, `config:${conflict.field}`, "state", "BLOCKING_CONFLICT", `Resolve ${conflict.classification} legacy sources: ${conflict.sources.join(", ")}.`, null));
	}
	if ((discovery.entries[DOCS_CONFIG]?.kind ?? "missing") !== "missing") effects.push(fullEffect(900, DOCS_CONFIG, "file", blockers.length === 0 ? "UPDATE" : "PRESERVE", blockers.length === 0 ? "Delete exact repository-local legacy policy only after canonical and semantic read-back." : "Preserve legacy policy while migration is blocked.", discovery.entries[DOCS_CONFIG], blockers.length === 0 ? null : discovery.entries[DOCS_CONFIG].content));
	effects.sort((left, right) => left.order - right.order || left.target.localeCompare(right.target));
	return { patch, conflicts, blockers, effects };
}

export function checkDocsRuntimeCleanupEligibility(plan, canonicalValidation, readiness) {
	const valid = canonicalValidation?.status === "valid" || canonicalValidation?.isValid === true;
	const blockers = [];
	if (!valid) blockers.push("Canonical configuration is invalid.");
	if (!readiness?.docsReady) blockers.push("Documentation policy and artifacts are not verified.");
	if (!readiness?.contextReady) blockers.push("Canonical context is not verified.");
	if (!readiness?.runtimeReady) blockers.push("Active runtime delivery is not verified.");
	if (plan?.blockers?.length) blockers.push(...plan.blockers);
	return { eligible: blockers.length === 0, blockers };
}
