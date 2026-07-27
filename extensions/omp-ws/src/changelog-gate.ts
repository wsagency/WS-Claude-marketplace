/**
 * Changelog gate: `tool_call` hook on bash `git commit` commands — the omp
 * port of hooks/enforce-changelog.sh.
 *
 * Only enforces when `.claude/docs-config.yaml` in cwd sets
 * `auto.changelog_per_commit: true` (PR-time is the canonical WS timing;
 * per-commit is opt-in). Skip types (docs/chore/test/style/build/ci by
 * default) pass; commits whose type cannot be extracted from `-m` pass;
 * staged sets that are docs-only or already include CHANGELOG.md pass.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { splitSegments, tokenize } from "./guard";
import { hasCodeChanges, loadDocsConfig, touchesChangelog, type DocsConfig } from "./lib/docs-config";
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
 * Best-effort extraction of the Conventional Commits type from a `-m`
 * message inside the command string. Returns undefined when no type can be
 * extracted (multi-line heredocs, -F files, editor commits) — callers PASS
 * in that case.
 */
export function extractCommitType(command: string): string | undefined {
	const unescaped = command.replace(/\\"/g, '"');
	const match = /(?:-m|--message)[=\s]*["']([^"']*)["']/.exec(unescaped);
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
			const config = await loadDocsConfig(cwd);
			if (!config.exists || !config.enforceViaHooks || !config.changelogPerCommit) return;

			const staged = await stagedFiles(cwd);
			const reason = evaluateChangelogGate(command, config, staged);
			if (reason !== undefined) return { block: true, reason };
		} catch (error) {
			// Fail-open: a gate bug must never block every commit.
			pi.logger.warn(`ws-changelog-gate: internal error, allowing commit: ${String(error)}`);
			return;
		}
	});
}
