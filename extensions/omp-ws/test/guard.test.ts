import { describe, expect, test } from "bun:test";
import { evaluateGuard, isInsideCwd, splitSegments, tokenize } from "../src/guard";

const CWD = "/Users/dev/project";
const HOME = "/Users/dev";

function blocked(command: string): boolean {
	return evaluateGuard(command, CWD, HOME) !== undefined;
}

describe("git push force", () => {
	test("blocks git push --force", () => {
		expect(blocked("git push --force")).toBe(true);
	});
	test("blocks git push -f", () => {
		expect(blocked("git push -f origin main")).toBe(true);
	});
	test("blocks bundled short cluster with f", () => {
		expect(blocked("git push -uf origin main")).toBe(true);
	});
	test("allows --force-with-lease", () => {
		expect(blocked("git push --force-with-lease")).toBe(false);
		expect(blocked("git push --force-with-lease=origin/main origin main")).toBe(false);
	});
	test("allows plain push", () => {
		expect(blocked("git push origin main")).toBe(false);
	});
	test("blocks force push in a compound command", () => {
		expect(blocked("git add -A && git commit -m 'x' && git push --force")).toBe(true);
	});
	test("handles git global flags before the subcommand", () => {
		expect(blocked("git -C /somewhere push --force")).toBe(true);
	});
	test("push reason suggests force-with-lease", () => {
		const verdict = evaluateGuard("git push --force", CWD, HOME);
		expect(verdict?.reason).toContain("--force-with-lease");
	});
	test("does not confuse other commands mentioning force", () => {
		expect(blocked("echo 'git push --force is dangerous'")).toBe(false);
	});
});

describe("git reset --hard origin/*", () => {
	test("blocks reset --hard origin/main", () => {
		expect(blocked("git reset --hard origin/main")).toBe(true);
	});
	test("allows reset --hard HEAD~1", () => {
		expect(blocked("git reset --hard HEAD~1")).toBe(false);
	});
	test("allows reset --soft origin/main", () => {
		expect(blocked("git reset --soft origin/main")).toBe(false);
	});
	test("blocks reset --hard upstream/main", () => {
		expect(blocked("git reset --hard upstream/main")).toBe(true);
	});
	test("blocks reset --hard @{u} forms", () => {
		expect(blocked("git reset --hard @{u}")).toBe(true);
		expect(blocked("git reset --hard main@{upstream}")).toBe(true);
	});
});

describe("shell wrappers", () => {
	test("blocks bash -c wrapped force push", () => {
		expect(blocked('bash -c "git push --force"')).toBe(true);
	});
	test("blocks sh -c wrapped reset --hard origin", () => {
		expect(blocked("sh -c 'git reset --hard origin/main'")).toBe(true);
	});
	test("blocks zsh -c wrapped clean -fd", () => {
		expect(blocked('zsh -c "git clean -fd"')).toBe(true);
	});
	test("allows safe wrapped commands", () => {
		expect(blocked('bash -c "git push origin main"')).toBe(false);
	});
});

describe("git clean", () => {
	test("blocks git clean -fd", () => {
		expect(blocked("git clean -fd")).toBe(true);
	});
	test("blocks git clean -fdx", () => {
		expect(blocked("git clean -fdx")).toBe(true);
	});
	test("blocks separate -f -d flags", () => {
		expect(blocked("git clean -f -d")).toBe(true);
	});
	test("allows dry run", () => {
		expect(blocked("git clean -nd")).toBe(false);
		expect(blocked("git clean --dry-run -d --force")).toBe(false);
	});
	test("allows plain git clean -f (files only)", () => {
		expect(blocked("git clean -f")).toBe(false);
	});
});

describe("rm -rf containment", () => {
	test("blocks rm -rf /", () => {
		expect(blocked("rm -rf /")).toBe(true);
	});
	test("blocks absolute path outside cwd", () => {
		expect(blocked("rm -rf /tmp/whatever")).toBe(true);
	});
	test("blocks home tilde", () => {
		expect(blocked("rm -rf ~/things")).toBe(true);
	});
	test("blocks parent escape", () => {
		expect(blocked("rm -rf ../sibling")).toBe(true);
	});
	test("blocks sneaky parent escape through a subdir", () => {
		expect(blocked("rm -rf sub/../../outside")).toBe(true);
	});
	test("allows relative path inside cwd", () => {
		expect(blocked("rm -rf node_modules")).toBe(false);
		expect(blocked("rm -rf ./dist build")).toBe(false);
	});
	test("allows absolute path inside cwd subtree", () => {
		expect(blocked(`rm -rf ${CWD}/dist`)).toBe(false);
	});
	test("blocks variable operands (cannot resolve statically)", () => {
		expect(blocked("rm -rf $HOME/stuff")).toBe(true);
	});
	test("allows rm without -rf", () => {
		expect(blocked("rm file.txt")).toBe(false);
		expect(blocked("rm -r somedir")).toBe(false);
	});
	test("blocks rm -fr order too", () => {
		expect(blocked("rm -fr /etc")).toBe(true);
	});
	test("blocks sudo rm -rf outside", () => {
		expect(blocked("sudo rm -rf /var/log")).toBe(true);
	});
	test("glob inside cwd is allowed, glob outside blocked", () => {
		expect(blocked("rm -rf node_modules/*")).toBe(false);
		expect(blocked("rm -rf /tmp/x/*")).toBe(true);
	});
});

describe("helpers", () => {
	test("splitSegments handles &&, ;, |", () => {
		expect(splitSegments("a && b; c | d")).toEqual(["a", "b", "c", "d"]);
	});
	test("tokenize strips surrounding quotes", () => {
		expect(tokenize(`git commit -m "feat: x"`)).toEqual(["git", "commit", "-m", "feat:", "x"]);
	});
	test("isInsideCwd resolves . and cwd itself", () => {
		expect(isInsideCwd(".", CWD, HOME)).toBe(true);
		expect(isInsideCwd("..", CWD, HOME)).toBe(false);
		expect(isInsideCwd("~", CWD, HOME)).toBe(false);
	});
});
