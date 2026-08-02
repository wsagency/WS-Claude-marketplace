/**
 * OpenWiki freshness reminder — omp project hook (runs in omp only, never Claude Code).
 *
 * Ship at:  <hub>/.omp/hooks/post/openwiki-freshness.ts
 * (auto-discovered by omp's native hook capability; no settings entry needed.
 *  `.omp/extensions/openwiki-freshness.ts` works identically — both paths load
 *  the same default-export factory through the extension-module pipeline.)
 *
 * Behavior: on `session_stop` (main-agent turn settling), if
 * `<cwd>/openwiki/.last-update.json` exists and any `<repo>/dev-docs/**` file
 * (excluding `openwiki/` and any `dev-docs/tickets/` subtree) is newer than it,
 * show a visible, NON-blocking reminder to refresh the wiki. Never returns
 * `{ continue: true }` / `{ decision: "block" }`, so the agent settles normally.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const MARKER_RELPATH = path.join("openwiki", ".last-update.json");
const WIDGET_KEY = "openwiki-freshness";
const MAX_LISTED = 3;
// Dirs never worth descending into while walking a dev-docs tree.
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "tickets"]);

/** Walk one repo's dev-docs tree; return repo-relative paths newer than markerMtime. */
async function staleFilesInDevDocs(devDocsDir: string, markerMtimeMs: number, hubRel: string): Promise<string[]> {
	const stale: string[] = [];
	const stack: string[] = [devDocsDir];
	while (stack.length > 0) {
		const dir = stack.pop() as string;
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			continue; // unreadable dir — ignore
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!SKIP_DIR_NAMES.has(entry.name)) stack.push(full);
				continue;
			}
			if (!entry.isFile()) continue; // skip symlinks/sockets
			try {
				const st = await fs.stat(full);
				if (st.mtimeMs > markerMtimeMs) {
					stale.push(path.join(hubRel, path.relative(path.dirname(devDocsDir), full)));
				}
			} catch {
				// raced deletion — ignore
			}
		}
	}
	return stale;
}

/**
 * Collect dev-docs files newer than the marker.
 * With a hub registry (`repos` defined — ADR 0006): only those working repos'
 * dev-docs trees are walked (input/output repos and the hub's own dev-docs are
 * not wiki input). Without a project.yaml (`repos` undefined): legacy
 * fallback — walk every top-level subdir's dev-docs (hub's own excluded).
 */
async function collectStale(cwd: string, markerMtimeMs: number, repos: HubRepo[] | undefined): Promise<string[]> {
	if (repos !== undefined) {
		const stale: string[] = [];
		for (const repo of repos) {
			const devDocs = path.join(cwd, repo.dir, "dev-docs");
			try {
				const st = await fs.stat(devDocs);
				if (!st.isDirectory()) continue;
			} catch {
				continue; // repo not on disk or no dev-docs
			}
			stale.push(...(await staleFilesInDevDocs(devDocs, markerMtimeMs, repo.name)));
		}
		return stale;
	}
	let top;
	try {
		top = await fs.readdir(cwd, { withFileTypes: true });
	} catch {
		return [];
	}
	const stale: string[] = [];
	for (const entry of top) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith(".") || entry.name === "openwiki" || entry.name === "node_modules") continue;
		const devDocs = path.join(cwd, entry.name, "dev-docs");
		try {
			const st = await fs.stat(devDocs);
			if (!st.isDirectory()) continue;
		} catch {
			continue; // no dev-docs in this sub-repo
		}
		stale.push(...(await staleFilesInDevDocs(devDocs, markerMtimeMs, entry.name)));
	}
	return stale;
}

interface HubRepo { name: string; dir: string }

/**
 * Cheap line-based parse of project.yaml, returning `type: working` repos
 * (ADR 0006): explicit `type: working`, or legacy entries with neither type
 * nor role. An empty array means a hub with no working repos (walk nothing);
 * undefined means no project.yaml at all (standalone repo — legacy fallback).
 */
async function readWorkingRepos(cwd: string): Promise<HubRepo[] | undefined> {
	let text: string;
	try {
		text = await fs.readFile(path.join(cwd, "project.yaml"), "utf8");
	} catch {
		return undefined;
	}
	const repos: HubRepo[] = [];
	let name = "", dir = "", type = "", role = "", have = false;
	const clean = (v: string) => v.replace(/\s+#.*$/, "").replace(/["']/g, "").trim();
	const flush = () => {
		if (have && (type === "working" || (type === "" && role === ""))) {
			repos.push({ name, dir: dir || `./${name}` });
		}
	};
	for (const line of text.split("\n")) {
		// repos entries look like: `  - name: repo-name` (project.name has no leading dash)
		const m = /^\s*-\s*name:\s*(.+)$/.exec(line);
		if (m?.[1]) {
			flush(); have = true; type = ""; role = ""; dir = "";
			name = clean(m[1]); continue;
		}
		const kv = /^\s+(type|role|path):\s*(.+)$/.exec(line);
		if (have && kv?.[1] && kv[2]) {
			const v = clean(kv[2]);
			if (kv[1] === "type") type = v; else if (kv[1] === "role") role = v; else dir = v;
		}
	}
	flush();
	return repos;
}

export default function openwikiFreshness(pi: ExtensionAPI) {
	// Debounce: only re-announce when the set of stale files actually changes.
	let lastAnnouncedKey: string | undefined;

	pi.on("session_stop", async (event, ctx) => {
		// Never act while a stop-hook continuation chain is already running.
		if (event.stop_hook_active) return;

		const markerPath = path.join(ctx.cwd, MARKER_RELPATH);
		let markerMtimeMs: number;
		try {
			markerMtimeMs = (await fs.stat(markerPath)).mtimeMs;
		} catch {
			return; // no OpenWiki marker in this project — hook is a no-op
		}

		const repos = await readWorkingRepos(ctx.cwd);
		const stale = await collectStale(ctx.cwd, markerMtimeMs, repos);
		if (stale.length === 0) {
			if (lastAnnouncedKey !== undefined) {
				lastAnnouncedKey = undefined;
				if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined); // clear stale banner
			}
			return; // wiki is fresh — settle normally
		}

		stale.sort();
		const key = `${stale.length}:${stale[0]}:${stale[stale.length - 1]}`;
		if (key === lastAnnouncedKey) return; // already announced this exact state
		lastAnnouncedKey = key;

		const updateCmd = repos && repos.length > 0
			? `openwiki --update "Refresh; re-scan sub-repos: ${repos.map(r => r.name).join(", ")}"`
			: `openwiki --update "Refresh; re-scan all sub-repos"`;

		const examples = stale.slice(0, MAX_LISTED).map(f => `  · ${f}`);
		const more = stale.length > MAX_LISTED ? [`  · … and ${stale.length - MAX_LISTED} more`] : [];

		if (ctx.hasUI) {
			// Persistent banner under the editor (string-array widgets are capped at 10 lines).
			ctx.ui.setWidget(
				WIDGET_KEY,
				[
					`OpenWiki may be stale — ${stale.length} dev-docs file(s) changed since the last wiki update:`,
					...examples,
					...more,
					`Refresh with: ${updateCmd}`,
				],
				{ placement: "belowEditor" },
			);
			ctx.ui.notify(`OpenWiki may be stale (${stale.length} dev-docs change(s)). See banner for the update command.`, "warning");
		} else {
			// Headless (print/RPC): no UI surface — leave a trace in the omp log file.
			pi.logger.warn(`openwiki-freshness: wiki stale (${stale.length} files). Run: ${updateCmd}`);
		}

		// Intentionally no return value: no { continue } / { decision: "block" },
		// so this hook never forces a continuation turn.
	});
}
