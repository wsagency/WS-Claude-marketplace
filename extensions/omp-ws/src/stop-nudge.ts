/**
 * Docs-drift stop nudge: `session_stop` port of hooks/enforce-stop.sh —
 * deliberately NON-blocking. Where the Claude hook blocked the stop, this
 * surfaces a visible reminder (notify + widget) and lets the turn settle,
 * mirroring how openwiki-freshness.ts stays non-blocking (no `continue`,
 * no `decision: "block"` in the return value).
 *
 * Fires when the working tree has code changes (staged, unstaged, or untracked)
 * outside docs paths without a CHANGELOG.md update, and only when
 * `.claude/docs-config.yaml` exists with auto.enforce_via_hooks not false.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { hasCodeChanges, loadDocsConfig, touchesChangelog } from "./lib/docs-config";
import { uncommittedFiles } from "./lib/git";
import { run } from "./lib/exec";

const WIDGET_KEY = "ws-changelog-drift";
const NUDGE_MESSAGE = "Uncommitted code changes have no CHANGELOG.md update. Add an entry via /ws-docs changelog or the ws_changelog tool.";

/** Pure decision core: does this diff set deserve a nudge? */
export function shouldNudge(configExists: boolean, enforceViaHooks: boolean, diffFiles: string[]): boolean {
	if (!configExists || !enforceViaHooks) return false;
	if (diffFiles.length === 0) return false;
	if (!hasCodeChanges(diffFiles)) return false;
	if (touchesChangelog(diffFiles)) return false;
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
			const config = await loadDocsConfig(ctx.cwd);
			// Drift = uncommitted changes ∪ untracked (new) files; either deserves a reminder.
			const diffFiles = config.exists && config.enforceViaHooks ? await driftFiles(ctx.cwd) : [];

			if (!shouldNudge(config.exists, config.enforceViaHooks, diffFiles)) {
				if (lastAnnouncedKey !== undefined) {
					lastAnnouncedKey = undefined;
					if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined); // drift resolved — clear banner
				}
				return;
			}

			const key = diffFiles.join("\n");
			if (key === lastAnnouncedKey) return; // already announced this exact state
			lastAnnouncedKey = key;

			if (ctx.hasUI) {
				ctx.ui.setWidget(WIDGET_KEY, [NUDGE_MESSAGE], { placement: "belowEditor" });
				ctx.ui.notify(NUDGE_MESSAGE, "warning");
			} else {
				pi.logger.warn(`ws-stop-nudge: ${NUDGE_MESSAGE}`);
			}
			// Intentionally no return value: never { continue } / { decision: "block" }.
		} catch (error) {
			pi.logger.warn(`ws-stop-nudge: internal error: ${String(error)}`);
		}
	});
}
