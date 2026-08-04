import { describe, expect, test } from "bun:test";
import { mergeDriftFiles, shouldNudge } from "../src/stop-nudge";

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

describe("mergeDriftFiles: untracked files count as drift", () => {
	test("unions uncommitted and untracked, deduped and sorted", () => {
		expect(mergeDriftFiles(["src/a.ts", "src/b.ts"], ["src/a.ts", "src/new.ts"])).toEqual([
			"src/a.ts",
			"src/b.ts",
			"src/new.ts",
		]);
	});
	test("includes brand-new files when nothing is tracked-dirty (the bug)", () => {
		// Before the fix uncommittedFiles returned [] for brand-new files, so the
		// drift set was empty and the nudge never fired for new code.
		expect(mergeDriftFiles([], ["src/brand-new.ts"])).toEqual(["src/brand-new.ts"]);
	});
	test("empty only when both sources are empty", () => {
		expect(mergeDriftFiles([], [])).toEqual([]);
	});
});

describe("shouldNudge: untracked + nested-changelog contract", () => {
	test("nudges when only untracked new source files exist", () => {
		// driftFiles now feeds untracked files in, so a brand-new code file with
		// no tracked changes still triggers the reminder.
		expect(shouldNudge(true, true, ["src/brand-new.ts"])).toBe(true);
	});
	test("silent when a nested CHANGELOG.md (repo-root-relative path) is in the drift", () => {
		expect(shouldNudge(true, true, ["src/app.ts", "packages/app/CHANGELOG.md"])).toBe(false);
	});
});
