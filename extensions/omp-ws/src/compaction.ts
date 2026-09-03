/**
 * Canonical-policy compaction preservation. Local-ticket and changelog context
 * is injected only when the repository selects those capabilities. Policy
 * problems are preserved as non-blocking setup guidance.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { run } from "./lib/exec";
import {
	loadRepositoryPolicy,
	missingPolicyCapability,
	repositoryPolicyProblem,
} from "./lib/project-policy";

const MAX_TICKETS = 5;

export function buildPreservedContext(
	openTickets: string[],
	changelogDirty: boolean,
	changelogPath = "CHANGELOG.md",
): string[] {
	const lines: string[] = [];
	if (openTickets.length > 0) {
		const shown = openTickets.slice(0, MAX_TICKETS).join(", ");
		const more = openTickets.length > MAX_TICKETS ? ` (+${openTickets.length - MAX_TICKETS} more)` : "";
		lines.push(`WS open tickets (dev-docs/tickets/open/): ${shown}${more}`);
	}
	if (changelogDirty) {
		lines.push(`WS: ${changelogPath} has uncommitted changes — keep the pending changelog entry in mind.`);
	}
	return lines;
}

async function listOpenTickets(cwd: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(path.join(cwd, "dev-docs", "tickets", "open"), { withFileTypes: true });
		return entries
			.filter(entry => entry.isFile() && !entry.name.startsWith("."))
			.map(entry => entry.name)
			.sort();
	} catch {
		return [];
	}
}

async function changelogHasUncommittedChanges(cwd: string, changelogPath: string): Promise<boolean> {
	const result = await run("git", ["status", "--porcelain", "--", changelogPath], { cwd });
	return result.code === 0 && result.stdout.trim() !== "";
}

export function registerCompaction(pi: ExtensionAPI): void {
	pi.on("session.compacting", async (_event, ctx) => {
		try {
			const state = await loadRepositoryPolicy(ctx.cwd);
			const policyProblem = repositoryPolicyProblem(state, "ws-compaction", ["runtime"]);
			if (policyProblem !== undefined) return { context: [policyProblem] };
			if (state.status !== "valid") return;
			if (!state.config?.tracker || !state.config.changelog) {
				return { context: [missingPolicyCapability("ws-compaction", "tracker and changelog policy")] };
			}

			const localTickets = state.config.tracker.primary === "local";
			const changelogEnabled = state.config.changelog.update_mode !== "disabled";
			const [openTickets, changelogDirty] = await Promise.all([
				localTickets ? listOpenTickets(state.root) : Promise.resolve([]),
				changelogEnabled
					? changelogHasUncommittedChanges(state.root, state.config.changelog.path)
					: Promise.resolve(false),
			]);
			const context = buildPreservedContext(openTickets, changelogDirty, state.config.changelog.path);
			if (context.length === 0) return;
			return { context };
		} catch {
			return;
		}
	});
}
