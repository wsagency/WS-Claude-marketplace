/**
 * Both-installed warning: on session_start, detect the Claude-format
 * marketplace plugin `ws@ws-marketplace` being visible to omp alongside this
 * package. Since 0.2.0 this package carries the FULL suite natively
 * (ADR 0004), so both together register every command/skill/agent twice.
 *
 * Registry semantics (verified against omp 17.2.4
 * src/discovery/helpers.ts listClaudePluginRoots, ~lines 918-1066):
 *   - omp reads THREE registries, all keyed "name@marketplace":
 *       Claude  ~/.claude/plugins/installed_plugins.json
 *       user    <getPluginsDir>/installed_plugins.json  (profile/XDG/legacy-aware:
 *               named profile OMP_PROFILE>PI_PROFILE roots it at
 *               ~/.omp/profiles/<p>/plugins, XDG_DATA_HOME relocates it to
 *               $XDG_DATA_HOME/omp[/profiles/<p>]/plugins once omp migrated that
 *               data root, otherwise ~/.omp/plugins — resolved by lib/settings's
 *               resolvePluginsDir, mirroring pi-utils 17.2.4 getPluginsDir)
 *       project nearest ancestor .omp/plugins/installed_plugins.json from cwd
 *   - the USER omp registry is AUTHORITATIVE for an id: any NON-EMPTY entry
 *     array (even all `enabled:false`) unconditionally drops the Claude-sourced
 *     root for that id; the plugin is then invisible unless the user registry
 *     also contributes an enabled root of its own (helpers.ts ~992-995).
 *   - the PROJECT omp registry is NOT authoritative that way: it only shadows a
 *     Claude/user root when it contributes an ENABLED root for the id. A
 *     disabled-only project entry adds no project root, so the Claude root stays
 *     loaded — disabling in the project registry does NOT stop the duplication
 *     (helpers.ts ~1043, 1061).
 *   - an entry becomes a loaded root only when `enabled !== false` AND it carries
 *     a non-empty `installPath` (helpers.ts ~943, 998, 1039).
 *   - .omp/plugin-overrides.json `disabled[]` applies ONLY to npm/link plugins —
 *     it CANNOT disable a marketplace plugin (zero callers on the claude-plugins
 *     discovery path), so it is deliberately not suggested.
 *
 * Remedies put in the message (both verified in source):
 *   - omp-installed  -> `omp plugin disable ws@ws-marketplace` (cli/plugin-cli.ts
 *     works only when the id is in omp's own registry);
 *   - Claude-Code-installed -> add an `enabled: false` entry for the id to omp's
 *     USER registry (the installed_plugins.json under omp's plugins dir) — omp
 *     then drops the Claude root while Claude Code keeps its own copy untouched.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { resolveConfigDirName, resolvePluginsDir } from "./lib/settings";

export const MARKETPLACE_PLUGIN_ID = "ws@ws-marketplace";

interface RegistryEntry {
	installPath?: string;
	enabled?: boolean;
}

type Registry = { plugins?: Record<string, RegistryEntry[]> };

/** Where the duplicate is registered, or undefined when not visible to omp. */
export type DuplicateSource = "omp-registry" | "claude-registry";

/**
 * An entry becomes a loaded omp root only when it is enabled AND carries a
 * non-empty installPath — omp skips entries lacking one (helpers.ts ~943/998/1039).
 */
function hasEnabledRoot(registry: Registry | undefined, pluginId: string): boolean {
	const entries = registry?.plugins?.[pluginId];
	return Array.isArray(entries) && entries.length > 0 &&
		entries.some(e => e?.enabled !== false && typeof e?.installPath === "string" && e.installPath !== "");
}


/**
 * Decide visibility from the parsed registries, mirroring omp's precedence:
 *   1. a project registry that contributes an enabled root -> omp-registry (it
 *      shadows every same-id root). A disabled-only project entry adds no
 *      project root, so the Claude root is still loaded — NOT suppressed;
 *   2. otherwise the user registry is authoritative — a non-empty entry array
 *      drops the Claude root, so the plugin is visible iff the user registry
 *      also contributes its own enabled root;
 *   3. otherwise omp loads whatever Claude Code registered.
 */
export function detectDuplicate(
	projectOmp: Registry | undefined,
	userOmp: Registry | undefined,
	claudeRegistry: Registry | undefined,
	pluginId: string = MARKETPLACE_PLUGIN_ID,
): DuplicateSource | undefined {
	// Project registry shadows only via an enabled root; disabled-only leaves the
	// Claude root loaded (omp builds projectRoots from enabled entries only).
	if (hasEnabledRoot(projectOmp, pluginId)) return "omp-registry";
	// omp's USER registry is authoritative: a non-empty entry array (even all
	// disabled) unconditionally drops the Claude root for this id (helpers.ts
	// ~992-995), so the plugin is invisible unless the user registry also has an
	// enabled root. An empty/absent array is a no-op (helpers.ts ~982).
	const userEntries = userOmp?.plugins?.[pluginId];
	if (Array.isArray(userEntries) && userEntries.length > 0) {
		return hasEnabledRoot(userOmp, pluginId) ? "omp-registry" : undefined;
	}
	// No omp registry covers the id — omp loads the Claude-sourced root.
	return hasEnabledRoot(claudeRegistry, pluginId) ? "claude-registry" : undefined;
}

export function duplicateMessage(source: DuplicateSource, userRegistryPath?: string): string {
	const remedy =
		source === "omp-registry"
			? "run `omp plugin disable ws@ws-marketplace` (or uninstall it)"
			: `it comes from Claude Code — add a \`"ws@ws-marketplace": [{"installPath": "", "enabled": false}]\` entry to omp's user registry${userRegistryPath ? ` at ${userRegistryPath}` : " (the installed_plugins.json under omp's plugins dir)"} — omp-only; Claude Code is untouched`;
	return `ws: marketplace plugin ws@ws-marketplace is also enabled — every WS command/skill/agent is duplicated. On omp keep only @wsagency/omp-ws: ${remedy}.`;
}

async function readRegistry(filePath: string | undefined): Promise<Registry | undefined> {
	if (!filePath) return undefined;
	try {
		const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
		return parsed as Registry;
	} catch {
		return undefined;
	}
}

/**
 * omp's user plugins dir is profile/XDG/legacy-aware (getPluginsDir). Resolve it
 * via the shared resolver (lib/settings's resolvePluginsDir) so this reads the
 * installed_plugins.json omp's writer actually targets under any layout — a
 * named profile (OMP_PROFILE>PI_PROFILE), an XDG-migrated data root, or the
 * legacy ~/.omp — instead of a hardcoded ~/.omp path.
 */
export function userOmpRegistryPath(home: string, env: NodeJS.ProcessEnv = process.env): string {
	return path.join(resolvePluginsDir(home, env), "installed_plugins.json");
}

/**
 * Nearest ancestor <configDir>/plugins/installed_plugins.json from cwd,
 * mirroring omp's resolveActiveProjectRegistryPath pass 1 (stops before $HOME,
 * which is the user registry, not a project root). omp probes getConfigDirName()
 * — PI_CONFIG_DIR || ".omp" — at every site (helpers.ts), so we must too, or a
 * custom PI_CONFIG_DIR makes us probe the wrong directory. Falls back to
 * <cwd>/<configDir>/plugins/... when no ancestor carries an omp config dir —
 * omp's git-anchored pass 2 would resolve a non-existent file there, which
 * readRegistry treats as "no registry". Returns undefined when cwd === $HOME:
 * that path is the USER registry, and aliasing it would let a stale
 * default-profile entry masquerade as a project root under a named profile or
 * an XDG-migrated layout (resolveOrDefaultProjectRegistryPath returns undefined
 * there for the same reason).
 */
async function projectRegistryPath(cwd: string, home: string): Promise<string | undefined> {
	const configDirName = resolveConfigDirName(process.env);
	const registryRel = path.join(configDirName, "plugins", "installed_plugins.json");
	const homeResolved = path.resolve(home);
	let dir = path.resolve(cwd);
	while (dir !== homeResolved) {
		try {
			const st = await fs.stat(path.join(dir, configDirName));
			if (st.isDirectory()) return path.join(dir, registryRel);
		} catch {
			// no omp config dir at this level — keep walking up
		}
		const parent = path.dirname(dir);
		if (parent === dir) break; // filesystem root
		dir = parent;
	}
	if (path.resolve(cwd) === homeResolved) return undefined;
	return path.join(cwd, registryRel);
}

export function registerBothInstalledWarning(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		try {
			if (!ctx.hasUI) return;
			const home = os.homedir();
			const projectPath = await projectRegistryPath(ctx.cwd, home);
			const userPath = userOmpRegistryPath(home);
			const [projectOmp, userOmp, claude] = await Promise.all([
				readRegistry(projectPath),
				readRegistry(userPath),
				readRegistry(path.join(home, ".claude", "plugins", "installed_plugins.json")),
			]);
			const source = detectDuplicate(projectOmp, userOmp, claude);
			if (source === undefined) return;
			// Name the actual resolved user registry so the remedy is actionable
			// under a named profile or XDG layout (never a hardcoded ~/.omp path).
			ctx.ui.notify(duplicateMessage(source, userPath), "warning");
		} catch {
			// Advisory only — never fail session start.
		}
	});
}
