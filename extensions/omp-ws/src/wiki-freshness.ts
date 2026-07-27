/**
 * OpenWiki freshness reminder — behavior-identical port of the per-project
 * hook plugins/ws/templates/omp/hooks/openwiki-freshness.ts into the global
 * extension, with ONE addition: it skips entirely when
 * `<cwd>/.omp/hooks/post/openwiki-freshness.ts` exists (the per-project hook
 * already covers that repo — avoid double banners).
 *
 * Behavior: on `session_stop` (main-agent turn settling), if
 * `<cwd>/openwiki/.last-update.json` exists and any `<repo>/dev-docs/**` file
 * (excluding `openwiki/` and any `dev-docs/tickets/` subtree) is newer than
 * it, show a visible, NON-blocking reminder to refresh the wiki.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const MARKER_RELPATH = path.join("openwiki", ".last-update.json");
const LOCAL_HOOK_RELPATH = path.join(".omp", "hooks", "post", "openwiki-freshness.ts");
// Shared deliberately with the per-project hook (plugins/ws/templates/omp/hooks/openwiki-freshness.ts) so only one banner renders.
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

/** Collect `<repo>/dev-docs/**` files newer than the marker (hub's own top-level dev-docs excluded per spec). */
async function collectStale(cwd: string, markerMtimeMs: number): Promise<string[]> {
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

/** Cheap line-based parse of project.yaml repo names ("- name: foo" entries). */
async function readRepoNames(cwd: string): Promise<string[] | undefined> {
	let text: string;
	try {
		text = await fs.readFile(path.join(cwd, "project.yaml"), "utf8");
	} catch {
		return undefined;
	}
	const names: string[] = [];
	for (const line of text.split("\n")) {
		// repos entries look like: `  - name: repo-name` (project.name has no leading dash)
		const m = /^\s*-\s*name:\s*["']?([A-Za-z0-9._-]+)["']?\s*$/.exec(line);
		if (m?.[1]) names.push(m[1]);
	}
	return names.length > 0 ? names : undefined;
}

async function localHookPresent(cwd: string): Promise<boolean> {
	try {
		await fs.stat(path.join(cwd, LOCAL_HOOK_RELPATH));
		return true;
	} catch {
		return false;
	}
}

export function registerWikiFreshness(pi: ExtensionAPI): void {
	// Debounce: only re-announce when the set of stale files actually changes.
	let lastAnnouncedKey: string | undefined;

	pi.on("session_stop", async (event, ctx) => {
		// Never act while a stop-hook continuation chain is already running.
		if (event.stop_hook_active) return;

		// The per-project hook already covers this repo — skip to avoid double banners.
		if (await localHookPresent(ctx.cwd)) return;

		const markerPath = path.join(ctx.cwd, MARKER_RELPATH);
		let markerMtimeMs: number;
		try {
			markerMtimeMs = (await fs.stat(markerPath)).mtimeMs;
		} catch {
			return; // no OpenWiki marker in this project — hook is a no-op
		}

		const stale = await collectStale(ctx.cwd, markerMtimeMs);
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

		const repoNames = await readRepoNames(ctx.cwd);
		const updateCmd = repoNames
			? `openwiki --update "Refresh; re-scan sub-repos: ${repoNames.join(", ")}"`
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
