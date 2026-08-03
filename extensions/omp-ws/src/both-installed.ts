/**
 * Both-installed warning: on session_start, detect the Claude-format
 * marketplace plugin `ws@ws-marketplace` being visible to omp alongside this
 * package. Since 0.2.0 this package carries the FULL suite natively
 * (ADR 0004), so both together register every command/skill/agent twice.
 *
 * Registry semantics (verified against omp 17.2.4
 * src/discovery/helpers.ts listClaudePluginRoots):
 *   - omp reads BOTH ~/.claude/plugins/installed_plugins.json (Claude Code's
 *     registry, priority-70 claude-plugins provider) and
 *     ~/.omp/plugins/installed_plugins.json (+ <project>/.omp/plugins/...),
 *     all keyed "name@marketplace";
 *   - the omp registry is AUTHORITATIVE: an entry there (even enabled:false)
 *     drops the Claude-sourced root for the same id;
 *   - an entry counts as enabled unless `enabled === false`;
 *   - .omp/plugin-overrides.json `disabled[]` applies ONLY to npm/link
 *     plugins — it CANNOT disable a marketplace plugin (zero callers on the
 *     claude-plugins discovery path), so it is deliberately not suggested.
 *
 * Remedies put in the message (both verified in source):
 *   - omp-installed  -> `omp plugin disable ws@ws-marketplace` (cli/plugin-cli.ts
 *     works only when the id is in omp's own registry);
 *   - Claude-Code-installed -> add an `enabled: false` entry for the id to
 *     ~/.omp/plugins/installed_plugins.json — omp then drops the Claude root
 *     while Claude Code keeps using its own copy untouched.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export const MARKETPLACE_PLUGIN_ID = "ws@ws-marketplace";

interface RegistryEntry {
	installPath?: string;
	enabled?: boolean;
}

type Registry = { plugins?: Record<string, RegistryEntry[]> };

/** Where the duplicate is registered, or undefined when not visible to omp. */
export type DuplicateSource = "omp-registry" | "claude-registry";

/**
 * Decide visibility from the parsed registries, mirroring omp's precedence:
 * any omp registry (project first, then user) that CONTAINS the id is
 * authoritative — even an all-disabled entry suppresses the Claude root.
 * Otherwise the Claude registry counts. An entry is enabled unless
 * `enabled === false`.
 */
export function detectDuplicate(
	ompRegistries: Array<Registry | undefined>,
	claudeRegistry: Registry | undefined,
	pluginId: string = MARKETPLACE_PLUGIN_ID,
): DuplicateSource | undefined {
	for (const registry of ompRegistries) {
		const entries = registry?.plugins?.[pluginId];
		if (entries === undefined) continue;
		return entries.some(entry => entry?.enabled !== false) ? "omp-registry" : undefined;
	}
	const claudeEntries = claudeRegistry?.plugins?.[pluginId];
	if (claudeEntries !== undefined && claudeEntries.some(entry => entry?.enabled !== false)) {
		return "claude-registry";
	}
	return undefined;
}

export function duplicateMessage(source: DuplicateSource): string {
	const remedy =
		source === "omp-registry"
			? "run `omp plugin disable ws@ws-marketplace` (or uninstall it)"
			: 'it comes from Claude Code — add a `"ws@ws-marketplace": [{"installPath": "", "enabled": false}]` entry to ~/.omp/plugins/installed_plugins.json (omp-only; Claude Code is untouched)';
	return `ws: marketplace plugin ws@ws-marketplace is also enabled — every WS command/skill/agent is duplicated. On omp keep only @wsagency/omp-ws: ${remedy}.`;
}

async function readRegistry(filePath: string): Promise<Registry | undefined> {
	try {
		const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
		return parsed as Registry;
	} catch {
		return undefined;
	}
}

export function registerBothInstalledWarning(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		try {
			if (!ctx.hasUI) return;
			const home = os.homedir();
			const [userOmp, projectOmp, claude] = await Promise.all([
				readRegistry(path.join(home, ".omp", "plugins", "installed_plugins.json")),
				readRegistry(path.join(ctx.cwd, ".omp", "plugins", "installed_plugins.json")),
				readRegistry(path.join(home, ".claude", "plugins", "installed_plugins.json")),
			]);
			const source = detectDuplicate([projectOmp, userOmp], claude);
			if (source === undefined) return;
			ctx.ui.notify(duplicateMessage(source), "warning");
		} catch {
			// Advisory only — never fail session start.
		}
	});
}
