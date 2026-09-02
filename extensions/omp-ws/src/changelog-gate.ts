/**
 * Canonical changelog gate for `git commit`. It enforces only
 * `changelog.update_mode: commit`; all paths and skip types come from the
 * strict repository policy, with no legacy configuration fallback.
 */
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { splitSegments, tokenize } from "./guard";
import { hasCodeChanges, touchesChangelog } from "./lib/changelog-files";
import {
	loadRepositoryPolicyFromRoot,
	missingPolicyCapability,
	repositoryPolicyProblem,
	type ChangelogPolicy,
} from "./lib/project-policy";
import { run } from "./lib/exec";
import { stagedFiles } from "./lib/git";

export const CHANGELOG_BLOCK_REASON =
	"Code changes staged without the configured changelog entry. Add an entry under [Unreleased] via /ws-docs changelog (or the ws_changelog tool), or stage the configured changelog before committing.";

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
 * Resolve the repository root git would operate on from <target>. Canonical
 * policy and staged paths are both repository-root relative. Returns <target>
 * unchanged off-repository, where the gate becomes a no-op unless legacy WS
 * policy is detected directly there.
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
export function evaluateChangelogGate(command: string, policy: ChangelogPolicy, staged: string[]): string | undefined {
	if (policy.updateMode !== "commit") return undefined;
	if (staged.length === 0) return undefined;
	if (!hasCodeChanges(staged)) return undefined;
	if (touchesChangelog(staged, policy.path)) return undefined;

	const commitType = extractCommitType(command);
	if (commitType === undefined) return undefined;
	if (policy.skipTypes.includes(commitType)) return undefined;

	return `${CHANGELOG_BLOCK_REASON} Expected path: ${policy.path}.`;
}

export function registerChangelogGate(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;
		try {
			const input = event.input as { command?: unknown; cwd?: unknown };
			const command = typeof input.command === "string" ? input.command : "";
			if (!isGitCommitCommand(command)) return;

			const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : ctx.cwd;
			const target = resolveCommitCwd(command, cwd);
			const repoRoot = await resolveRepoRoot(target);
			const state = await loadRepositoryPolicyFromRoot(repoRoot);
			const policyProblem = repositoryPolicyProblem(state, "ws-changelog-gate", ["documentation"]);
			if (policyProblem !== undefined) return { block: true, reason: policyProblem };
			if (state.status !== "valid") return;
			if (!state.config?.changelog) {
				return { block: true, reason: missingPolicyCapability("ws-changelog-gate", "changelog policy") };
			}
			if (state.config.changelog.update_mode !== "commit") return;

			const staged = await stagedFiles(repoRoot);
			const reason = evaluateChangelogGate(command, {
				updateMode: state.config.changelog.update_mode,
				path: state.config.changelog.path,
				skipTypes: state.config.changelog.skip_types,
			}, staged);
			if (reason !== undefined) return { block: true, reason };
		} catch (error) {
			pi.logger.warn(`ws-changelog-gate: internal error, allowing commit: ${String(error)}`);
			return;
		}
	});
}
