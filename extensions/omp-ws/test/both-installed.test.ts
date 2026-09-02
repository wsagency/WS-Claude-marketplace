import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { detectDuplicate, duplicateMessage, MARKETPLACE_PLUGIN_ID, userOmpRegistryPath } from "../src/both-installed";

const enabled = { plugins: { [MARKETPLACE_PLUGIN_ID]: [{ installPath: "/x", enabled: true }] } };
const implicitlyEnabled = { plugins: { [MARKETPLACE_PLUGIN_ID]: [{ installPath: "/x" }] } };
const disabled = { plugins: { [MARKETPLACE_PLUGIN_ID]: [{ installPath: "/x", enabled: false }] } };
const other = { plugins: { "foo@bar": [{ installPath: "/y" }] } };
const empty = { plugins: { [MARKETPLACE_PLUGIN_ID]: [] } };
const noPath = { plugins: { [MARKETPLACE_PLUGIN_ID]: [{ enabled: true }] } };
const emptyInstallPath = { plugins: { [MARKETPLACE_PLUGIN_ID]: [{ installPath: "", enabled: true }] } };

// detectDuplicate(projectOmp, userOmp, claudeRegistry) — three explicit registries
// mirroring omp's listClaudePluginRoots (discovery/helpers.ts ~918-1066).

describe("detectDuplicate", () => {
	test("not installed anywhere -> no duplicate", () => {
		expect(detectDuplicate(undefined, undefined, undefined)).toBeUndefined();
		expect(detectDuplicate(other, other, other)).toBeUndefined();
	});

	test("enabled in user omp registry -> omp-registry (entry without enabled counts as enabled)", () => {
		expect(detectDuplicate(undefined, enabled, undefined)).toBe("omp-registry");
		expect(detectDuplicate(undefined, implicitlyEnabled, undefined)).toBe("omp-registry");
	});

	test("enabled only in claude registry -> claude-registry", () => {
		expect(detectDuplicate(undefined, undefined, enabled)).toBe("claude-registry");
		expect(detectDuplicate(undefined, other, implicitlyEnabled)).toBe("claude-registry");
	});

	test("user omp registry is authoritative: disabled entry drops the claude root", () => {
		// omp drops Claude-sourced roots for an id the user registry covers, even when
		// every user entry is disabled (helpers.ts ~992-995) — so nothing stays loaded.
		expect(detectDuplicate(undefined, disabled, enabled)).toBeUndefined();
	});

	test("project registry with an enabled root shadows everything -> omp-registry", () => {
		// Project wins over a disabled user registry and over an enabled Claude registry.
		expect(detectDuplicate(enabled, disabled, undefined)).toBe("omp-registry");
		expect(detectDuplicate(enabled, undefined, enabled)).toBe("omp-registry");
	});

	test("disabled-only PROJECT entry does NOT suppress the Claude root", () => {
		// PROJECT precedence is weak: omp builds projectRoots from enabled
		// entries only (helpers.ts ~1043, 1061), so a disabled-only project entry
		// contributes no shadowing root. With an ABSENT user registry the
		// Claude-sourced root still loads — project precedence cannot drop it.
		// (The companion case — a non-empty USER registry DOES drop it — is pinned
		// by the dedicated "covered user registry" test below, so each name maps
		// to one distinct behaviour.)
		expect(detectDuplicate(disabled, undefined, enabled)).toBe("claude-registry");
	});

	test("project disabled-only with an enabled user registry -> user root wins (omp-registry)", () => {
		// Project contributes nothing; the user registry's enabled root loads.
		expect(detectDuplicate(disabled, enabled, enabled)).toBe("omp-registry");
	});

	test("a covered user registry drops the Claude root even when the project entry is disabled-only", () => {
		// Project disabled-only contributes no project root; the user registry covers
		// the id (non-empty, even all-disabled) and so unconditionally drops the
		// Claude-sourced root (helpers.ts ~992-995) — the plugin is invisible.
		expect(detectDuplicate(disabled, disabled, enabled)).toBeUndefined();
		expect(detectDuplicate(disabled, disabled, undefined)).toBeUndefined();
	});

	test("disabled claude entry is not a duplicate", () => {
		expect(detectDuplicate(undefined, undefined, disabled)).toBeUndefined();
	});

	test("empty entry array is treated as absent (omp skips length-0 arrays)", () => {
		// helpers.ts ~982/1030: `entries.length === 0` -> continue; not authoritative.
		expect(detectDuplicate(empty, empty, enabled)).toBe("claude-registry");
		expect(detectDuplicate(undefined, empty, enabled)).toBe("claude-registry");
		expect(detectDuplicate(empty, undefined, undefined)).toBeUndefined();
	});

	test("enabled entry without a non-empty installPath is not a loaded root", () => {
		// omp skips entries lacking installPath (helpers.ts ~943/998/1039), so this
		// registry never loads a root — no duplicate even though enabled is true.
		// Covers both the absent field (noPath) and an explicit empty string — a
		// truncated/hand-edited installed_plugins.json can carry "installPath": "".
		expect(detectDuplicate(undefined, undefined, noPath)).toBeUndefined();
		expect(detectDuplicate(undefined, noPath, undefined)).toBeUndefined();
		expect(detectDuplicate(undefined, undefined, emptyInstallPath)).toBeUndefined();
		expect(detectDuplicate(undefined, emptyInstallPath, undefined)).toBeUndefined();
	});

	test("pluginId override is honoured", () => {
		expect(detectDuplicate(undefined, undefined, undefined, "other@mp")).toBeUndefined();
		expect(detectDuplicate(other, undefined, undefined, "foo@bar")).toBe("omp-registry");
		// The override must reach the user-registry and Claude-registry lookups
		// too, not just the project slot — otherwise a caller overriding the id
		// gets no detection on those branches.
		expect(detectDuplicate(undefined, undefined, other, "foo@bar")).toBe("claude-registry");
		expect(detectDuplicate(undefined, other, undefined, "foo@bar")).toBe("omp-registry");
	});
});

describe("duplicateMessage", () => {
	test("omp-installed remedy uses omp plugin disable", () => {
		const message = duplicateMessage("omp-registry");
		expect(message).toContain("omp plugin disable ws@ws-marketplace");
		expect(message).toContain("@wsagency/omp-ws");
	});

	test("claude-installed remedy edits the omp user registry, never plugin-overrides disabled[]", () => {
		const message = duplicateMessage("claude-registry");
		expect(message).toContain("installed_plugins.json");
		expect(message).toContain('"enabled": false');
		expect(message).not.toContain("plugin-overrides");
		// The remedy must not pin a hardcoded ~/.omp/plugins path that omp won't read
		// under XDG/profile layouts (finding: profile/XDG-aware discovery).
		expect(message).not.toContain("~/.omp/plugins");
	});
	test("claude-installed remedy names the actual resolved registry when provided", () => {
		// The remedy must point at the file omp's writer targets — here a named
		// profile's registry — never a hardcoded ~/.omp path.
		const resolved = path.join("/home/u", ".omp", "profiles", "work", "plugins", "installed_plugins.json");
		const message = duplicateMessage("claude-registry", resolved);
		expect(message).toContain(resolved);
		expect(message).toContain('"enabled": false');
		expect(message).not.toContain("~/.omp/plugins");
	});

	test("omp-registry remedy is unaffected by the resolved registry path", () => {
		const message = duplicateMessage("omp-registry", "/anywhere/installed_plugins.json");
		expect(message).toContain("omp plugin disable ws@ws-marketplace");
		expect(message).not.toContain("/anywhere");
	});
});

// Pin the path both-installed itself passes to its registry reader and remedy.
// lib/plugin-paths owns the resolver algorithm; exporting this narrow adapter
// keeps a future hardcoded ~/.omp/plugins regression observable here.
describe("userOmpRegistryPath", () => {
	test("follows OMP_PROFILE instead of a hardcoded ~/.omp path", () => {
		const home = "/home/u";
		const resolved = userOmpRegistryPath(home, { OMP_PROFILE: "work" });

		expect(resolved).toBe(path.join(home, ".omp", "profiles", "work", "plugins", "installed_plugins.json"));
		expect(resolved).not.toBe(path.join(home, ".omp", "plugins", "installed_plugins.json"));
	});
});
