/**
 * OpenWiki freshness reminder — behavior-identical port of the per-project
 * hook plugins/ws/templates/omp/hooks/openwiki-freshness.ts into the global
 * extension, with ONE addition: it skips entirely when
 * `<cwd>/.omp/hooks/post/openwiki-freshness.ts` exists (the per-project hook
 * already covers that repo — avoid double banners).
 *
 * TWIN: this file's parser/walker region (marked @twin-start..@twin-end) is kept
 * byte-identical with plugins/ws/templates/omp/hooks/openwiki-freshness.ts (export
 * keywords aside) and guarded by the "twin parity" test in test/wiki-freshness.test.ts.
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

// @twin-start (keep byte-identical with the twin .ts; "twin parity" test enforces it)

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
 * Hub mode (`repos` defined — ADR 0006): only `type: working` repos' dev-docs
 * trees are walked; input/output repos and the hub's own dev-docs are not wiki
 * input (the hub's own dev-docs is authored truth). Standalone mode (`repos`
 * undefined — no project.yaml, ADR 0007): the repo's own dev-docs/ IS the product
 * knowledge root and counts, plus each immediate sub-directory's dev-docs/;
 * excludes openwiki/ and any dev-docs/tickets/ subtree.
 */
export async function collectStale(cwd: string, markerMtimeMs: number, repos: HubRepo[] | undefined): Promise<string[]> {
	if (repos !== undefined) {
		const stale: string[] = [];
		for (const repo of repos) {
			const devDocs = path.join(cwd, repo.path, "dev-docs");
			try {
				const st = await fs.stat(devDocs);
				if (!st.isDirectory()) continue;
			} catch {
				continue; // repo not on disk or no dev-docs
			}
			stale.push(...(await staleFilesInDevDocs(devDocs, markerMtimeMs, repo.path.replace(/^\.\//, ""))));
		}
		return stale;
	}
	// Standalone (no project.yaml — ADR 0007): own dev-docs counts, plus sub-dirs'.
	const stale: string[] = [];
	try {
		const st = await fs.stat(path.join(cwd, "dev-docs"));
		if (st.isDirectory()) stale.push(...(await staleFilesInDevDocs(path.join(cwd, "dev-docs"), markerMtimeMs, "")));
	} catch {
		// no own dev-docs — fine
	}
	let top;
	try {
		top = await fs.readdir(cwd, { withFileTypes: true });
	} catch {
		return stale;
	}
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

export interface HubRepo { name: string; path: string }

/** Surface a silently-malformed project.yaml once per process. */
let warnedMalformedRepos = false;

/**
 * Cheap line-based parse of project.yaml, returning `type: working` repos
 * (ADR 0006): explicit `type: working`, or legacy entries with neither type nor
 * role. An entry carrying `purpose:` is an output repo and never counts. An
 * empty array means a hub with no working repos (walk nothing); undefined means
 * no project.yaml at all (standalone — see collectStale's standalone mode).
 */
export async function readWorkingRepos(cwd: string): Promise<HubRepo[] | undefined> {
	let text: string;
	try {
		text = await fs.readFile(path.join(cwd, "project.yaml"), "utf8");
	} catch {
		return undefined;
	}
	const repos: HubRepo[] = [];
	let name = "", dir = "", type = "", role = "", purpose = "", have = false;
	let inRepos = false, sawReposBlock = false, sawNameEntry = false;
	const clean = (v: string) => {
		let value = v.trim();
		const hash = value.search(/(^|\s)#/);
		if (hash !== -1) value = value.slice(0, hash).trim();
		return value.replace(/^["']|["']$/g, "");
	};
	const flush = () => {
		if (have && name !== "" && purpose === "" &&
			(type === "working" || (type === "" && role === ""))) {
			repos.push({ name, path: dir || `./${name}` });
		}
	};
	for (const raw of text.split("\n")) {
		const line = raw.replace(/\r$/, ""); // tolerate CRLF project.yaml
		// Strip an inline comment for top-level-key recognition: a `#` at column 0
		// or preceded by whitespace starts a YAML comment, so `repos: # note` still
		// opens the block. Comment-only/blank lines never open or close a block,
		// matching the repository registry's simple indentation contract.
		const cmt = line.search(/(^|\s)#/);
		const code = cmt === -1 ? line : line.slice(0, cmt);
		// A column-0 key ends the current top-level block — but a block sequence
		// item (`- name:`) is valid YAML at the parent key's indentation and must
		// NOT terminate it, or every entry of a column-0 `repos:` list is dropped.
		if (/^[^\s]/.test(code) && !/^-\s/.test(code)) {
			if (have) { flush(); have = false; }
			inRepos = code.trim() === "repos:";
			if (inRepos) sawReposBlock = true;
			continue;
		}
		if (!inRepos) continue;
		// `- name: <repo>` opens an entry (value optional; an empty name is dropped in flush).
		const m = /^\s*-\s*name:\s*(.*)$/.exec(line);
		if (m) {
			if (have) flush();
			have = true; type = ""; role = ""; purpose = ""; dir = "";
			name = clean(m[1] ?? "");
			if (name !== "") sawNameEntry = true;
			continue;
		}
		const kv = /^\s+(type|role|path|purpose):\s*(.*)$/.exec(line);
		if (have && kv) {
			const v = clean(kv[2] ?? "");
			if (kv[1] === "type") type = v;
			else if (kv[1] === "role") role = v;
			else if (kv[1] === "purpose") purpose = v;
			else dir = v;
		}
	}
	flush();
	if (sawReposBlock && !sawNameEntry) {
		warnedMalformedRepos = true;
	}
	return repos;
}

// @twin-end

/**
 * Consume (and clear) the once-per-parse malformed-repos flag the twin-pure
 * parser sets when a `repos:` block yields no recognised entries. The caller
 * emits the diagnostic through a TUI-safe channel (the parser stays console-free
 * so the @twin region ports byte-identical into the per-project hook).
 */
export function consumeMalformedReposWarning(): boolean {
	if (warnedMalformedRepos) {
		warnedMalformedRepos = false;
		return true;
	}
	return false;
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
	let malformedAnnounced = false;

	pi.on("session_stop", async (event, ctx) => {
		// Never act while a stop-hook continuation chain is already running.
		if (event.stop_hook_active) return;

		// Clears any previously-rendered stale banner. Shared by every exit path so
		// a banner raised earlier in the session never strands on screen when the
		// hook later short-circuits (per-project hook appears, marker removed).
		const clearBanner = () => {
			if (lastAnnouncedKey === undefined) return;
			lastAnnouncedKey = undefined;
			if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
		};

		// The per-project hook already covers this repo — skip to avoid double banners.
		if (await localHookPresent(ctx.cwd)) {
			clearBanner();
			return;
		}

		const markerPath = path.join(ctx.cwd, MARKER_RELPATH);
		let markerMtimeMs: number;
		try {
			markerMtimeMs = (await fs.stat(markerPath)).mtimeMs;
		} catch {
			clearBanner();
			return; // no OpenWiki marker in this project — hook is a no-op
		}

		const repos = await readWorkingRepos(ctx.cwd);
		// Surface a silently-malformed project.yaml once per process, through a
		// TUI-safe channel (the parser only sets a flag — see consumeMalformedReposWarning).
		// Drain the flag every session_stop so it always reflects the latest parse
		// (a healthy parse leaves it false); announce at most once per process.
		const malformed = consumeMalformedReposWarning();
		if (malformed && !malformedAnnounced) {
			malformedAnnounced = true;
			pi.logger.warn("openwiki-freshness: project.yaml has a `repos:` block but no list entries were recognised (expected `- name: <repo>`). Sub-repo scanning may be misconfigured — see ADR 0006.");
			if (ctx.hasUI) {
				ctx.ui.notify("OpenWiki freshness: project.yaml `repos:` block has no recognised entries — sub-repo scanning may be misconfigured.", "warning");
			}
		}
		const stale = await collectStale(ctx.cwd, markerMtimeMs, repos);
		if (stale.length === 0) {
			clearBanner();
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
