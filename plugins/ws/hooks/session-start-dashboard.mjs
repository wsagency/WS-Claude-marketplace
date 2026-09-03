#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	CANONICAL_POLICY_PATH,
	inspectCanonicalCapability,
} from "../skills/ws-project-bootstrap/consumer.mjs";

const JIRA_TIMEOUT_MS = 3000;

export function createSessionStartContext({
	root = process.cwd(),
	jiraAvailable = false,
	branch = "",
} = {}) {
	const inspection = inspectCanonicalCapability({
		root,
		capability: "dashboard",
		snapshot: { integrations: { jira: jiraAvailable } },
	});

	if (inspection.config === null) {
		const canonicalPresent = existsSync(path.join(root, CANONICAL_POLICY_PATH));
		if (!canonicalPresent && inspection.detectedLegacySources.length === 0) return "";
		return `[ws-marketplace] ${inspection.blockers[0]}`;
	}
	if (inspection.operation?.mode === "disabled") return "";
	if (!jiraAvailable) return "";
	if (!inspection.ready) return `[ws-marketplace] ${inspection.blockers[0]}`;

	const project = inspection.config.jira.project;
	const ticket = /^[A-Z]+-[0-9]+/.exec(branch)?.[0];
	return `[ws-marketplace] Canonical Jira assignments are enabled for project ${project}.
Current branch: ${branch || "(none)"}${ticket ? `  · ticket: ${ticket}` : ""}

If the user does not immediately give a task, run /ws-status to render current assignments and suggest the next item.
Jira-aware commits: /ws-commit. PR flow: /ws-commit pr.
`;
}

function integrationAvailable() {
	return spawnSync("jira", ["me"], {
		encoding: "utf8",
		stdio: "ignore",
		timeout: JIRA_TIMEOUT_MS,
	}).status === 0;
}

function currentBranch(root) {
	const result = spawnSync("git", ["branch", "--show-current"], {
		cwd: root,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	return result.status === 0 ? result.stdout.trim() : "";
}

function main() {
	try {
		const root = process.cwd();
		process.stdout.write(createSessionStartContext({
			root,
			jiraAvailable: integrationAvailable(),
			branch: currentBranch(root),
		}));
	} catch {
		// Session-start context is advisory and must never block startup.
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
