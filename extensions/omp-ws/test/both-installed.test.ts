import { describe, expect, test } from "bun:test";
import { detectDuplicate, duplicateMessage, MARKETPLACE_PLUGIN_ID } from "../src/both-installed";

const enabled = { plugins: { [MARKETPLACE_PLUGIN_ID]: [{ installPath: "/x", enabled: true }] } };
const implicitlyEnabled = { plugins: { [MARKETPLACE_PLUGIN_ID]: [{ installPath: "/x" }] } };
const disabled = { plugins: { [MARKETPLACE_PLUGIN_ID]: [{ installPath: "/x", enabled: false }] } };
const other = { plugins: { "foo@bar": [{ installPath: "/y" }] } };

describe("detectDuplicate", () => {
	test("not installed anywhere -> no duplicate", () => {
		expect(detectDuplicate([undefined, undefined], undefined)).toBeUndefined();
		expect(detectDuplicate([other, other], other)).toBeUndefined();
	});

	test("enabled in omp registry -> omp-registry (entry without enabled counts as enabled)", () => {
		expect(detectDuplicate([undefined, enabled], undefined)).toBe("omp-registry");
		expect(detectDuplicate([undefined, implicitlyEnabled], undefined)).toBe("omp-registry");
	});

	test("enabled only in claude registry -> claude-registry", () => {
		expect(detectDuplicate([undefined, undefined], enabled)).toBe("claude-registry");
		expect(detectDuplicate([undefined, other], implicitlyEnabled)).toBe("claude-registry");
	});

	test("omp registry is authoritative: disabled entry suppresses the claude root", () => {
		expect(detectDuplicate([undefined, disabled], enabled)).toBeUndefined();
	});

	test("project omp registry wins over user omp registry", () => {
		expect(detectDuplicate([disabled, enabled], enabled)).toBeUndefined();
		expect(detectDuplicate([enabled, disabled], undefined)).toBe("omp-registry");
	});

	test("disabled claude entry is not a duplicate", () => {
		expect(detectDuplicate([undefined, undefined], disabled)).toBeUndefined();
	});
});

describe("duplicateMessage", () => {
	test("omp-installed remedy uses omp plugin disable", () => {
		const message = duplicateMessage("omp-registry");
		expect(message).toContain("omp plugin disable ws@ws-marketplace");
		expect(message).toContain("@wsagency/omp-ws");
	});

	test("claude-installed remedy edits the omp registry, never plugin-overrides disabled[]", () => {
		const message = duplicateMessage("claude-registry");
		expect(message).toContain("installed_plugins.json");
		expect(message).toContain('"enabled": false');
		expect(message).not.toContain("plugin-overrides");
	});
});
