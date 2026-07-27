import { describe, expect, test } from "bun:test";
import { evaluateChangelogGate, extractCommitType, isGitCommitCommand } from "../src/changelog-gate";
import { parseDocsConfig, DEFAULT_SKIP_TYPES, type DocsConfig } from "../src/lib/docs-config";

const ENFORCING: DocsConfig = {
	exists: true,
	enforceViaHooks: true,
	changelogPerCommit: true,
	skipTypes: DEFAULT_SKIP_TYPES,
};

describe("isGitCommitCommand", () => {
	test("matches plain git commit", () => {
		expect(isGitCommitCommand('git commit -m "feat: x"')).toBe(true);
	});
	test("matches compound commands", () => {
		expect(isGitCommitCommand('git add -A && git commit -m "fix: y"')).toBe(true);
	});
	test("skips --allow-empty", () => {
		expect(isGitCommitCommand("git commit --allow-empty -m 'chore: trigger'")).toBe(false);
	});
	test("ignores non-commit commands", () => {
		expect(isGitCommitCommand("git status")).toBe(false);
		expect(isGitCommitCommand("npm run commitlint")).toBe(false);
	});
	test("ignores non-commit git commands mentioning commit elsewhere", () => {
		expect(isGitCommitCommand("git add -A && echo commit")).toBe(false);
	});
	test("recognizes commit behind git global options", () => {
		expect(isGitCommitCommand('git -C /repo commit -m "feat: x"')).toBe(true);
	});
});

describe("extractCommitType", () => {
	test("extracts type from -m with colon", () => {
		expect(extractCommitType('git commit -m "feat: add tool"')).toBe("feat");
	});
	test("extracts type with scope and bang", () => {
		expect(extractCommitType("git commit -m 'fix(core): repair'")).toBe("fix");
		expect(extractCommitType('git commit -m "feat!: breaking"')).toBe("feat");
	});
	test("handles escaped JSON quotes", () => {
		expect(extractCommitType('git commit -m \\"docs: readme\\"')).toBe("docs");
	});
	test("undefined when no -m message", () => {
		expect(extractCommitType("git commit")).toBeUndefined();
		expect(extractCommitType("git commit -F msg.txt")).toBeUndefined();
	});
	test("undefined when message has no conventional type", () => {
		expect(extractCommitType('git commit -m "just a message"')).toBeUndefined();
	});
});

describe("evaluateChangelogGate", () => {
	const CODE_STAGED = ["src/app.ts", "src/lib/util.ts"];

	test("blocks code commit without changelog", () => {
		expect(evaluateChangelogGate('git commit -m "feat: x"', ENFORCING, CODE_STAGED)).toBeDefined();
	});
	test("passes when CHANGELOG.md staged", () => {
		expect(evaluateChangelogGate('git commit -m "feat: x"', ENFORCING, [...CODE_STAGED, "CHANGELOG.md"])).toBeUndefined();
	});
	test("passes docs-only staged set", () => {
		expect(evaluateChangelogGate('git commit -m "feat: x"', ENFORCING, ["docs/guide.md", "dev-docs/notes.md", "README.md"])).toBeUndefined();
	});
	test("passes skip types", () => {
		for (const type of DEFAULT_SKIP_TYPES) {
			expect(evaluateChangelogGate(`git commit -m "${type}: z"`, ENFORCING, CODE_STAGED)).toBeUndefined();
		}
	});
	test("passes when type not extractable", () => {
		expect(evaluateChangelogGate("git commit", ENFORCING, CODE_STAGED)).toBeUndefined();
		expect(evaluateChangelogGate("git commit -F msg.txt", ENFORCING, CODE_STAGED)).toBeUndefined();
	});
	test("passes when per-commit enforcement off", () => {
		expect(evaluateChangelogGate('git commit -m "feat: x"', { ...ENFORCING, changelogPerCommit: false }, CODE_STAGED)).toBeUndefined();
	});
	test("passes when enforce_via_hooks false", () => {
		expect(evaluateChangelogGate('git commit -m "feat: x"', { ...ENFORCING, enforceViaHooks: false }, CODE_STAGED)).toBeUndefined();
	});
	test("passes when nothing staged", () => {
		expect(evaluateChangelogGate('git commit -m "feat: x"', ENFORCING, [])).toBeUndefined();
	});
});

describe("parseDocsConfig against the real WS shape", () => {
	const REAL_CONFIG = `docs:
  initialized: 2026-05-29
  version: 1
  user_track: docs
  dev_track: dev-docs
  default_audience: ask
  auto:
    changelog_per_commit: true
    adr_for_arch_changes: true
    enforce_via_hooks: true
  surface:
    subagent_status: compact
`;

	test("reads nested auto keys like the shell awk does", () => {
		const config = parseDocsConfig(REAL_CONFIG);
		expect(config.changelogPerCommit).toBe(true);
		expect(config.enforceViaHooks).toBe(true);
		expect(config.skipTypes).toEqual(DEFAULT_SKIP_TYPES);
	});

	test("explicit false disables", () => {
		const config = parseDocsConfig(REAL_CONFIG.replace("enforce_via_hooks: true", "enforce_via_hooks: false"));
		expect(config.enforceViaHooks).toBe(false);
	});

	test("absent changelog_per_commit means off", () => {
		const config = parseDocsConfig("docs:\n  auto:\n    enforce_via_hooks: true\n");
		expect(config.changelogPerCommit).toBe(false);
	});

	test("custom skip_types flow list, with ws-project fallback", () => {
		const config = parseDocsConfig('docs:\n  auto:\n    changelog_per_commit: true\nchangelog:\n  skip_types: [docs, "chore", wip]\n');
		expect(config.skipTypes).toEqual(["docs", "chore", "wip"]);

		const fallback = parseDocsConfig("docs:\n  auto:\n    changelog_per_commit: true\n", "changelog:\n  skip_types: [docs]\n");
		expect(fallback.skipTypes).toEqual(["docs"]);
	});
});
