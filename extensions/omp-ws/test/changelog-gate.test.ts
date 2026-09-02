import * as path from "node:path";
import { describe, expect, test } from "bun:test";
import { evaluateChangelogGate, extractCommitType, isGitCommitCommand, resolveCommitCwd } from "../src/changelog-gate";
import { touchesChangelog } from "../src/lib/docs-config";
import type { ChangelogPolicy } from "../src/lib/project-policy";

const DEFAULT_SKIP_TYPES = ["docs", "chore", "test", "style", "build", "ci"];
const ENFORCING: ChangelogPolicy = {
	updateMode: "commit",
	path: "CHANGELOG.md",
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
	test("passes when canonical mode is pull-request or disabled", () => {
		expect(evaluateChangelogGate('git commit -m "feat: x"', { ...ENFORCING, updateMode: "pull_request" }, CODE_STAGED)).toBeUndefined();
		expect(evaluateChangelogGate('git commit -m "feat: x"', { ...ENFORCING, updateMode: "disabled" }, CODE_STAGED)).toBeUndefined();
	});
	test("passes when nothing staged", () => {
		expect(evaluateChangelogGate('git commit -m "feat: x"', ENFORCING, [])).toBeUndefined();
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

describe("touchesChangelog: canonical repository-relative path", () => {
	test("matches the configured path exactly", () => {
		expect(touchesChangelog(["src/app.ts", "CHANGELOG.md"], "CHANGELOG.md")).toBe(true);
		expect(touchesChangelog(["src/app.ts", "extensions/pkg/CHANGELOG.md"], "extensions/pkg/CHANGELOG.md")).toBe(true);
	});
	test("does not let an unrelated changelog satisfy policy", () => {
		expect(touchesChangelog(["extensions/pkg/CHANGELOG.md"], "CHANGELOG.md")).toBe(false);
		expect(touchesChangelog(["CHANGELOG.md"], "HISTORY.md")).toBe(false);
	});
	test("does not match unrelated markdown or longer basenames", () => {
		expect(touchesChangelog(["docs/notes.md"], "CHANGELOG.md")).toBe(false);
		expect(touchesChangelog(["notes/OLD-CHANGELOG.md"], "CHANGELOG.md")).toBe(false);
		expect(touchesChangelog(["CHANGELOG.md.bak"], "CHANGELOG.md")).toBe(false);
	});
});

describe("evaluateChangelogGate: configured nested path", () => {
	const CODE_STAGED = ["src/app.ts", "src/lib/util.ts"];
	test("passes when the configured nested changelog is staged", () => {
		const policy = { ...ENFORCING, path: "extensions/pkg/CHANGELOG.md" };
		expect(
			evaluateChangelogGate('git commit -m "feat: x"', policy, [...CODE_STAGED, policy.path]),
		).toBeUndefined();
	});
});
