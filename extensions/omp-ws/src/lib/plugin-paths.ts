/**
 * omp plugin-path resolution used by duplicate-install detection.
 *
 * Mirrors omp 17.2.4's profile/XDG/legacy precedence so both-installed.ts
 * reads the same user plugin registry omp writes. This module deliberately
 * contains no WS package-setting reader: repository behavior comes only from
 * `.wsagency/config.yaml`, while machine-wide guard strengthening is an
 * explicit environment capability.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";

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
 * own safe path (readProfileFromEnvSafe) swallows the same error, and path
 * discovery is non-fatal, so a bad env var must never break session startup.
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
