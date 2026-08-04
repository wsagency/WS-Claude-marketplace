/**
 * Changelog gate: `tool_call` hook on bash `git commit` commands — the omp
 * port of hooks/enforce-changelog.sh.
 *
 * Only enforces when `.claude/docs-config.yaml` at the commit's repository root sets
 * `auto.changelog_per_commit: true` (PR-time is the canonical WS timing;
 * per-commit is opt-in). Skip types (docs/chore/test/style/build/ci by
 * default) pass; commits whose type cannot be extracted from `-m` pass;
 * staged sets that are docs-only or already include CHANGELOG.md pass.
 */
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { splitSegments, tokenize } from "./guard";
import { hasCodeChanges, loadDocsConfig, touchesChangelog, type DocsConfig } from "./lib/docs-config";
import { run } from "./lib/exec";
import { stagedFiles } from "./lib/git";

export const CHANGELOG_BLOCK_REASON =
	"Code changes staged without a CHANGELOG.md entry. Add an entry under [Unreleased] via /ws-docs changelog (or the ws_changelog tool), or stage CHANGELOG.md manually. To bypass once, prefix the commit with a skip type (docs:, chore:, test:, style:, build:, ci:).";

/** True when the bash command is a `git commit` this gate should look at. */
export function isGitCommitCommand(command: string): boolean {
	if (command.includes("--allow-empty")) return false;
	for (const segment of splitSegments(command)) {
		const tokens = tokenize(segment);
		const gitIndex = tokens.indexOf("git");
		if (gitIndex === -1) continue;
		// Skip git global options (-C <dir>, -c <k=v>, --no-pager, ...) to find the subcommand.
		let index = gitIndex + 1;
		while (index < tokens.length) {
			const token = tokens[index] as string;
			if (token === "-C" || token === "-c") {
				index += 2;
				continue;
			}
			if (token.startsWith("-")) {
				index += 1;
				continue;
			}
			break;
		}
		if (tokens[index] === "commit") return true;
	}
	return false;
}

/**
 * Resolve the directory a `git commit` command actually targets. `git -C <dir>
 * commit` runs against <dir> (relative to cwd; repeatable, each chained to the
 * last), so the gate must read THAT repo's docs-config and staged set, not the
 * session repo's. Returns cwd unchanged when no -C is present.
 */
export function resolveCommitCwd(command: string, cwd: string): string {
	for (const segment of splitSegments(command)) {
		const tokens = tokenize(segment);
		const gitIndex = tokens.indexOf("git");
		if (gitIndex === -1) continue;
		let index = gitIndex + 1;
		let target = cwd;
		let isCommit = false;
		while (index < tokens.length) {
			const token = tokens[index] as string;
			if (token === "-C") {
				const operand = tokens[index + 1];
				if (operand !== undefined) target = path.resolve(target, operand);
				index += operand !== undefined ? 2 : 1;
				continue;
			}
			if (token === "-c") {
				index += 2; // config key=value — consumes the next token, not a path
				continue;
			}
			if (token.startsWith("-")) {
				index += 1;
				continue;
			}
			isCommit = token === "commit"; // first non-option token is the subcommand
			break;
		}
		// Only the segment that runs `git commit` carries the -C target that
		// applies to the commit — a -C on a sibling `git add` does not move it.
		if (isCommit) return target;
	}
	return cwd;
}

/**
 * Resolve the repository root git would operate on from <target>. `git diff`
 * walks up to the work-tree top and reports root-relative paths, but
 * loadDocsConfig reads <dir>/.claude/docs-config.yaml without walking — so a
 * `-C <subdir>` commit in a root-config/nested-package layout (this very repo)
 * would miss the governing config and silently skip the gate. Returns <target>
 * unchanged when git cannot resolve a work tree (fail-open: missing config ⇒
 * exists:false ⇒ gate off).
 */
async function resolveRepoRoot(target: string): Promise<string> {
	const result = await run("git", ["rev-parse", "--show-toplevel"], { cwd: target });
	const top = result.code === 0 ? result.stdout.trim() : "";
	return top !== "" ? top : target;
}

/**
 * Best-effort extraction of the Conventional Commits type from a `-m` /
 * `--message` argument, including clustered short flags such as `-am` /
 * `-sm` (the most common combined form, which contains no standalone `-m`
 * token). Returns undefined when no type can be extracted (multi-line
 * heredocs, -F files, editor commits) — callers PASS in that case.
 */
export function extractCommitType(command: string): string | undefined {
	const unescaped = command.replace(/\\"/g, '"');
	// `-[A-Za-z]*m` matches -m and any short cluster ending in m (-am, -sm, …);
	// --message is the long form. `(?:^|\s)` pins the match to a token start so
	// the tail of an unrelated long flag (--rm, --form, --stream) cannot win.
	const match = /(?:^|\s)(?:-[A-Za-z]*m|--message)[=\s]*["']([^"']*)["']/.exec(unescaped);
	if (!match) return undefined;
	const message = match[1] ?? "";
	const type = /^([a-z]+)[(:!]/.exec(message);
	return type?.[1];
}

/**
 * Pure decision core (config and staged set already gathered).
 * Returns a block reason, or undefined to allow the commit.
 */
export function evaluateChangelogGate(command: string, config: DocsConfig, staged: string[]): string | undefined {
	if (!config.exists) return undefined;
	if (!config.enforceViaHooks) return undefined;
	if (!config.changelogPerCommit) return undefined;
	if (staged.length === 0) return undefined;
	if (!hasCodeChanges(staged)) return undefined;
	if (touchesChangelog(staged)) return undefined;

	const commitType = extractCommitType(command);
	if (commitType === undefined) return undefined; // not extractable → pass
	if (config.skipTypes.includes(commitType)) return undefined;

	return CHANGELOG_BLOCK_REASON;
}

export function registerChangelogGate(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;
		try {
			const input = event.input as { command?: unknown; cwd?: unknown };
			const command = typeof input.command === "string" ? input.command : "";
			if (!isGitCommitCommand(command)) return;

			const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : ctx.cwd;
			// `git -C <dir> commit` targets <dir>, not the session repo. loadDocsConfig
			// reads <dir>/.claude/docs-config.yaml without walking up to the repo root
			// the way `git diff` does, so resolve the root once and use it for both the
			// config lookup and the staged-file query (falls back to <dir> off-repo).
			const target = resolveCommitCwd(command, cwd);
			const repoRoot = await resolveRepoRoot(target);
			const config = await loadDocsConfig(repoRoot);
			if (!config.exists || !config.enforceViaHooks || !config.changelogPerCommit) return;

			const staged = await stagedFiles(repoRoot);
			const reason = evaluateChangelogGate(command, config, staged);
			if (reason !== undefined) return { block: true, reason };
		} catch (error) {
			// Fail-open: a gate bug must never block every commit.
			pi.logger.warn(`ws-changelog-gate: internal error, allowing commit: ${String(error)}`);
			return;
		}
	});
}
