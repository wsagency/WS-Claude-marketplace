/**
 * Non-blocking changelog drift reminder driven by canonical repository policy.
 * It follows the configured changelog mode and path and reports legacy/invalid
 * policy without preventing the session from stopping.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { hasCodeChanges, touchesChangelog } from "./lib/changelog-files";
import {
	loadRepositoryPolicy,
	missingPolicyCapability,
	repositoryPolicyProblem,
	type ChangelogPolicy,
} from "./lib/project-policy";
import { uncommittedFiles } from "./lib/git";
import { run } from "./lib/exec";

const WIDGET_KEY = "ws-changelog-drift";
const NUDGE_MESSAGE = "Uncommitted code changes have no configured changelog update. Add an entry via /ws-docs changelog or the ws_changelog tool.";

/** Pure decision core: does this diff set deserve a nudge? */
export function shouldNudge(policy: ChangelogPolicy | undefined, diffFiles: string[]): boolean {
	if (!policy || policy.updateMode === "disabled") return false;
	if (diffFiles.length === 0) return false;
	if (!hasCodeChanges(diffFiles)) return false;
	if (touchesChangelog(diffFiles, policy.path)) return false;
	return true;
}

/**
 * Pure union of tracked changes and untracked files, deduped and sorted so the
 * nudge's debounce key stays stable. Extracted as a test seam so the
 * untracked-inclusion contract is unit-testable without invoking git.
 */
export function mergeDriftFiles(uncommitted: string[], untracked: string[]): string[] {
	return [...new Set([...uncommitted, ...untracked])].sort();
}

/** Brand-new untracked files (respecting .gitignore), emitted whole-repo and root-relative so they share `git diff --name-only`'s path space (which `mergeDriftFiles` unions them into). Fail-soft. */
async function untrackedFiles(cwd: string): Promise<string[]> {
	const result = await run("git", ["ls-files", "--others", "--exclude-standard", "--full-name", "--", ":/"], { cwd });
	if (result.code !== 0) return [];
	return result.stdout.split("\n").map(line => line.trim()).filter(Boolean);
}

/** Full drift set: uncommitted changes plus brand-new (untracked) files. */
async function driftFiles(cwd: string): Promise<string[]> {
	const [uncommitted, untracked] = await Promise.all([uncommittedFiles(cwd), untrackedFiles(cwd)]);
	return mergeDriftFiles(uncommitted, untracked);
}

export function registerStopNudge(pi: ExtensionAPI): void {
	// Debounce: only re-announce when the drift set actually changes.
	let lastAnnouncedKey: string | undefined;

	pi.on("session_stop", async (event, ctx) => {
		if (event.stop_hook_active) return;
		try {
			const state = await loadRepositoryPolicy(ctx.cwd);
			const policyProblem = repositoryPolicyProblem(state, "ws-stop-nudge");
			const missingCapability = state.status === "valid" && !state.config?.changelog
				? missingPolicyCapability("ws-stop-nudge", "changelog policy")
				: undefined;
			const problem = policyProblem ?? missingCapability;
			if (problem !== undefined) {
				const key = `policy:${problem}`;
				if (key === lastAnnouncedKey) return;
				lastAnnouncedKey = key;
				if (ctx.hasUI) {
					ctx.ui.setWidget(WIDGET_KEY, [problem], { placement: "belowEditor" });
					ctx.ui.notify(problem, "warning");
				} else {
					pi.logger.warn(problem);
				}
				return;
			}

			const policy = state.config?.changelog
				? {
						updateMode: state.config.changelog.update_mode,
						path: state.config.changelog.path,
						skipTypes: state.config.changelog.skip_types,
					}
				: undefined;
			const diffFiles = policy && policy.updateMode !== "disabled" ? await driftFiles(state.root) : [];
			if (!shouldNudge(policy, diffFiles)) {
				if (lastAnnouncedKey !== undefined) {
					lastAnnouncedKey = undefined;
					if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
				}
				return;
			}

			const key = diffFiles.join("\n");
			if (key === lastAnnouncedKey) return;
			lastAnnouncedKey = key;
			const message = `${NUDGE_MESSAGE} Expected path: ${policy?.path}.`;
			if (ctx.hasUI) {
				ctx.ui.setWidget(WIDGET_KEY, [message], { placement: "belowEditor" });
				ctx.ui.notify(message, "warning");
			} else {
				pi.logger.warn(`ws-stop-nudge: ${message}`);
			}
		} catch (error) {
			pi.logger.warn(`ws-stop-nudge: internal error: ${String(error)}`);
		}
	});
}
