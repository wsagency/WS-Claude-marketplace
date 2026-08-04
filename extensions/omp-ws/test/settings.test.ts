import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_SETTINGS, PLUGIN_NAME, readWsSettings, resolvePluginsDir, resolveSettings } from "../src/lib/settings";

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

// resolvePluginsDir replicates omp 17.2.4's DirResolver + getPluginsDir
// (pi-utils dirs.ts): profile (OMP_PROFILE > PI_PROFILE) roots the plugins dir
// under ~/.omp/profiles/<p>, XDG_DATA_HOME relocates it once omp migrated the
// data root (the dir must exist), otherwise the legacy ~/.omp wins. These pin
// the exact path for each layout so settings + registry reads stay in lockstep
// with omp's writer.
describe("resolvePluginsDir", () => {
	// Pure path cases use a fake home + an explicit env object: no process.env
	// mutation, no disk — deterministic on every platform.
	test("legacy default: ~/.omp/plugins when no profile and no XDG", () => {
		expect(resolvePluginsDir("/home/u", {})).toBe(path.join("/home/u", ".omp", "plugins"));
	});

	test("named profile roots under ~/.omp/profiles/<p>/plugins", () => {
		expect(resolvePluginsDir("/home/u", { OMP_PROFILE: "work" })).toBe(
			path.join("/home/u", ".omp", "profiles", "work", "plugins"),
		);
	});

	test("OMP_PROFILE wins over the legacy PI_PROFILE", () => {
		expect(resolvePluginsDir("/home/u", { OMP_PROFILE: "a", PI_PROFILE: "b" })).toBe(
			path.join("/home/u", ".omp", "profiles", "a", "plugins"),
		);
	});

	test("PI_PROFILE is consulted only when OMP_PROFILE is undefined", () => {
		expect(resolvePluginsDir("/home/u", { PI_PROFILE: "legacy" })).toBe(
			path.join("/home/u", ".omp", "profiles", "legacy", "plugins"),
		);
	});

	test("explicitly-empty OMP_PROFILE selects the default profile (ignores PI_PROFILE)", () => {
		expect(resolvePluginsDir("/home/u", { OMP_PROFILE: "", PI_PROFILE: "b" })).toBe(
			path.join("/home/u", ".omp", "plugins"),
		);
	});

	test('"default" and whitespace profile names are the implicit default', () => {
		expect(resolvePluginsDir("/home/u", { OMP_PROFILE: "default" })).toBe(
			path.join("/home/u", ".omp", "plugins"),
		);
		expect(resolvePluginsDir("/home/u", { OMP_PROFILE: "  " })).toBe(
			path.join("/home/u", ".omp", "plugins"),
		);
	});

	test("an invalid profile name falls back to the default profile (omp's safe path)", () => {
		expect(resolvePluginsDir("/home/u", { OMP_PROFILE: "Bad Name!" })).toBe(
			path.join("/home/u", ".omp", "plugins"),
		);
	});

	test("PI_CONFIG_DIR overrides the .omp config-dir name", () => {
		expect(resolvePluginsDir("/home/u", { PI_CONFIG_DIR: ".pi" })).toBe(
			path.join("/home/u", ".pi", "plugins"),
		);
	});

	// XDG adoption is gated on a real existence check (omp only uses XDG after
	// `omp config init-xdg` migrated the data root), so these need real dirs.
	test("XDG env set but omp data root not migrated -> legacy fallback", async () => {
		const xdg = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-xdg-"));
		try {
			// xdg exists but has no omp/ subdir, so omp keeps reading ~/.omp.
			expect(resolvePluginsDir("/home/u", { XDG_DATA_HOME: xdg })).toBe(
				path.join("/home/u", ".omp", "plugins"),
			);
		} finally {
			await fs.rm(xdg, { recursive: true, force: true });
		}
	});

	test("XDG migrated -> $XDG_DATA_HOME/omp/plugins", async () => {
		const xdg = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-xdg-"));
		try {
			await fs.mkdir(path.join(xdg, "omp"), { recursive: true });
			expect(resolvePluginsDir("/home/u", { XDG_DATA_HOME: xdg })).toBe(
				path.join(xdg, "omp", "plugins"),
			);
		} finally {
			await fs.rm(xdg, { recursive: true, force: true });
		}
	});

	test("named profile adopts XDG only at its profile-specific path", async () => {
		// omp pins a named profile's location to $XDG_DATA_HOME/omp/profiles/<p> and
		// requires THAT dir to exist; a bare $XDG_DATA_HOME/omp is not enough.
		const xdg = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-xdg-"));
		try {
			await fs.mkdir(path.join(xdg, "omp"), { recursive: true });
			expect(resolvePluginsDir("/home/u", { OMP_PROFILE: "work", XDG_DATA_HOME: xdg })).toBe(
				path.join("/home/u", ".omp", "profiles", "work", "plugins"),
			);

			await fs.mkdir(path.join(xdg, "omp", "profiles", "work"), { recursive: true });
			expect(resolvePluginsDir("/home/u", { OMP_PROFILE: "work", XDG_DATA_HOME: xdg })).toBe(
				path.join(xdg, "omp", "profiles", "work", "plugins"),
			);
		} finally {
			await fs.rm(xdg, { recursive: true, force: true });
		}
	});
});

describe("readWsSettings", () => {
	// Every readWsSettings test pins XDG_DATA_HOME to an empty dir under the temp
	// home so the host machine's real omp lockfile can never leak into the global
	// resolution (the reader probes $XDG_DATA_HOME/omp first, mirroring the host).
	test("merges lock file and project overrides from disk", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-home-"));
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-cwd-"));
		const savedXdg = process.env.XDG_DATA_HOME;
		process.env.XDG_DATA_HOME = path.join(home, ".local", "share");
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
			if (savedXdg === undefined) delete process.env.XDG_DATA_HOME;
			else process.env.XDG_DATA_HOME = savedXdg;
			await fs.rm(home, { recursive: true, force: true });
			await fs.rm(cwd, { recursive: true, force: true });
		}
	});

	test("returns defaults when no files exist", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-home-"));
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-cwd-"));
		const savedEnv = process.env.JIRA_PROJECT;
		const savedXdg = process.env.XDG_DATA_HOME;
		delete process.env.JIRA_PROJECT;
		process.env.XDG_DATA_HOME = path.join(home, ".local", "share");
		try {
			expect(await readWsSettings(cwd, home)).toEqual(DEFAULT_SETTINGS);
		} finally {
			if (savedEnv !== undefined) process.env.JIRA_PROJECT = savedEnv;
			if (savedXdg === undefined) delete process.env.XDG_DATA_HOME;
			else process.env.XDG_DATA_HOME = savedXdg;
			await fs.rm(home, { recursive: true, force: true });
			await fs.rm(cwd, { recursive: true, force: true });
		}
	});

	test("reads the global lockfile from the XDG data location", async () => {
		// omp resolves its data root via $XDG_DATA_HOME/omp when active; the
		// extension must read the same path or a global off-switch is silently lost.
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-home-"));
		const xdgData = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-xdg-"));
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-cwd-"));
		const savedXdg = process.env.XDG_DATA_HOME;
		process.env.XDG_DATA_HOME = xdgData;
		try {
			// Global lockfile exists ONLY under the XDG data root; ~/.omp is absent.
			await fs.mkdir(path.join(xdgData, "omp", "plugins"), { recursive: true });
			await fs.writeFile(
				path.join(xdgData, "omp", "plugins", "omp-plugins.lock.json"),
				JSON.stringify({ settings: { [PLUGIN_NAME]: { guard: false } } }),
			);

			expect((await readWsSettings(cwd, home)).guard).toBe(false);
		} finally {
			if (savedXdg === undefined) delete process.env.XDG_DATA_HOME;
			else process.env.XDG_DATA_HOME = savedXdg;
			await fs.rm(home, { recursive: true, force: true });
			await fs.rm(xdgData, { recursive: true, force: true });
			await fs.rm(cwd, { recursive: true, force: true });
		}
	});

	test("reads project overrides from .claude when .omp is absent", async () => {
		// The host consults .omp/.claude/.codex/.gemini; the extension must too, or a
		// project off-switch pinned in .claude/plugin-overrides.json is ignored.
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-home-"));
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-cwd-"));
		const savedXdg = process.env.XDG_DATA_HOME;
		process.env.XDG_DATA_HOME = path.join(home, ".local", "share");
		try {
			await fs.mkdir(path.join(cwd, ".claude"), { recursive: true });
			await fs.writeFile(
				path.join(cwd, ".claude", "plugin-overrides.json"),
				JSON.stringify({ settings: { [PLUGIN_NAME]: { dashboard: false } } }),
			);

			expect((await readWsSettings(cwd, home)).dashboard).toBe(false);
		} finally {
			if (savedXdg === undefined) delete process.env.XDG_DATA_HOME;
			else process.env.XDG_DATA_HOME = savedXdg;
			await fs.rm(home, { recursive: true, force: true });
			await fs.rm(cwd, { recursive: true, force: true });
		}
	});

	test("ignores the .pi base the host no longer consults", async () => {
		// .pi is not in the host's PROJECT_CONFIG_BASES, so a value pinned there must
		// NOT leak into the extension's resolution (it would diverge from omp UI/CLI).
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-home-"));
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-cwd-"));
		const savedEnv = process.env.JIRA_PROJECT;
		const savedXdg = process.env.XDG_DATA_HOME;
		delete process.env.JIRA_PROJECT;
		process.env.XDG_DATA_HOME = path.join(home, ".local", "share");
		try {
			await fs.mkdir(path.join(cwd, ".pi"), { recursive: true });
			await fs.writeFile(
				path.join(cwd, ".pi", "plugin-overrides.json"),
				JSON.stringify({ settings: { [PLUGIN_NAME]: { dashboard: false } } }),
			);

			expect((await readWsSettings(cwd, home)).dashboard).toBe(true);
		} finally {
			if (savedEnv !== undefined) process.env.JIRA_PROJECT = savedEnv;
			if (savedXdg === undefined) delete process.env.XDG_DATA_HOME;
			else process.env.XDG_DATA_HOME = savedXdg;
			await fs.rm(home, { recursive: true, force: true });
			await fs.rm(cwd, { recursive: true, force: true });
		}
	});

	test("reads the global lockfile from a named profile's plugins dir", async () => {
		// A global off-switch stored under ~/.omp/profiles/<p>/plugins must be read
		// when OMP_PROFILE is active — otherwise a profile's guard setting is lost.
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-home-"));
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-cwd-"));
		const savedProfile = process.env.OMP_PROFILE;
		const savedXdg = process.env.XDG_DATA_HOME;
		process.env.OMP_PROFILE = "work";
		// Pin XDG to a dir without an omp/ subdir so the legacy profile path wins.
		process.env.XDG_DATA_HOME = path.join(home, ".local", "share");
		try {
			await fs.mkdir(path.join(home, ".omp", "profiles", "work", "plugins"), { recursive: true });
			await fs.writeFile(
				path.join(home, ".omp", "profiles", "work", "plugins", "omp-plugins.lock.json"),
				JSON.stringify({ settings: { [PLUGIN_NAME]: { guard: false } } }),
			);

			expect((await readWsSettings(cwd, home)).guard).toBe(false);
		} finally {
			if (savedProfile === undefined) delete process.env.OMP_PROFILE;
			else process.env.OMP_PROFILE = savedProfile;
			if (savedXdg === undefined) delete process.env.XDG_DATA_HOME;
			else process.env.XDG_DATA_HOME = savedXdg;
			await fs.rm(home, { recursive: true, force: true });
			await fs.rm(cwd, { recursive: true, force: true });
		}
	});
});
