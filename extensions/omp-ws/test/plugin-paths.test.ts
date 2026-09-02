import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolvePluginsDir } from "../src/lib/plugin-paths";

// resolvePluginsDir replicates omp 17.2.4's DirResolver + getPluginsDir
// (pi-utils dirs.ts): profile (OMP_PROFILE > PI_PROFILE) roots the plugins dir
// under ~/.omp/profiles/<p>, XDG_DATA_HOME relocates it once omp migrated the
// data root (the dir must exist), otherwise the legacy ~/.omp wins. These pin
// the exact path for each layout so duplicate-install detection stays in
// lockstep with omp's writer.
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
