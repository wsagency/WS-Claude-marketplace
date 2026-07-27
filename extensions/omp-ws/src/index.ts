/**
 * @wsagency/omp-ws — WS Agency native omp extension.
 *
 * Tier 1 (parity + guard):
 *   - ws-guard: fail-closed tool_call block on dangerous git/rm commands
 *   - changelog-gate: opt-in `git commit` gate (docs-config changelog_per_commit)
 *   - dashboard: Jira workload widget on session_start
 *   - stop-nudge: non-blocking CHANGELOG-drift reminder on session_stop
 *   - wiki-freshness: OpenWiki staleness banner (skips when the per-project
 *     .omp/hooks/post/openwiki-freshness.ts hook already covers the repo)
 *
 * Tier 2 (conventions as tools): ws_ticket, ws_changelog, ws_adr.
 *
 * Design doc: dev-docs/omp-native-improvements.md in the ws-claude-marketplace repo.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { registerChangelogGate } from "./changelog-gate";
import { registerDashboard } from "./dashboard";
import { registerGuard } from "./guard";
import { registerStopNudge } from "./stop-nudge";
import { registerChangelogTool } from "./tools/changelog";
import { registerAdrTool } from "./tools/adr";
import { registerTicketTool } from "./tools/ticket";
import { registerWikiFreshness } from "./wiki-freshness";

export default function ompWs(pi: ExtensionAPI): void {
	// Tier 1 — hooks
	registerGuard(pi);
	registerChangelogGate(pi);
	registerDashboard(pi);
	registerStopNudge(pi);
	registerWikiFreshness(pi);

	// Tier 2 — registered tools
	registerTicketTool(pi);
	registerChangelogTool(pi);
	registerAdrTool(pi);
}
