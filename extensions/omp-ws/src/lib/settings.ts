/**
 * Plugin-settings reader for @wsagency/omp-ws.
 *
 * omp 17.2.4 exposes NO settings accessor on ExtensionAPI — plugin settings
 * are only read host-side (manager.getPluginSettings / loader.getPluginSettings,
 * both file-backed). So this module reads the exact same stores those
 * functions read (verified against src/extensibility/plugins/loader.ts:527-535
 * and @oh-my-pi/pi-utils getPluginsLockfile):
 *
 *   global : ~/.omp/plugins/omp-plugins.lock.json      -> settings["@wsagency/omp-ws"]
 *   project: <cwd>/.omp/plugin-overrides.json          -> settings["@wsagency/omp-ws"]
 *            (<cwd>/.pi/plugin-overrides.json legacy fallback, same as
 *             getConfigDirPaths)
 *
 * Project overrides global; the schema's env fallback (JIRA_PROJECT) and
 * defaults from package.json `omp.settings` are applied here because the
 * host only applies them in its own UI/CLI surfaces. Non-fatal on any error.
 */
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

/** Read the merged plugin settings for this cwd. Never throws. */
export async function readWsSettings(cwd: string, home: string = os.homedir()): Promise<WsSettings> {
	try {
		const lock = await readJson(path.join(home, ".omp", "plugins", "omp-plugins.lock.json"));
		let overrides = await readJson(path.join(cwd, ".omp", "plugin-overrides.json"));
		if (overrides === undefined) overrides = await readJson(path.join(cwd, ".pi", "plugin-overrides.json"));
		return resolveSettings(pluginSettings(lock, PLUGIN_NAME), pluginSettings(overrides, PLUGIN_NAME));
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}
