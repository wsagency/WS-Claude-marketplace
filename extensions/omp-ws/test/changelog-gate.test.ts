import * as path from "node:path";
import { describe, expect, test } from "bun:test";
import { evaluateChangelogGate, extractCommitType, isGitCommitCommand, resolveCommitCwd } from "../src/changelog-gate";
import { parseDocsConfig, DEFAULT_SKIP_TYPES, touchesChangelog, type DocsConfig } from "../src/lib/docs-config";

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

describe("extractCommitType: clustered short -m flags", () => {
	test("extracts the type from -am (the combined add+message form)", () => {
		expect(extractCommitType('git commit -am "feat: add tool"')).toBe("feat");
	});
	test("extracts the type from -am with scope", () => {
		expect(extractCommitType("git commit -am 'fix(core): repair'")).toBe("fix");
	});
	test("extracts the type from other clusters ending in m (-sm, -nm)", () => {
		expect(extractCommitType('git commit -sm "feat: signed"')).toBe("feat");
		expect(extractCommitType('git commit -nm "chore: noop"')).toBe("chore");
	});
	test("plain -m still matches", () => {
		expect(extractCommitType('git commit -m "feat: x"')).toBe("feat");
	});
	test("--message still matches", () => {
		expect(extractCommitType('git commit --message "docs: notes"')).toBe("docs");
	});
	test("attached -m\"msg\" (no separating space) still matches", () => {
		expect(extractCommitType('git commit -m"feat: x"')).toBe("feat");
	});
	test("attached --message=msg (equals form) still matches", () => {
		expect(extractCommitType('git commit --message="feat: x"')).toBe("feat");
	});
	test("still undefined when no conventional type follows -am", () => {
		expect(extractCommitType('git commit -am "just a message"')).toBeUndefined();
	});
});

describe("resolveCommitCwd: git -C target resolution", () => {
	test("returns cwd unchanged when no -C is present", () => {
		expect(resolveCommitCwd('git commit -m "feat: x"', "/repo")).toBe("/repo");
	});
	test("resolves a relative -C target against cwd", () => {
		expect(resolveCommitCwd('git -C ../other commit -m "feat: x"', "/repo")).toBe(path.resolve("/repo", "../other"));
	});
	test("resolves an absolute -C target", () => {
		expect(resolveCommitCwd('git -C /other commit -m "feat: x"', "/repo")).toBe("/other");
	});
	test("chains repeated -C (each relative to the previous)", () => {
		expect(resolveCommitCwd('git -C /a -C b commit -m "feat: x"', "/repo")).toBe(path.resolve("/a", "b"));
	});
	test("ignores -c <key=value>, which also consumes its next token", () => {
		expect(resolveCommitCwd('git -c user.email=x@y.z -C /other commit -m "feat: x"', "/repo")).toBe("/other");
	});
	test("a -C on a sibling git add does not move the commit target", () => {
		// `git -C ../other add -A && git commit` — the -C scopes only to `add`;
		// the commit still runs in the session repo.
		expect(resolveCommitCwd('git -C ../other add -A && git commit -m "feat: x"', "/repo")).toBe("/repo");
	});
	test("a -C inside the commit message does not retarget the gate", () => {
		// `git commit -m "fix: pass -C /tmp to git"` — the -C is data inside the
		// quoted message, past the `commit` subcommand. The resolver stops at
		// `commit`, so the gate stays on the session repo (a whole-string scan
		// would retarget it at /tmp and pass the gate open on a real fix: commit).
		expect(resolveCommitCwd('git commit -m "fix: pass -C /tmp to git"', "/repo")).toBe("/repo");
	});
	test("a dangling git -C with no operand falls back to cwd", () => {
		// No operand after -C → tokens[i + 1] is undefined → stay on cwd rather
		// than path.resolve(cwd, undefined) throwing inside a PreToolUse hook.
		expect(resolveCommitCwd("git -C", "/repo")).toBe("/repo");
	});
});

describe("touchesChangelog: nested-repo path suffix", () => {
	test("matches CHANGELOG.md at the git root", () => {
		expect(touchesChangelog(["src/app.ts", "CHANGELOG.md"])).toBe(true);
	});
	test("matches a package-scoped CHANGELOG.md (repo-root-relative path)", () => {
		// git diff --cached --name-only prints paths relative to the GIT ROOT,
		// so a dir below the root yields extensions/pkg/CHANGELOG.md.
		expect(touchesChangelog(["src/app.ts", "extensions/pkg/CHANGELOG.md"])).toBe(true);
	});
	test("does not match unrelated markdown", () => {
		expect(touchesChangelog(["src/app.ts", "docs/notes.md"])).toBe(false);
	});
	test("does not match a CHANGELOG.md embedded in a longer basename", () => {
		// `notes/OLD-CHANGELOG.md` and `MY-CHANGELOG.md` carry the substring but
		// the basename is not CHANGELOG.md — a bare endsWith/includes would match.
		expect(touchesChangelog(["notes/OLD-CHANGELOG.md"])).toBe(false);
		expect(touchesChangelog(["MY-CHANGELOG.md"])).toBe(false);
	});
	test("does not match CHANGELOG.md with a trailing extension", () => {
		// CHANGELOG.md.bak carries the string but is not the changelog file.
		expect(touchesChangelog(["CHANGELOG.md.bak"])).toBe(false);
	});
	test("is case-sensitive: docs/changelog.md does not satisfy the gate", () => {
		// The contract matches CHANGELOG.md (and */CHANGELOG.md) exactly — a
		// lowercase mirror is a different file and must not satisfy the gate.
		expect(touchesChangelog(["docs/changelog.md"])).toBe(false);
	});
});

describe("evaluateChangelogGate: satisfiable in nested repos", () => {
	const CODE_STAGED = ["src/app.ts", "src/lib/util.ts"];
	test("passes when a nested CHANGELOG.md path is staged", () => {
		expect(
			evaluateChangelogGate('git commit -m "feat: x"', ENFORCING, [...CODE_STAGED, "extensions/pkg/CHANGELOG.md"]),
		).toBeUndefined();
	});
});
