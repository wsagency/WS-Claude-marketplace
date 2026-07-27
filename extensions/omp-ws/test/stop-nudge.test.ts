import { describe, expect, test } from "bun:test";
import { shouldNudge } from "../src/stop-nudge";

describe("shouldNudge", () => {
	test("nudges on code drift without changelog", () => {
		expect(shouldNudge(true, true, ["src/app.ts"])).toBe(true);
	});
	test("silent when config absent", () => {
		expect(shouldNudge(false, true, ["src/app.ts"])).toBe(false);
	});
	test("silent when enforcement disabled", () => {
		expect(shouldNudge(true, false, ["src/app.ts"])).toBe(false);
	});
	test("silent when tree is clean", () => {
		expect(shouldNudge(true, true, [])).toBe(false);
	});
	test("silent for docs-only drift", () => {
		expect(shouldNudge(true, true, ["docs/a.md", "dev-docs/b.md", "README.md"])).toBe(false);
	});
	test("silent when CHANGELOG.md is part of the drift", () => {
		expect(shouldNudge(true, true, ["src/app.ts", "CHANGELOG.md"])).toBe(false);
	});
});
