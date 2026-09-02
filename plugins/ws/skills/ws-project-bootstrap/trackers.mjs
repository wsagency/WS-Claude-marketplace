import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = dirname(fileURLToPath(import.meta.url));
const MISSING_FINGERPRINT = null;

export function parseOriginIdentity(originUrl) {
	if (!originUrl || typeof originUrl !== "string") return null;

	let url;
	try {
		if (originUrl.startsWith("git@")) {
			const match = originUrl.match(/^git@([^:]+):(.+)\.git$/);
			if (match) {
				const [, host, path] = match;
				url = new URL(`https://${host}/${path}`);
			} else {
				return null;
			}
		} else if (originUrl.startsWith("https://") || originUrl.startsWith("http://")) {
			url = new URL(originUrl);
		} else {
			return null;
		}
	} catch {
		return null;
	}

	const host = url.hostname;
	let provider = null;
	if (host === "github.com") {
		provider = "github";
	} else if (host === "gitlab.com") {
		provider = "gitlab";
	}

	if (!provider) return null;

	let pathname = url.pathname.replace(/^\//, "");
	if (pathname.endsWith(".git")) {
		pathname = pathname.slice(0, -4);
	}
	const parts = pathname.split("/");
	if (parts.length < 2) return null;

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

export function planTrackerEffects(config, discovery, jiraValidation, capabilities) {
	const effects = [];
	const primary = config?.tracker?.primary;
	const uiDashboard = config?.ui?.session_start_dashboard;
	const commitJira = config?.commit?.jira?.actions;

	let hasBlocker = false;

	if ((uiDashboard === "jira_assignments" || commitJira === "ask" || commitJira === "always") && !config?.jira) {
		effects.push({
			classification: "BLOCKING_CONFLICT",
			reason: "Jira-aware configuration requires Jira binding",
		});
		hasBlocker = true;
	}

	if (!primary) return effects;

	if (primary === "jira") {
		if (!jiraValidation?.ready) {
			effects.push({
				classification: "BLOCKING_CONFLICT",
				reason: jiraValidation?.reason || "Jira capability not verified",
			});
			hasBlocker = true;
		}

		if (config.jira?.sync !== "disabled") {
			effects.push({
				classification: "BLOCKING_CONFLICT",
				reason: "Jira primary tracker requires Jira sync to be disabled",
			});
			hasBlocker = true;
		}
	}

	const providers = discoverProviders(discovery?.git?.origin);
	if (primary === "github" || primary === "gitlab") {
		if (!providers.includes(primary)) {
			effects.push({
				classification: "BLOCKING_CONFLICT",
				reason: `${primary} selected as primary but repository origin does not match`,
			});
			hasBlocker = true;
		} else if (primary === "github" && !capabilities?.ghCli) {
			effects.push({
				classification: "BLOCKING_CONFLICT",
				reason: "gh CLI is not available",
			});
			hasBlocker = true;
		} else if (primary === "gitlab" && !capabilities?.glabCli) {
			effects.push({
				classification: "BLOCKING_CONFLICT",
				reason: "glab CLI is not available",
			});
			hasBlocker = true;
		}
	}

	if (!hasBlocker) {
		const target = "dev-docs/agents/issue-tracker.md";
		const desiredContent = getAdapterContent(primary);
		const entry = discovery?.entries?.[target];
		let classification = "CREATE";
		let reason = `Write ${primary} tracker adapter`;

		if (entry?.kind === "file") {
			if (entry.content === desiredContent) {
				classification = "NO-OP";
				reason = `Tracker adapter aligned`;
			} else {
				classification = "UPDATE";
				reason = `Update tracker adapter`;
			}
		}

		effects.push({
			order: 10,
			target,
			kind: "file",
			classification,
			reason,
			before: entry?.content,
			after: desiredContent,
			diff: "", // renderDiff skipped for pure functions, left for transaction.mjs to handle if needed
			fingerprint: entry?.fingerprint || MISSING_FINGERPRINT
		});
	}

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
