#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { inspectCanonicalPolicy } from "../skills/ws-docs-bootstrap/policy.mjs";

function allow() {
	return { blocked: false, output: "" };
}

function preToolBlock(reason) {
	return {
		blocked: true,
		output: JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "deny",
				permissionDecisionReason: reason,
			},
		}),
	};
}

function stopBlock(reason) {
	return { blocked: true, output: JSON.stringify({ decision: "block", reason }, null, 2) };
}

function normalizedTrack(track) {
	return track.endsWith("/") ? track : `${track}/`;
}

function isDocumentationPath(file, config) {
	if (/\.md$/i.test(file)) return true;
	if (file === config.changelog.path) return true;
	if (!config.docs) return false;
	return file.startsWith(normalizedTrack(config.docs.user_track)) || file.startsWith(normalizedTrack(config.docs.dev_track));
}

function commitType(command) {
	const message = command.match(/(?:^|\s)-m(?:=|\s+)(?:"([^"]*)"|'([^']*)'|(\S+))/s);
	let subject = message?.[1] ?? message?.[2] ?? message?.[3] ?? "";
	if (!subject && command.includes("<<")) {
		const lines = command.split(/\\n|\n/);
		const marker = lines.findIndex(line => line.includes("<<"));
		subject = marker >= 0 ? (lines[marker + 1] ?? "") : "";
	}
	return subject.match(/^([a-z]+)(?:\([^)]*\))?!?:/)?.[1] ?? "";
}

function policyFailure(inspection) {
	return inspection.status === "blocked" ? inspection.blockers.map(blocker => blocker.message).join(" ") : null;
}

export function evaluatePreCommit({ event, inspection, changedFiles }) {
	if (event?.tool_name !== "Bash") return allow();
	const command = event?.tool_input?.command ?? event?.command ?? "";
	if (!/(?:^|[;&|]\s*|\s)git\s+commit(?:\s|$)/.test(command)) return allow();
	if (/(?:^|\s)--(?:amend|allow-empty)(?:\s|$)/.test(command)) return allow();
	const failure = policyFailure(inspection);
	if (failure) return preToolBlock(failure);
	if (inspection.status !== "valid" || !inspection.changelog || inspection.changelog.update_mode !== "commit") return allow();
	if (changedFiles.length === 0 || changedFiles.every(file => isDocumentationPath(file, inspection.config))) return allow();
	if (changedFiles.includes(inspection.changelog.path)) return allow();
	const type = commitType(command);
	if (type && inspection.changelog.skip_types.includes(type)) return allow();
	return preToolBlock(
		`Code changes are staged without ${inspection.changelog.path}. Add an entry under [Unreleased] via /ws-docs changelog, or use a configured skip type (${inspection.changelog.skip_types.join(", ")}).`,
	);
}

export function evaluateStop({ inspection, changedFiles }) {
	const failure = policyFailure(inspection);
	if (failure) return stopBlock(failure);
	if (inspection.status !== "valid" || !inspection.changelog || inspection.changelog.update_mode !== "commit") return allow();
	if (changedFiles.length === 0 || changedFiles.every(file => isDocumentationPath(file, inspection.config))) return allow();
	if (changedFiles.includes(inspection.changelog.path)) return allow();
	return stopBlock(`Uncommitted code changes are present without an update to ${inspection.changelog.path}. Run /ws-docs changelog, or confirm 'stop anyway' to override.`);
}

function git(args, cwd) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	return result.status === 0 ? result.stdout.trim() : "";
}

function gitRoot(cwd) {
	return git(["rev-parse", "--show-toplevel"], cwd) || cwd;
}

function changedFiles(cwd, cachedOnly) {
	const groups = [git(["diff", ...(cachedOnly ? ["--cached"] : []), "--name-only"], cwd)];
	if (!cachedOnly) groups.push(git(["diff", "--cached", "--name-only"], cwd));
	return [...new Set(groups.flatMap(group => group.split("\n")).filter(Boolean))].sort();
}

async function main() {
	const mode = process.argv[2];
	if (!new Set(["pre-commit", "stop"]).has(mode)) throw new Error(`Unknown docs policy hook mode: ${mode ?? "<missing>"}.`);
	const cwd = gitRoot(process.cwd());
	const inspection = await inspectCanonicalPolicy(cwd);
	let decision;
	if (mode === "pre-commit") {
		let event = {};
		try {
			event = JSON.parse(readFileSync(0, "utf8") || "{}");
		} catch {
			return;
		}
		decision = evaluatePreCommit({ event, inspection, changedFiles: changedFiles(cwd, true) });
	} else {
		readFileSync(0, "utf8");
		decision = evaluateStop({ inspection, changedFiles: changedFiles(cwd, false) });
	}
	if (decision.output) process.stdout.write(`${decision.output}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
	main().catch(error => {
		const mode = process.argv[2];
		const reason = `Documentation policy hook failed closed: ${error.message} Run /ws-setup to repair canonical policy.`;
		const decision = mode === "pre-commit" ? preToolBlock(reason) : stopBlock(reason);
		process.stdout.write(`${decision.output}\n`);
	});
}
