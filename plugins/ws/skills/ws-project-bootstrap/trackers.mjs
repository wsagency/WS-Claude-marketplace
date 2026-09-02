import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = dirname(fileURLToPath(import.meta.url));
const MISSING_FINGERPRINT = null;

export function parseOriginIdentity(originUrl) {
	if (!originUrl || typeof originUrl !== "string") return null;
	const source = originUrl.trim();
	let url;
	try {
		const scp = !source.includes("://") && source.match(/^(?:[^@\s]+@)?([^:/\s]+):([^?#]+)$/);
		if (scp) url = new URL(`ssh://${scp[1]}/${scp[2]}`);
		else url = new URL(source);
	} catch {
		return null;
	}
	if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol) || url.password || url.search || url.hash) return null;

	const host = url.hostname.toLowerCase();
	const provider = host === "github.com" ? "github" : host === "gitlab.com" ? "gitlab" : null;
	if (!provider) return null;

	let pathname;
	try {
		pathname = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "");
	} catch {
		return null;
	}
	if (pathname.endsWith(".git")) pathname = pathname.slice(0, -4);
	const parts = pathname.split("/");
	if (parts.length < 2 || parts.some(part => part === "" || part === "." || part === "..")) return null;
	return {
		provider,
		host,
		owner: parts[0],
		repo: parts.slice(1).join("/"),
	};
}

export function discoverProviders(originUrl) {
	const available = ["local"];
	const identity = parseOriginIdentity(originUrl);
	if (identity) {
		available.push(identity.provider);
	}
	return available;
}

export class FakeJiraAdapter {
	constructor(options = {}) {
		this.missingBinary = options.missingBinary || false;
		this.authFailed = options.authFailed || false;
		this.projectMissing = options.projectMissing || false;
	}

	async checkCapability() {
		if (this.missingBinary) return { ready: false, reason: "jira-cli binary not found" };
		if (this.authFailed) return { ready: false, reason: "jira-cli authentication failed" };
		return { ready: true };
	}

	async verifyProject(projectKey) {
		if (this.projectMissing) return { ready: false, reason: `Project ${projectKey} not found or inaccessible` };
		return { ready: true };
	}
}

export async function validateJiraCapability(adapter, projectKey) {
	const cap = await adapter.checkCapability();
	if (!cap.ready) return cap;

	const proj = await adapter.verifyProject(projectKey);
	if (!proj.ready) return proj;

	return { ready: true };
}

export function getAdapterContent(primaryTracker) {
	const name = primaryTracker === "local" ? "issue-tracker.md" : `${primaryTracker}-adapter.md`;
	return readFileSync(join(SKILL_ROOT, "templates", name), "utf8");
}

function stateEffect(order, target, classification, reason) {
	return {
		order,
		target,
		kind: "state",
		classification,
		reason,
		diff: "",
		fingerprint: null,
	};
}

export function planTrackerEffects(config, discovery, jiraValidation, capabilities) {
	const effects = [];
	const primary = config?.tracker?.primary;
	const uiDashboard = config?.ui?.session_start_dashboard;
	const commitJira = config?.commit?.jira?.actions;

	if ((uiDashboard === "jira_assignments" || commitJira === "ask" || commitJira === "always") && !config?.jira) {
		effects.push(stateEffect(90, "configuration:jira", "BLOCKING_CONFLICT", "Jira-aware configuration requires Jira binding"));
	}
	if (!primary) return effects;

	if (primary === "jira") {
		if (!jiraValidation?.ready) {
			effects.push(stateEffect(91, "integration:jira", "BLOCKING_CONFLICT", jiraValidation?.reason || "Jira capability not verified"));
		}
		if (config.jira?.sync !== "disabled") {
			effects.push(stateEffect(92, "configuration:jira.sync", "BLOCKING_CONFLICT", "Jira primary tracker requires Jira sync to be disabled"));
		}
	}

	const providers = discoverProviders(discovery?.git?.origin);
	if (primary === "github" || primary === "gitlab") {
		if (!providers.includes(primary)) {
			effects.push(stateEffect(93, `integration:${primary}`, "BLOCKING_CONFLICT", `${primary} selected as primary but repository origin does not match`));
		} else if (primary === "github" && !capabilities?.ghCli) {
			effects.push(stateEffect(94, "integration:github", "BLOCKING_CONFLICT", "gh CLI is not available"));
		} else if (primary === "gitlab" && !capabilities?.glabCli) {
			effects.push(stateEffect(95, "integration:gitlab", "BLOCKING_CONFLICT", "glab CLI is not available"));
		}
	}
	if (effects.some(effect => effect.classification === "BLOCKING_CONFLICT")) return effects;

	const target = "dev-docs/agents/issue-tracker.md";
	const desiredContent = getAdapterContent(primary);
	const entry = discovery?.entries?.[target];
	let classification = "CREATE";
	let reason = `Write ${primary} tracker adapter`;
	if (entry?.kind === "file") {
		classification = entry.content === desiredContent ? "NO-OP" : "UPDATE";
		reason = entry.content === desiredContent ? "Tracker adapter aligned" : "Update tracker adapter";
	} else if (entry && entry.kind !== "missing") {
		return [stateEffect(96, target, "BLOCKING_CONFLICT", "A non-file entry occupies the tracker adapter path")];
	}

	effects.push({
		order: 100,
		target,
		kind: "file",
		classification,
		reason,
		before: entry?.content,
		after: desiredContent,
		diff: "",
		fingerprint: entry?.fingerprint ?? MISSING_FINGERPRINT,
	});
	return effects;
}

export function checkTrackerReadiness(config, discovery, jiraValidation, capabilities) {
	const primary = config?.tracker?.primary;
	if (!primary) return { trackerReady: false, blockers: ["No primary tracker configured"] };

	const blockers = [];
	if (primary === "jira" && !jiraValidation?.ready) {
		blockers.push(jiraValidation?.reason || "Jira capability not verified");
	}

	if (primary === "jira" && config.jira?.sync !== "disabled") {
		blockers.push("Jira primary tracker requires Jira sync to be disabled");
	}

	const providers = discoverProviders(discovery?.git?.origin);
	if ((primary === "github" || primary === "gitlab") && !providers.includes(primary)) {
		blockers.push(`${primary} selected as primary but repository origin does not match`);
	} else if (primary === "github" && !capabilities?.ghCli) {
		blockers.push("gh CLI is not available");
	} else if (primary === "gitlab" && !capabilities?.glabCli) {
		blockers.push("glab CLI is not available");
	}

	return {
		trackerReady: blockers.length === 0,
		blockers,
	};
}
