import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_SETTINGS, PLUGIN_NAME, readWsSettings, resolveSettings } from "../src/lib/settings";

describe("resolveSettings", () => {
	test("defaults when nothing is stored", () => {
		expect(resolveSettings({}, {}, {})).toEqual(DEFAULT_SETTINGS);
	});

	test("project overrides global", () => {
		const settings = resolveSettings({ guard: true, dashboard: true }, { guard: false }, {});
		expect(settings.guard).toBe(false);
		expect(settings.dashboard).toBe(true);
	});

	test("env fallback fills jiraProject only when unset", () => {
		expect(resolveSettings({}, {}, { JIRA_PROJECT: "WSC" }).jiraProject).toBe("WSC");
		expect(resolveSettings({ jiraProject: "ABC" }, {}, { JIRA_PROJECT: "WSC" }).jiraProject).toBe("ABC");
		expect(resolveSettings({ jiraProject: "" }, {}, { JIRA_PROJECT: "WSC" }).jiraProject).toBe("WSC");
	});

	test("ignores wrongly-typed stored values", () => {
		const settings = resolveSettings({ guard: "no", dashboard: 0, jiraProject: 42 }, {}, {});
		expect(settings).toEqual(DEFAULT_SETTINGS);
	});
});

describe("readWsSettings", () => {
	test("merges lock file and project overrides from disk", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-home-"));
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-cwd-"));
		try {
			await fs.mkdir(path.join(home, ".omp", "plugins"), { recursive: true });
			await fs.writeFile(
				path.join(home, ".omp", "plugins", "omp-plugins.lock.json"),
				JSON.stringify({ plugins: {}, settings: { [PLUGIN_NAME]: { guard: false, jiraProject: "GLB" } } }),
			);
			await fs.mkdir(path.join(cwd, ".omp"), { recursive: true });
			await fs.writeFile(
				path.join(cwd, ".omp", "plugin-overrides.json"),
				JSON.stringify({ settings: { [PLUGIN_NAME]: { guard: true, dashboard: false } } }),
			);

			const settings = await readWsSettings(cwd, home);
			expect(settings.guard).toBe(true); // project wins
			expect(settings.dashboard).toBe(false);
			expect(settings.jiraProject).toBe("GLB"); // global survives when project silent
		} finally {
			await fs.rm(home, { recursive: true, force: true });
			await fs.rm(cwd, { recursive: true, force: true });
		}
	});

	test("returns defaults when no files exist", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-home-"));
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-cwd-"));
		const savedEnv = process.env.JIRA_PROJECT;
		delete process.env.JIRA_PROJECT;
		try {
			expect(await readWsSettings(cwd, home)).toEqual(DEFAULT_SETTINGS);
		} finally {
			if (savedEnv !== undefined) process.env.JIRA_PROJECT = savedEnv;
			await fs.rm(home, { recursive: true, force: true });
			await fs.rm(cwd, { recursive: true, force: true });
		}
	});
});
