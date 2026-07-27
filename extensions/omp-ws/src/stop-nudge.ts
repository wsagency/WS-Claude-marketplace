/**
 * Docs-drift stop nudge: `session_stop` port of hooks/enforce-stop.sh —
 * deliberately NON-blocking. Where the Claude hook blocked the stop, this
 * surfaces a visible reminder (notify + widget) and lets the turn settle,
 * mirroring how openwiki-freshness.ts stays non-blocking (no `continue`,
 * no `decision: "block"` in the return value).
 *
 * Fires when the working tree has uncommitted code changes (staged or not)
 * outside docs paths without a CHANGELOG.md update, and only when
 * `.claude/docs-config.yaml` exists with auto.enforce_via_hooks not false.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { hasCodeChanges, loadDocsConfig, touchesChangelog } from "./lib/docs-config";
import { uncommittedFiles } from "./lib/git";

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

export function registerStopNudge(pi: ExtensionAPI): void {
	// Debounce: only re-announce when the drift set actually changes.
	let lastAnnouncedKey: string | undefined;

	pi.on("session_stop", async (event, ctx) => {
		if (event.stop_hook_active) return;
		try {
			const config = await loadDocsConfig(ctx.cwd);
			const diffFiles = config.exists && config.enforceViaHooks ? await uncommittedFiles(ctx.cwd) : [];

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
