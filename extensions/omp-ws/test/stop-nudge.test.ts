import { describe, expect, test } from "bun:test";
import { mergeDriftFiles, shouldNudge } from "../src/stop-nudge";
import type { ChangelogPolicy } from "../src/lib/project-policy";

const ENABLED: ChangelogPolicy = {
	updateMode: "pull_request",
	path: "CHANGELOG.md",
	skipTypes: [],
};

describe("shouldNudge", () => {
	test("nudges on code drift without changelog", () => {
		expect(shouldNudge(ENABLED, ["src/app.ts"])).toBe(true);
	});
	test("silent when changelog policy is absent", () => {
		expect(shouldNudge(undefined, ["src/app.ts"])).toBe(false);
	});
	test("silent when changelog updates are disabled", () => {
		expect(shouldNudge({ ...ENABLED, updateMode: "disabled" }, ["src/app.ts"])).toBe(false);
	});
	test("silent when tree is clean", () => {
		expect(shouldNudge(ENABLED, [])).toBe(false);
	});
	test("silent for docs-only drift", () => {
		expect(shouldNudge(ENABLED, ["docs/a.md", "dev-docs/b.md", "README.md"])).toBe(false);
	});
	test("silent when the configured changelog is part of the drift", () => {
		expect(shouldNudge(ENABLED, ["src/app.ts", "CHANGELOG.md"])).toBe(false);
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
		expect(shouldNudge(ENABLED, ["src/brand-new.ts"])).toBe(true);
	});
	test("uses the canonical nested changelog path", () => {
		const nested = { ...ENABLED, path: "packages/app/CHANGELOG.md" };
		expect(shouldNudge(nested, ["src/app.ts", nested.path])).toBe(false);
		expect(shouldNudge(ENABLED, ["src/app.ts", nested.path])).toBe(true);
	});
});
