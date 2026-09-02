/**
 * Plugin-settings reader for @wsagency/omp-ws.
 *
 * omp 17.2.4 exposes NO settings accessor on ExtensionAPI — plugin settings
 * are only read host-side (manager.getPluginSettings / loader.getPluginSettings,
 * both file-backed). So this module reads the exact same stores those functions
 * read (verified against src/extensibility/plugins/loader.ts:527-535 and
 * @oh-my-pi/pi-utils 17.2.4 getPluginsLockfile -> getPluginsDir -> DirResolver,
 * dirs.ts ~228-536):
 *
 *   global : <omp plugins dir>/omp-plugins.lock.json -> settings["@wsagency/omp-ws"]
 *            omp resolves its plugins dir with profile/XDG/legacy precedence
 *            (see {@link resolvePluginsDir}): a named profile (OMP_PROFILE >
 *            PI_PROFILE) roots it at ~/.omp/profiles/<p>/plugins; XDG_DATA_HOME
 *            relocates it to $XDG_DATA_HOME/omp[/profiles/<p>]/plugins but ONLY
 *            once omp migrated that data root (the dir must exist on disk);
 *            otherwise the legacy ~/.omp/plugins wins.
 *   project: <cwd>/{.omp,.claude,.codex,.gemini}/plugin-overrides.json, first that
 *            parses wins -> settings["@wsagency/omp-ws"] — same bases and order as
 *            getConfigDirPaths(PROJECT_CONFIG_BASES) in pi-coding-agent. Project
 *            config is always <cwd>/.omp; profiles/XDG affect ONLY the user root.
 *
 * Project overrides global; the schema's env fallback (JIRA_PROJECT) and
 * defaults from package.json `omp.settings` are applied here because the
 * host only applies them in its own UI/CLI surfaces. Non-fatal on any error.
 */
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export const PLUGIN_NAME = "@wsagency/omp-ws";

export interface WsSettings {
	jiraProject: string;
	guard: boolean;
	dashboard: boolean;
}

export const DEFAULT_SETTINGS: WsSettings = {
	jiraProject: "",
	guard: true,
	dashboard: true,
};
// =============================================================================
// omp plugins-dir resolver — profile/XDG/legacy precedence
// =============================================================================

const OMP_CONFIG_DIR_NAME = ".omp";
const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * omp's getConfigDirName (pi-utils dirs.ts ~206-208): the config-directory
 * basename under $HOME — `.omp` unless PI_CONFIG_DIR overrides it. omp exports
 * this as a stable public surface, and this mirrors it so the plugins-dir
 * resolver here and both-installed.ts's project-registry walker stay in lockstep
 * with omp under a custom PI_CONFIG_DIR — the durable cross-module contract that
 * justifies the indirection over inlining `|| ".omp"` at each site.
 */
export function resolveConfigDirName(env: NodeJS.ProcessEnv = process.env): string {
	return env.PI_CONFIG_DIR || OMP_CONFIG_DIR_NAME;
}

/**
 * Mirror pi-utils 17.2.4 resolveProfileEnv + normalizeProfileName (dirs.ts ~55-72,
 * 82-88): OMP_PROFILE is canonical and wins outright; PI_PROFILE is the legacy
 * fallback consulted only when OMP_PROFILE is undefined (so an explicitly-empty
 * OMP_PROFILE selects the default rather than inheriting PI_PROFILE). An empty,
 * whitespace, or "default" value is the implicit default (undefined). A
 * syntactically invalid name collapses to the default instead of throwing — omp's
 * own safe path (readProfileFromEnvSafe) swallows the same error, and this module
 * is non-fatal, so a bad env var must never break settings reads.
 */
function resolveProfile(env: NodeJS.ProcessEnv): string | undefined {
	const raw = env.OMP_PROFILE !== undefined ? env.OMP_PROFILE : env.PI_PROFILE;
	const name = typeof raw === "string" ? raw.trim() : "";
	if (!name || name === "default") return undefined;
	if (name === "." || name === ".." || name.endsWith(".") || !PROFILE_NAME_RE.test(name)) {
		return undefined;
	}
	return name;
}

/**
 * omp adopts XDG only on linux/darwin, only when the migrated app root
 * actually exists on disk, AND only when the agent dir is still the profile's
 * derived default (DirResolver ~244-286). That last gate is what this mirror
 * previously omitted: a non-default PI_CODING_AGENT_DIR on the DEFAULT profile
 * makes omp set `isDefault === false`, skip XDG, and read/write plugins under
 * <home>/<configDir> — never under $XDG_DATA_HOME. Without mirroring that, this
 * plugin would read a migrated XDG lockfile omp no longer touches. (Named
 * profiles always derive their own agent dir, so the override is ignored and
 * isDefault stays true — XDG is evaluated, matching the named-profile branch.)
 *
 * A missing env var OR a missing dir also means no XDG — the legacy config root
 * wins. We deliberately do NOT synthesize ~/.local/share when XDG_DATA_HOME is
 * unset: omp never does, and defaulting would silently read the wrong store on
 * the many Linux desktops that export XDG_DATA_HOME=~/.local/share without
 * having run `omp config init-xdg`.
 */
function resolveXdgDataRoot(
	xdgDataHome: string | undefined,
	profile: string | undefined,
	configRoot: string,
	env: NodeJS.ProcessEnv,
): string | undefined {
	// omp DirResolver: isDefault requires the agent dir to equal the profile's
	// derived default. On the default profile a non-default PI_CODING_AGENT_DIR
	// disables XDG entirely (path.resolve mirrors omp's own normalization).
	if (
		profile === undefined &&
		env.PI_CODING_AGENT_DIR &&
		path.resolve(env.PI_CODING_AGENT_DIR) !== path.join(configRoot, "agent")
	) {
		return undefined;
	}
	if ((process.platform !== "linux" && process.platform !== "darwin") || !xdgDataHome) return undefined;
	const appRoot = path.join(xdgDataHome, "omp");
	const candidate = profile ? path.join(appRoot, "profiles", profile) : appRoot;
	return existsSync(candidate) ? candidate : undefined;
}

/**
 * Resolve the single plugins directory omp reads and writes, replicating omp
 * 17.2.4's DirResolver + getPluginsDir (pi-utils dirs.ts, getPluginsDir ~531-536
 * via rootSubdir("plugins","data")). Effective precedence:
 *
 *   profile = OMP_PROFILE > PI_PROFILE  (default profile = none)
 *   configRoot = <home>/<PI_CONFIG_DIR|".omp">[/profiles/<profile>]
 *   dataRoot   = $XDG_DATA_HOME/omp[/profiles/<profile>]  (only if it exists)
 *              | configRoot                                 (legacy fallback)
 *   pluginsDir = <dataRoot>/plugins
 *
 * omp caches this at module load and gates XDG on a one-shot existence check;
 * we recompute per call (cheap, one stat) so process.env mutations take effect
 * immediately. The `env` override exists for deterministic unit tests; production
 * callers go through `process.env`.
 */
export function resolvePluginsDir(home: string, env: NodeJS.ProcessEnv = process.env): string {
	const configDirName = resolveConfigDirName(env);
	const profile = resolveProfile(env);
	const configRoot = profile
		? path.join(home, configDirName, "profiles", profile)
		: path.join(home, configDirName);
	return path.join(resolveXdgDataRoot(env.XDG_DATA_HOME, profile, configRoot, env) ?? configRoot, "plugins");
}

type RawSettings = Record<string, unknown>;

async function readJson(filePath: string): Promise<Record<string, unknown> | undefined> {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

function pluginSettings(container: Record<string, unknown> | undefined, pluginName: string): RawSettings {
	const settings = container?.settings;
	if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
	const own = (settings as Record<string, unknown>)[pluginName];
	if (!own || typeof own !== "object" || Array.isArray(own)) return {};
	return own as RawSettings;
}

/** Merge stored values (project over global) with env fallback and defaults. */
export function resolveSettings(global: RawSettings, project: RawSettings, env: Record<string, string | undefined> = process.env): WsSettings {
	const merged: RawSettings = { ...global, ...project };
	const jiraProject =
		typeof merged.jiraProject === "string" && merged.jiraProject !== ""
			? merged.jiraProject
			: (env.JIRA_PROJECT ?? DEFAULT_SETTINGS.jiraProject);
	return {
		jiraProject,
		guard: typeof merged.guard === "boolean" ? merged.guard : DEFAULT_SETTINGS.guard,
		dashboard: typeof merged.dashboard === "boolean" ? merged.dashboard : DEFAULT_SETTINGS.dashboard,
	};
}

/**
 * Machine-wide guard protection may strengthen a repository that disables its
 * own requirement. Repository overrides and package defaults are deliberately
 * excluded: only an explicit global setting (or force-on environment value)
 * represents protection shared with other repositories.
 */
export async function hasSharedDangerousGitProtection(
	home: string = os.homedir(),
	env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
	if (env.OMP_WS_GUARD === "on" || env.OMP_WS_GUARD === "required") return true;
	const lock = await readJson(path.join(resolvePluginsDir(home, env), "omp-plugins.lock.json"));
	return pluginSettings(lock, PLUGIN_NAME).guard === true;
}

/** Read the merged plugin settings for this cwd. Never throws. */
export async function readWsSettings(cwd: string, home: string = os.homedir()): Promise<WsSettings> {
	try {
		// Global lockfile: the single plugins dir omp reads/writes, resolved with
		// profile/XDG/legacy precedence (see resolvePluginsDir) — so a global
		// off-switch under a named profile or an XDG-migrated data root is honored.
		const lock = await readJson(path.join(resolvePluginsDir(home), "omp-plugins.lock.json"));
		// Project overrides: same bases and order as getConfigDirPaths(PROJECT_CONFIG_BASES).
		const overrides = await readFirstJson(
			[".omp", ".claude", ".codex", ".gemini"].map(base => path.join(cwd, base, "plugin-overrides.json")),
		);
		return resolveSettings(pluginSettings(lock, PLUGIN_NAME), pluginSettings(overrides, PLUGIN_NAME));
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

/** Return the first JSON object that parses from `paths`, in order; undefined if none. */
async function readFirstJson(paths: string[]): Promise<Record<string, unknown> | undefined> {
	for (const candidate of paths) {
		const parsed = await readJson(candidate);
		if (parsed !== undefined) return parsed;
	}
	return undefined;
}
