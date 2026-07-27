/**
 * Compaction preservation: `session.compacting` handler that injects a short
 * preserved-context block so long sessions keep WS state across compaction
 * (dev-docs/omp-native-improvements.md, adopted improvement 3).
 *
 * Preserved (verified event contract: SessionCompactingResult.context lines
 * are included in the compaction summary — omp src/extensibility/
 * shared-events.ts):
 *   - active ticket files under dev-docs/tickets/open/ (names only, max 5)
 *   - whether CHANGELOG.md has uncommitted changes
 *
 * Non-fatal by contract: any error means no context injection.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { run } from "./lib/exec";

const MAX_TICKETS = 5;

export function buildPreservedContext(openTickets: string[], changelogDirty: boolean): string[] {
	const lines: string[] = [];
	if (openTickets.length > 0) {
		const shown = openTickets.slice(0, MAX_TICKETS).join(", ");
		const more = openTickets.length > MAX_TICKETS ? ` (+${openTickets.length - MAX_TICKETS} more)` : "";
		lines.push(`WS open tickets (dev-docs/tickets/open/): ${shown}${more}`);
	}
	if (changelogDirty) {
		lines.push("WS: CHANGELOG.md has uncommitted changes — keep the pending changelog entry in mind.");
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

async function changelogHasUncommittedChanges(cwd: string): Promise<boolean> {
	const result = await run("git", ["status", "--porcelain", "--", "CHANGELOG.md"], { cwd });
	return result.code === 0 && result.stdout.trim() !== "";
}

export function registerCompaction(pi: ExtensionAPI): void {
	pi.on("session.compacting", async (_event, ctx) => {
		try {
			const [openTickets, changelogDirty] = await Promise.all([listOpenTickets(ctx.cwd), changelogHasUncommittedChanges(ctx.cwd)]);
			const context = buildPreservedContext(openTickets, changelogDirty);
			if (context.length === 0) return;
			return { context };
		} catch {
			return; // non-fatal by contract
		}
	});
}
