import { readFileSync } from "node:fs";
import { migrationEffect, normalizeMigrationEntry, setIfAbsent } from "./migration-primitives.mjs";
import { getAdapterContent } from "./trackers.mjs";

const LEGACY_ROOT = new URL("./fixtures/pre-5-engineering/", import.meta.url);
const TRACKER_TEMPLATES = Object.freeze({
	local: readFileSync(new URL("issue-tracker-local.md", LEGACY_ROOT), "utf8"),
	github: readFileSync(new URL("issue-tracker-github.md", LEGACY_ROOT), "utf8"),
	gitlab: readFileSync(new URL("issue-tracker-gitlab.md", LEGACY_ROOT), "utf8"),
	jira: readFileSync(new URL("issue-tracker-jira.md", LEGACY_ROOT), "utf8"),
	local_jira: readFileSync(new URL("issue-tracker-local-jira.md", LEGACY_ROOT), "utf8"),
});
const TRIAGE_TEMPLATE = readFileSync(new URL("triage-labels.md", LEGACY_ROOT), "utf8");
const DOMAIN_TEMPLATE = readFileSync(new URL("domain.md", LEGACY_ROOT), "utf8");
const CURRENT_TRIAGE_TEMPLATE = readFileSync(new URL("./templates/triage-labels.md", import.meta.url), "utf8");
const CURRENT_DOMAIN_TEMPLATE = readFileSync(new URL("./templates/domain.md", import.meta.url), "utf8");
const MANAGED_START = "<!-- WS-AGENT-SKILLS:START -->";
const MANAGED_END = "<!-- WS-AGENT-SKILLS:END -->";

function placeholderPattern(template) {
	const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^${escaped.replaceAll("<PROJECT-KEY>", "([A-Z][A-Z0-9_-]*)")}$`);
}

function classifyTracker(content) {
	for (const [mode, template] of Object.entries(TRACKER_TEMPLATES)) {
		const match = content.match(placeholderPattern(template));
		if (match) {
			const primary = mode === "local_jira" ? "local" : mode;
			return { recognized: true, generated: true, primary, sync: mode === "local_jira" ? "all_local_tickets" : "disabled", jiraProject: match[1] };
		}
	}
	const markers = [
		["Local Markdown", "local"],
		["GitHub", "github"],
		["GitLab", "gitlab"],
		["Jira", "jira"],
	].filter(([marker]) => content.includes(marker));
	const primaryValues = [...new Set(markers.map(([, primary]) => primary))];
	if (primaryValues.length === 1) {
		const localJira = primaryValues[0] === "local" && content.includes("Jira");
		const project = content.match(/\bproject\s+(?:key\s+)?`?([A-Z][A-Z0-9_-]+)`?/i)?.[1]?.toUpperCase();
		return { recognized: true, generated: false, primary: primaryValues[0], sync: localJira ? "all_local_tickets" : "disabled", jiraProject: project };
	}
	return { recognized: false, generated: false };
}

function triageLabels(content) {
	const aliases = {
		"needs-triage": "needs_triage",
		"needs-info": "needs_info",
		"ready-for-agent": "ready_for_agent",
		"ready-for-human": "ready_for_human",
		wontfix: "wontfix",
	};
	const labels = {};
	for (const line of content.split("\n")) {
		const table = line.match(/^\|\s*`?(needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix)`?\s*\|\s*`?([^`|]+?)`?\s*\|/);
		const list = line.match(/^\s*-\s*(needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix):\s*`([^`]+)`/);
		const match = table ?? list;
		if (match) labels[aliases[match[1]]] = match[2].trim();
	}
	return Object.keys(labels).length === 5 ? labels : null;
}

function isManagedAdapter(target, content) {
	if (!content) return false;
	const markers = {
		"dev-docs/agents/issue-tracker.md": "issue-tracker",
		"dev-docs/agents/triage-labels.md": "triage-labels",
		"dev-docs/agents/domain.md": "domain",
	};
	const marker = markers[target];
	if (!marker) return false;
	return content.includes(`<!-- WS-MANAGED:${marker}:START -->`) && content.includes(`<!-- WS-MANAGED:${marker}:END -->`);
}

function extractContextBlock(content) {
	if (!content) return null;
	const markedStart = content.indexOf(MANAGED_START);
	const markedEnd = content.indexOf(MANAGED_END);
	if (markedStart >= 0 && markedEnd > markedStart) return content.slice(markedStart, markedEnd + MANAGED_END.length);
	const heading = content.search(/^## Agent skills\s*$/m);
	if (heading < 0) return null;
	const remaining = content.slice(heading + 1);
	const nextHeading = remaining.search(/^## (?!#)/m);
	return nextHeading < 0 ? content.slice(heading).trimEnd() : content.slice(heading, heading + 1 + nextHeading).trimEnd();
}


export function discoverEngineeringState(snapshots) {
	const entries = Object.fromEntries(
		Object.entries(snapshots ?? {})
			.filter(([target]) => target !== "activeLocalWork")
			.map(([target, value]) => [target, normalizeMigrationEntry(value)]),
	);
	const trackerEntry = entries["dev-docs/agents/issue-tracker.md"] ?? normalizeMigrationEntry(null);
	const triageEntry = entries["dev-docs/agents/triage-labels.md"] ?? normalizeMigrationEntry(null);
	const domainEntry = entries["dev-docs/agents/domain.md"] ?? normalizeMigrationEntry(null);
	const agentsEntry = entries["AGENTS.md"] ?? normalizeMigrationEntry(null);
	const claudeEntry = entries["CLAUDE.md"] ?? normalizeMigrationEntry(null);
	const contextEntry = entries["CONTEXT.md"] ?? normalizeMigrationEntry(null);
	const contextMapEntry = entries["CONTEXT-MAP.md"] ?? normalizeMigrationEntry(null);
	const tracker = trackerEntry.kind === "file" ? { ...classifyTracker(trackerEntry.content), managed: isManagedAdapter("dev-docs/agents/issue-tracker.md", trackerEntry.content) } : null;
	const labels = triageEntry.kind === "file" ? triageLabels(triageEntry.content) : null;
	const agentsBlock = extractContextBlock(agentsEntry.content);
	const claudeBlock = extractContextBlock(claudeEntry.content);
	const contextConflict = agentsBlock && claudeBlock && agentsBlock !== claudeBlock;

	return {
		hasEngineeringState: [trackerEntry, triageEntry, domainEntry, agentsEntry, claudeEntry, contextEntry, contextMapEntry].some(entry => entry.kind !== "missing"),
		entries,
		tracker,
		triage: triageEntry.kind === "file" ? { generated: triageEntry.content === TRIAGE_TEMPLATE, managed: isManagedAdapter("dev-docs/agents/triage-labels.md", triageEntry.content), labels } : null,
		domain: domainEntry.kind === "file" ? { generated: domainEntry.content === DOMAIN_TEMPLATE, managed: isManagedAdapter("dev-docs/agents/domain.md", domainEntry.content), layout: contextMapEntry.kind === "file" ? "multi_context" : contextEntry.kind === "file" ? "single_context" : undefined } : null,
		context: { agentsBlock, claudeBlock, conflict: Boolean(contextConflict) },
		activeLocalWork: Boolean(snapshots?.activeLocalWork),
	};
}

export function planEngineeringMigration(discovery, currentCanonical = {}, resolutions = {}) {
	const patch = structuredClone(currentCanonical ?? {});
	const changes = [];
	const conflicts = [];
	const suggestions = [];
	const blockers = [];
	const effects = [];

	if (!discovery.hasEngineeringState) return { patch, effects, conflicts, suggestions, blockers };
	if (discovery.tracker && !discovery.tracker.managed) {
		if (!discovery.tracker.recognized) {
			conflicts.push({ field: "tracker.primary", source: "dev-docs/agents/issue-tracker.md", classification: "unsupported-custom" });
			blockers.push("Unsupported custom tracker requires an explicit canonical tracker choice.");
		} else {
			setIfAbsent(patch, "tracker.primary", resolutions["tracker.primary"] ?? discovery.tracker.primary, changes, "dev-docs/agents/issue-tracker.md");
			setIfAbsent(patch, "tracker.pull_requests", resolutions["tracker.pull_requests"] ?? "ignore", changes, "dev-docs/agents/issue-tracker.md");
			if (discovery.tracker.jiraProject) {
				setIfAbsent(patch, "jira.project", resolutions["jira.project"] ?? discovery.tracker.jiraProject, changes, "dev-docs/agents/issue-tracker.md");
				setIfAbsent(patch, "jira.default_issue_type", resolutions["jira.default_issue_type"] ?? "Task", changes, "dev-docs/agents/issue-tracker.md");
				setIfAbsent(patch, "jira.sync", discovery.tracker.sync, changes, "dev-docs/agents/issue-tracker.md");
			}
		}
		const resolution = resolutions["adapter.tracker"];
		const validResolution = resolution === undefined || resolution === "preserve" || resolution === "replace";
		if (!validResolution || (!discovery.tracker.generated && resolution === undefined)) {
			blockers.push(validResolution
				? "Customized tracker adapter requires an explicit preserve or replace resolution."
				: `Invalid tracker adapter resolution: ${resolution}. Choose preserve or replace.`);
			conflicts.push({ field: "adapter.tracker", source: "dev-docs/agents/issue-tracker.md", classification: "replace-or-preserve" });
		}
		const replace = validResolution && (resolution === "replace" || (discovery.tracker.generated && resolution !== "preserve"));
		const trackerEntry = discovery.entries["dev-docs/agents/issue-tracker.md"];
		const adapterPrimary = patch.tracker?.primary ?? discovery.tracker.primary;
		effects.push(migrationEffect(40, "dev-docs/agents/issue-tracker.md", "file", replace ? "UPDATE" : "PRESERVE", replace ? "Replace adapter after canonical read-back." : "Preserve customized tracker semantics for reviewed merge.", trackerEntry, replace ? getAdapterContent(adapterPrimary) : trackerEntry.content));
	}
	if (discovery.triage && !discovery.triage.managed) {
		if (!discovery.triage.labels) {
			blockers.push("Triage adapter does not contain a complete five-role mapping.");
			conflicts.push({ field: "triage.labels", source: "dev-docs/agents/triage-labels.md", classification: "lossy" });
		} else setIfAbsent(patch, "triage.labels", resolutions["triage.labels"] ?? discovery.triage.labels, changes, "dev-docs/agents/triage-labels.md");
		const resolution = resolutions["adapter.triage"];
		const validResolution = resolution === undefined || resolution === "preserve" || resolution === "replace";
		if (!validResolution || (!discovery.triage.generated && resolution === undefined)) {
			blockers.push(validResolution
				? "Customized triage adapter requires an explicit preserve or replace resolution."
				: `Invalid triage adapter resolution: ${resolution}. Choose preserve or replace.`);
			conflicts.push({ field: "adapter.triage", source: "dev-docs/agents/triage-labels.md", classification: "replace-or-preserve" });
		}
		const replace = validResolution && (resolution === "replace" || (discovery.triage.generated && resolution !== "preserve"));
		const triageEntry = discovery.entries["dev-docs/agents/triage-labels.md"];
		effects.push(migrationEffect(41, "dev-docs/agents/triage-labels.md", "file", replace ? "UPDATE" : "PRESERVE", replace ? "Replace triage adapter after canonical read-back." : "Preserve customized triage labels.", triageEntry, replace ? CURRENT_TRIAGE_TEMPLATE : triageEntry.content));
	}
	if (discovery.domain && !discovery.domain.managed) {
		if (discovery.domain.layout) setIfAbsent(patch, "domain.layout", resolutions["domain.layout"] ?? discovery.domain.layout, changes, discovery.domain.layout === "multi_context" ? "CONTEXT-MAP.md" : "CONTEXT.md");
		else suggestions.push({ field: "domain.layout", source: "dev-docs/agents/domain.md", classification: "choice-required" });
		const resolution = resolutions["adapter.domain"];
		const validResolution = resolution === undefined || resolution === "preserve" || resolution === "replace";
		if (!validResolution || (!discovery.domain.generated && resolution === undefined)) {
			blockers.push(validResolution
				? "Customized domain adapter requires an explicit preserve or replace resolution."
				: `Invalid domain adapter resolution: ${resolution}. Choose preserve or replace.`);
			conflicts.push({ field: "adapter.domain", source: "dev-docs/agents/domain.md", classification: "replace-or-preserve" });
		}
		const replace = validResolution && (resolution === "replace" || (discovery.domain.generated && resolution !== "preserve"));
		const domainEntry = discovery.entries["dev-docs/agents/domain.md"];
		effects.push(migrationEffect(42, "dev-docs/agents/domain.md", "file", replace ? "UPDATE" : "PRESERVE", replace ? "Replace domain adapter after canonical read-back." : "Preserve customized domain guidance.", domainEntry, replace ? CURRENT_DOMAIN_TEMPLATE : domainEntry.content));
	}
	if (discovery.context.conflict && !resolutions["context.source"]) {
		blockers.push("Conflicting authored Agent skills blocks require an explicit merge choice.");
		conflicts.push({ field: "context.source", sources: ["AGENTS.md", "CLAUDE.md"], classification: "ambiguous" });
	}
	for (const target of ["AGENTS.md", "CLAUDE.md"]) {
		const entry = discovery.entries[target];
		if (entry?.kind === "file") effects.push(migrationEffect(45, target, "file", "PRESERVE", "Byte-preserve authored context outside reviewed managed ranges.", entry));
	}
	for (const change of changes) effects.push(migrationEffect(20, `config:${change.field}`, "state", "UPDATE", `Migrate deterministic repository-local value from ${change.source}.`, null, change.value));
	for (const conflict of conflicts) effects.push(migrationEffect(10, `config:${conflict.field}`, "state", "BLOCKING_CONFLICT", `Resolve ${conflict.classification} legacy source ${conflict.source ?? conflict.sources?.join(", ")}.`, null));
	effects.sort((left, right) => left.order - right.order || left.target.localeCompare(right.target));
	return { patch, effects, conflicts, suggestions, blockers };
}

export function checkEngineeringCleanupEligibility(plan, canonicalValidation, readiness) {
	const valid = canonicalValidation?.status === "valid" || canonicalValidation?.isValid === true;
	const blockers = [];
	if (!valid) blockers.push("Canonical configuration is invalid.");
	if (!readiness?.engineeringReady) blockers.push("Engineering adapters are not verified.");
	if (!readiness?.contextReady) blockers.push("Shared context is not verified.");
	if (plan?.blockers?.length) blockers.push(...plan.blockers);
	return { eligible: blockers.length === 0, blockers };
}
