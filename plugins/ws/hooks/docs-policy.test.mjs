import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const HOOK_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PRE_COMMIT_HOOK = path.join(HOOK_ROOT, "enforce-changelog.sh");
const STOP_HOOK = path.join(HOOK_ROOT, "enforce-stop.sh");

function git(root, ...args) {
	const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	return result.stdout;
}

async function write(root, target, content) {
	await mkdir(path.dirname(path.join(root, target)), { recursive: true });
	await writeFile(path.join(root, target), content, "utf8");
}

async function withRepository(run) {
	const root = await mkdtemp(path.join(tmpdir(), "ws-docs-hook-"));
	try {
		git(root, "init", "-q");
		git(root, "config", "user.name", "WS Test");
		git(root, "config", "user.email", "ws-test@example.invalid");
		await write(root, "src/app.js", "export const value = 1;\n");
		git(root, "add", "src/app.js");
		git(root, "commit", "-qm", "test: initial fixture");
		return await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

function invoke(hook, root, input = "{}") {
	const result = spawnSync("bash", [hook], {
		cwd: root,
		encoding: "utf8",
		input,
		env: { ...process.env, NODE_BINARY: process.execPath },
	});
	assert.equal(result.status, 0, result.stderr);
	return result.stdout.trim();
}

function event(command) {
	return JSON.stringify({ tool_name: "Bash", tool_input: { command } });
}

function canonical(updateMode = "commit") {
	return `schema_version: 1

changelog:
  update_mode: ${updateMode}
  path: changes/NEWS.md
  skip_types: [docs, chore]

docs:
  user_track: handbook
  dev_track: engineering/docs
  default_audience: ask
  default_scope: repo
  adr_for_arch_changes: true
`;
}

test("pre-commit hook enforces canonical changelog path and configured cadence", async () => {
	await withRepository(async root => {
		await write(root, ".wsagency/config.yaml", canonical());
		git(root, "add", ".wsagency/config.yaml");
		git(root, "commit", "-qm", "chore: configure fixture");
		await write(root, "src/app.js", "export const value = 2;\n");
		git(root, "add", "src/app.js");

		const denied = JSON.parse(invoke(PRE_COMMIT_HOOK, root, event("git commit -m \"feat: change behavior\"")));
		assert.equal(denied.hookSpecificOutput.permissionDecision, "deny");
		assert.match(denied.hookSpecificOutput.permissionDecisionReason, /changes\/NEWS\.md/);

		await write(root, "changes/NEWS.md", "# News\n\n## Unreleased\n\n- Changed behavior.\n");
		git(root, "add", "changes/NEWS.md");
		assert.equal(invoke(PRE_COMMIT_HOOK, root, event("git commit -m \"feat: change behavior\"")), "");
	});
});

test("pull-request changelog cadence leaves commit and stop hooks inactive", async () => {
	await withRepository(async root => {
		await write(root, ".wsagency/config.yaml", canonical("pull_request"));
		await write(root, "src/app.js", "export const value = 2;\n");
		git(root, "add", ".wsagency/config.yaml", "src/app.js");
		assert.equal(invoke(PRE_COMMIT_HOOK, root, event("git commit -m \"feat: change behavior\"")), "");
		assert.equal(invoke(STOP_HOOK, root), "");
	});
});

test("legacy docs policy blocks by source and directs migration without parsing values", async () => {
	await withRepository(async root => {
		await write(root, ".claude/docs-config.yaml", "auto:\n  changelog_per_commit: false\n  enforce_via_hooks: false\n");
		await write(root, "src/app.js", "export const value = 2;\n");
		git(root, "add", ".claude/docs-config.yaml", "src/app.js");
		const denied = JSON.parse(invoke(PRE_COMMIT_HOOK, root, event("git commit -m \"feat: change behavior\"")));
		assert.match(denied.hookSpecificOutput.permissionDecisionReason, /\.claude\/docs-config\.yaml/);
		assert.match(denied.hookSpecificOutput.permissionDecisionReason, /\/ws-setup/);
	});
});

test("legacy setup policy blocks stop by source and directs migration", async () => {
	await withRepository(async root => {
		await write(root, ".claude/ws-project.yaml", "changelog:\n  update_mode: disabled\n");
		await write(root, "src/app.js", "export const value = 2;\n");
		const blocked = JSON.parse(invoke(STOP_HOOK, root));
		assert.equal(blocked.decision, "block");
		assert.match(blocked.reason, /\.claude\/ws-project\.yaml/);
		assert.match(blocked.reason, /\/ws-setup/);
	});
});

test("a hub parent policy is never inherited by a child repository at runtime", async () => {
	await withRepository(async hub => {
		await write(hub, ".wsagency/config.yaml", canonical());
		const child = path.join(hub, "child");
		await mkdir(child);
		git(child, "init", "-q");
		git(child, "config", "user.name", "WS Test");
		git(child, "config", "user.email", "ws-test@example.invalid");
		await write(child, "src/app.js", "export const child = 1;\n");
		git(child, "add", "src/app.js");
		git(child, "commit", "-qm", "test: child fixture");
		await write(child, "src/app.js", "export const child = 2;\n");
		git(child, "add", "src/app.js");
		assert.equal(invoke(PRE_COMMIT_HOOK, child, event("git commit -m \"feat: child change\"")), "");
	});
});
