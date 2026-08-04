import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { collectStale, consumeMalformedReposWarning, readWorkingRepos } from "../src/wiki-freshness";

let dirs: string[] = [];

afterEach(async () => {
	await Promise.all(dirs.map(d => fs.rm(d, { recursive: true, force: true })));
	dirs = [];
});

/**
 * Fixture hub: project.yaml + per-repo dev-docs files, all newer than the marker.
 * A repo key of "." means the standalone repo's OWN dev-docs (lives at <cwd>/dev-docs).
 */
async function makeHub(yaml: string | undefined, repos: Record<string, string[]>): Promise<{ cwd: string; markerMtimeMs: number }> {
	const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "ws-fresh-"));
	dirs.push(cwd);
	if (yaml !== undefined) await fs.writeFile(path.join(cwd, "project.yaml"), yaml);
	for (const [repo, files] of Object.entries(repos)) {
		for (const file of files) {
			const p = path.join(cwd, repo, "dev-docs", file);
			await fs.mkdir(path.dirname(p), { recursive: true });
			await fs.writeFile(p, "x");
		}
	}
	return { cwd, markerMtimeMs: 0 }; // every fixture file is "newer than the marker"
}

const TYPED_YAML = `project:
  name: acme
  conventions: 2
repos:
  - name: acme-app
    path: ./acme-app
    type: working
  - name: acme-client
    path: ./acme-client
    type: input
  - name: acme-docs
    path: ./acme-docs
    type: output
    purpose: docs
  - name: legacy-lib
    path: ./legacy-lib
`;

describe("readWorkingRepos", () => {
	test("keeps working + legacy-unmarked, drops input/output", async () => {
		const { cwd } = await makeHub(TYPED_YAML, {});
		expect(await readWorkingRepos(cwd)).toEqual([
			{ name: "acme-app", path: "./acme-app" },
			{ name: "legacy-lib", path: "./legacy-lib" },
		]);
	});

	test("maps legacy role: docs/explained to non-working", async () => {
		const yaml = `repos:\n  - name: d\n    role: docs\n  - name: e\n    role: explained\n  - name: w\n    role: something-else\n`;
		const { cwd } = await makeHub(yaml, {});
		// any role: means "not working" in a legacy hub (roles were outputs-only)
		expect(await readWorkingRepos(cwd)).toEqual([]);
	});

	test("undefined without project.yaml (standalone fallback signal)", async () => {
		const { cwd } = await makeHub(undefined, {});
		expect(await readWorkingRepos(cwd)).toBeUndefined();
	});

	test("empty array when a hub has no working repos", async () => {
		const yaml = `repos:\n  - name: c\n    type: input\n`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([]);
	});

	test("ADR 0006 semantics table: working kept; input/output/legacy-role/purpose dropped", async () => {
		const yaml = `repos:
  - name: app
    type: working
  - name: client
    type: input
  - name: site
    type: output
    purpose: docs
  - name: legacy-out
    role: explained
  - name: legacy-plain
    path: ./legacy-plain`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([
			{ name: "app", path: "./app" },
			{ name: "legacy-plain", path: "./legacy-plain" },
		]);
	});

	test("an entry with purpose: but no type: is non-working (output repo)", async () => {
		const yaml = `repos:\n  - name: acme-docs\n    path: ./acme-docs\n    purpose: docs\n`;
		const { cwd } = await makeHub(yaml, {});
		// a partially-migrated output repo must not raise the stale-wiki banner
		expect(await readWorkingRepos(cwd)).toEqual([]);
	});

	test("ignores type:/path:/purpose: outside the repos: block", async () => {
		const yaml = `repos:
  - name: acme-app
    type: working
  - name: acme-lib
    type: working
deploy:
  staging:
    type: kubernetes`;
		const { cwd } = await makeHub(yaml, {});
		// the deploy block's `type: kubernetes` must not reclassify acme-lib
		expect(await readWorkingRepos(cwd)).toEqual([
			{ name: "acme-app", path: "./acme-app" },
			{ name: "acme-lib", path: "./acme-lib" },
		]);
	});

	test("ignores - name: lists outside repos: (no phantom repo)", async () => {
		const yaml = `repos:
  - name: acme-app
    type: working
tmux:
  panes:
    - name: acme-docs
      path: ./acme-docs`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-app", path: "./acme-app" }]);
	});

	test("a column-0 sequence under a foreign key does not create phantom repos", async () => {
		// After `repos:` ends at `tmux:`, a later column-0 `- name:` (valid YAML
		// under tmux:) must NOT reopen the repos block. The relaxed column-0 rule
		// (sequence items don't terminate) depends on the terminating key clearing
		// inRepos first — an impl treating any `- name:` as an entry re-admits it.
		const yaml = `repos:\n  - name: acme-app\n    type: working\ntmux:\n- name: phantom\n  path: ./phantom\n`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-app", path: "./acme-app" }]);
	});

	test("drops an entry with an empty name: without absorbing its keys", async () => {
		const yaml = `repos:
  - name: acme-app
    path: ./acme-app
    type: working
  - name:
    path: ./acme-client
    type: input`;
		const { cwd } = await makeHub(yaml, {});
		// acme-app survives; the empty-name entry is dropped and never flips acme-app
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-app", path: "./acme-app" }]);
	});

	test("tolerates CRLF line endings in project.yaml", async () => {
		const yaml = "repos:\r\n  - name: acme-app\r\n    path: ./acme-app\r\n    type: working\r\n";
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-app", path: "./acme-app" }]);
	});

	test("strips surrounding quotes from values (anchored; preserves apostrophes)", async () => {
		const yaml = `repos:\n  - name: "acme-app"\n    path: './acme-app'\n    type: working\n`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-app", path: "./acme-app" }]);
	});

	test("does not strip apostrophes inside values", async () => {
		const yaml = `repos:\n  - name: o'reilly\n    type: working\n`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "o'reilly", path: "./o'reilly" }]);
	});

	test("strips inline comments", async () => {
		const yaml = `repos:\n  - name: acme-app   # the app\n    type: working   # working repo\n    path: ./acme-app\n`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-app", path: "./acme-app" }]);
	});

	test("a comment-only value falls back to its default (no stranded comment)", async () => {
		// `path:  # defaults to ./app` and `type: # working` carry NO value before
		// the comment. clean() must treat a `#` at column 0 as a comment too, so the
		// path empties (flush falls back to ./<name>) and the type empties (legacy
		// unmarked ⇒ working). The old regex (/\s+#/, requiring whitespace before #)
		// stranded "# defaults to ./app" as the path and "# working" as a non-working
		// type, dropping the repo — these assertions would fail on it.
		const yaml =
			"repos:\n" +
			"  - name: acme-app\n" +
			"    path:  # defaults to ./app\n" +
			"    type: # working\n";
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-app", path: "./acme-app" }]);
	});

	test("a comment-only path with no type still defaults the path", async () => {
		// Isolates the path default alone: type omitted ⇒ legacy unmarked (working),
		// path comment-only ⇒ ./<name>. The old regex produced path "# see notes".
		const yaml = "repos:\n  - name: acme-app\n    path: # see notes\n";
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-app", path: "./acme-app" }]);
	});

	test("a hash without preceding whitespace survives in a quoted value", async () => {
		// clean() is deliberately YAML-lite and does not inspect quoting. A `#` not
		// preceded by whitespace is literal data; guard against over-stripping "./a#b".
		const yaml =
			"repos:\n" +
			'  - name: acme-app\n' +
			'    path: "./a#b"\n' +
			"    type: working\n";
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-app", path: "./a#b" }]);
	});

	test("a sibling path: ../X is kept verbatim and resolves from the hub", async () => {
		const yaml = `repos:\n  - name: acme-sib\n    path: ../acme-sib\n    type: working\n`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-sib", path: "../acme-sib" }]);
	});

	test("recognises a `repos:` header that carries a trailing comment", async () => {
		const yaml = `repos: # working sub-repos only
  - name: acme-app
    type: working
  - name: acme-lib
    type: working
`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([
			{ name: "acme-app", path: "./acme-app" },
			{ name: "acme-lib", path: "./acme-lib" },
		]);
	});

	test("a column-0 comment inside the repos: block does not terminate it", async () => {
		const yaml = `repos:
  - name: acme-app
    type: working
# a top-level-looking comment must not end the block
  - name: acme-lib
    type: working
`;
		const { cwd } = await makeHub(yaml, {});
		// acme-lib sits after a column-0 comment; only a real top-level key ends the block.
		expect(await readWorkingRepos(cwd)).toEqual([
			{ name: "acme-app", path: "./acme-app" },
			{ name: "acme-lib", path: "./acme-lib" },
		]);
	});

	test("trims trailing whitespace/CRLF before unquoting values", async () => {
		// CRLF + a space after the closing quote must not strand a quote character.
		const yaml = "repos:\r\n  - name: \"acme-app\" \r\n    path: './acme-app' \r\n    type: working\r\n";
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-app", path: "./acme-app" }]);
	});
	test("column-0 block sequences are valid YAML: entries at the parent indentation parse", async () => {
		// `- name:` at column 0 is a valid block-sequence item under `repos:`. The
		// old column-0-key rule terminated the block on it, dropping every entry and
		// silently disabling the freshness reminder for the whole hub.
		const yaml = `project:
  name: acme
repos:
- name: acme-app
  path: ./acme-app
  type: working
- name: acme-lib
  type: working
deploy:
  type: none
`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([
			{ name: "acme-app", path: "./acme-app" },
			{ name: "acme-lib", path: "./acme-lib" },
		]);
	});

	test("column-0 sequence followed by a real top-level key still flushes the last entry", async () => {
		// The block-end flush must still run when a genuine column-0 key follows the
		// sequence, so the final `- name:` entry is captured.
		const yaml = `repos:\n- name: only\n  type: working\nother:\n  x: 1\n`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "only", path: "./only" }]);
	});

	test("a repos: block with no recognisable entries arms the malformed flag (clearable)", async () => {
		consumeMalformedReposWarning(); // reset any state from earlier tests
		const yaml = `repos:\n  not-a-list-entry: true\n`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([]);
		expect(consumeMalformedReposWarning()).toBe(true);
		// Re-parsing a still-malformed file re-arms the flag (reflects current state).
		await readWorkingRepos(cwd);
		expect(consumeMalformedReposWarning()).toBe(true);
		// A well-formed file does not arm it.
		const ok = await fs.mkdtemp(path.join(os.tmpdir(), "ws-fresh-"));
		dirs.push(ok);
		await fs.writeFile(path.join(ok, "project.yaml"), `repos:\n  - name: app\n    type: working\n`);
		expect(await readWorkingRepos(ok)).toEqual([{ name: "app", path: "./app" }]);
		expect(consumeMalformedReposWarning()).toBe(false);
	});

	test("legitimately empty results do NOT arm the malformed-repos flag", async () => {
		// Three shapes return [] / undefined without a malformed repos: block. An
		// impl that arms the flag on any zero-entry result would emit a permanent
		// "malformed project.yaml" warning for every input-only or output-only hub.
		consumeMalformedReposWarning(); // reset state from earlier tests
		const inputOnly = await makeHub(`repos:\n  - name: c\n    type: input\n`, {});
		expect(await readWorkingRepos(inputOnly.cwd)).toEqual([]);
		expect(consumeMalformedReposWarning()).toBe(false);
		const noReposKey = await makeHub(`project:\n  name: x\n`, {});
		expect(await readWorkingRepos(noReposKey.cwd)).toEqual([]);
		expect(consumeMalformedReposWarning()).toBe(false);
		const standalone = await makeHub(undefined, {});
		expect(await readWorkingRepos(standalone.cwd)).toBeUndefined();
		expect(consumeMalformedReposWarning()).toBe(false);
	});

	test("the malformed flag is one-shot: a well-formed re-parse does not clear it", async () => {
		// The flag is set when a parse sees a malformed repos: block and cleared
		// only by consumeMalformedReposWarning(); a successful parse does not
		// retroactively clear an arming from a prior malformed parse. The caller
		// consumes once per session, so this pins the one-shot contract.
		consumeMalformedReposWarning(); // reset
		const bad = await makeHub(`repos:\n  not-a-list-entry: true\n`, {});
		await readWorkingRepos(bad.cwd);
		expect(consumeMalformedReposWarning()).toBe(true); // armed by the malformed parse
		// Re-arm, then parse a fixed file WITHOUT consuming in between.
		await readWorkingRepos(bad.cwd);
		const fixed = await fs.mkdtemp(path.join(os.tmpdir(), "ws-fresh-"));
		dirs.push(fixed);
		await fs.writeFile(path.join(fixed, "project.yaml"), `repos:\n  - name: app\n    type: working\n`);
		await readWorkingRepos(fixed);
		expect(consumeMalformedReposWarning()).toBe(true); // still armed (one-shot latch)
	});
});

describe("collectStale", () => {
	test("hub mode: walks only working repos' dev-docs", async () => {
		const { cwd, markerMtimeMs } = await makeHub(TYPED_YAML, {
			"acme-app": ["a.md"],
			"acme-client": ["b.md"],
			"acme-docs": ["c.md"],
			"legacy-lib": ["d.md"],
		});
		const stale = await collectStale(cwd, markerMtimeMs, await readWorkingRepos(cwd));
		expect(stale.sort()).toEqual(["acme-app/dev-docs/a.md", "legacy-lib/dev-docs/d.md"]);
	});

	test("hub mode: tickets subtrees are never stale", async () => {
		const { cwd, markerMtimeMs } = await makeHub(TYPED_YAML, {
			"acme-app": ["tickets/open/T-1.md"],
		});
		const stale = await collectStale(cwd, markerMtimeMs, await readWorkingRepos(cwd));
		expect(stale).toEqual([]);
	});

	test("no project.yaml: legacy fallback walks every subdir's dev-docs", async () => {
		const { cwd, markerMtimeMs } = await makeHub(undefined, {
			anything: ["a.md"],
		});
		const stale = await collectStale(cwd, markerMtimeMs, undefined);
		expect(stale).toEqual(["anything/dev-docs/a.md"]);
	});

	test("standalone (no project.yaml): own dev-docs AND sub-dir dev-docs both count (ADR 0007)", async () => {
		const { cwd, markerMtimeMs } = await makeHub(undefined, {
			".": ["own.md"], // the standalone repo's OWN dev-docs/
			"sub-repo": ["sub.md"], // an immediate sub-directory's dev-docs/
		});
		const stale = await collectStale(cwd, markerMtimeMs, undefined);
		expect(stale.sort()).toEqual(["dev-docs/own.md", "sub-repo/dev-docs/sub.md"]);
	});

	test("standalone: openwiki/ and node_modules/ sub-dirs are not walked", async () => {
		const { cwd, markerMtimeMs } = await makeHub(undefined, {
			openwiki: ["stray.md"], // a stray file under an openwiki/ sub-dir — must not count
			node_modules: ["pkg.md"],
		});
		const stale = await collectStale(cwd, markerMtimeMs, undefined);
		expect(stale).toEqual([]);
	});

	test("hub with zero working repos is never stale (no legacy fallback)", async () => {
		const yaml = `repos:\n  - name: c\n    path: ./c\n    type: input\n`;
		const { cwd, markerMtimeMs } = await makeHub(yaml, { c: ["a.md"] });
		const stale = await collectStale(cwd, markerMtimeMs, await readWorkingRepos(cwd));
		expect(stale).toEqual([]);
	});

	test("a registered working repo absent from disk is skipped, not fatal", async () => {
		const yaml = `repos:\n  - name: gone\n    type: working\n  - name: acme-app\n    type: working\n`;
		const { cwd, markerMtimeMs } = await makeHub(yaml, { "acme-app": ["a.md"] }); // "gone" not on disk
		const stale = await collectStale(cwd, markerMtimeMs, await readWorkingRepos(cwd));
		expect(stale).toEqual(["acme-app/dev-docs/a.md"]);
	});

	test("files OLDER than the marker are not stale (predicate discriminates)", async () => {
		const { cwd } = await makeHub(`repos:\n  - name: acme-app\n    type: working\n`, {
			"acme-app": ["old.md", "new.md"],
		});
		// Explicit, ordered mtimes: old < marker < new. Relying on a Date.now()
		// captured after writing the file can flip the predicate either way.
		const oldSec = new Date("2020-01-01T00:00:00Z").getTime() / 1000;
		const markerSec = new Date("2021-01-01T00:00:00Z").getTime() / 1000;
		const newSec = new Date("2022-01-01T00:00:00Z").getTime() / 1000;
		const dd = path.join(cwd, "acme-app", "dev-docs");
		await fs.utimes(path.join(dd, "old.md"), oldSec, oldSec);
		await fs.utimes(path.join(dd, "new.md"), newSec, newSec);
		const stale = await collectStale(cwd, markerSec * 1000, await readWorkingRepos(cwd));
		expect(stale).toEqual(["acme-app/dev-docs/new.md"]);
	});

	test("sibling path: ../X walks from the registered path and reports a path that resolves", async () => {
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "ws-fresh-"));
		dirs.push(cwd);
		const sibling = path.join(path.dirname(cwd), "acme-sib");
		dirs.push(sibling);
		await fs.mkdir(path.join(sibling, "dev-docs"), { recursive: true });
		await fs.writeFile(path.join(sibling, "dev-docs", "x.md"), "x");
		await fs.writeFile(path.join(cwd, "project.yaml"), `repos:\n  - name: acme-sib\n    path: ../acme-sib\n    type: working\n`);
		const stale = await collectStale(cwd, 0, await readWorkingRepos(cwd));
		// resolves from cwd (../acme-sib/...), not the bare repo name
		expect(stale).toEqual(["../acme-sib/dev-docs/x.md"]);
	});

	test("hub mode: hidden directories under dev-docs are not walked", async () => {
		const { cwd, markerMtimeMs } = await makeHub(`repos:\n  - name: acme-app\n    type: working\n`, {
			"acme-app": ["real.md", ".cache/secret.md"],
		});
		const stale = await collectStale(cwd, markerMtimeMs, await readWorkingRepos(cwd));
		// .cache is hidden: parity with name.startsWith(".") — never descended.
		expect(stale.sort()).toEqual(["acme-app/dev-docs/real.md"]);
	});

	test("standalone: a symlinked immediate sub-directory is not walked", async () => {
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "ws-fresh-"));
		dirs.push(cwd);
		// Target lives OUTSIDE cwd, reachable only via the symlink `link`.
		const target = await fs.mkdtemp(path.join(os.tmpdir(), "ws-fresh-tgt-"));
		dirs.push(target);
		for (const [base, file] of [
			[path.join(cwd, "dev-docs"), "own.md"],
			[path.join(cwd, "real", "dev-docs"), "r.md"],
			[path.join(target, "dev-docs"), "t.md"],
		] as const) {
			await fs.mkdir(base, { recursive: true });
			await fs.writeFile(path.join(base, file), "x");
		}
		await fs.symlink(target, path.join(cwd, "link"));
		const stale = await collectStale(cwd, 0, undefined);
		// `link` is a symlink to a dir: Dirent.isDirectory() is false, so its
		// dev-docs is never reached (no link/dev-docs/t.md in the result).
		expect(stale.sort()).toEqual(["dev-docs/own.md", "real/dev-docs/r.md"]);
	});
	test("hub mode: a column-0 repo sequence is walked, not dropped", async () => {
		// A `repos:` block whose `- name:` items sit at column 0 (valid YAML) must
		// still drive the walk — the parser fix keeps these entries in the list.
		const yaml = `repos:\n- name: acme-app\n  type: working\n`;
		const { cwd, markerMtimeMs } = await makeHub(yaml, { "acme-app": ["a.md"] });
		const stale = await collectStale(cwd, markerMtimeMs, await readWorkingRepos(cwd));
		expect(stale).toEqual(["acme-app/dev-docs/a.md"]);
	});
});

describe("twin parity", () => {
	// The extension and its per-project template ship a byte-identical parser/walker
	// region (the template cannot import the extension). This guard fails the suite
	// the moment the two drift, so fixes like the block-scoping/CRLF/name handling
	// above only have to be reasoned about once. The only permitted difference is
	// the extension's `export` keyword on three top-level declarations.
	test("extension and template share an identical @twin region (export aside)", async () => {
		const ext = await fs.readFile(path.join(import.meta.dir, "../src/wiki-freshness.ts"), "utf8");
		const tmpl = await fs.readFile(
			path.join(import.meta.dir, "../../../plugins/ws/templates/omp/hooks/openwiki-freshness.ts"),
			"utf8",
		);
		const twinRegion = (src: string): string[] => {
			const start = src.indexOf("// @twin-start");
			const end = src.indexOf("// @twin-end");
			expect(start).toBeGreaterThan(-1);
			expect(end).toBeGreaterThan(start);
			const afterStart = src.indexOf("\n", start) + 1;
			return src.slice(afterStart, end).split("\n").map(l => l.replace(/^export /, ""));
		};
		expect(twinRegion(ext)).toEqual(twinRegion(tmpl));
	});
});

describe("shell vs TypeScript parity", () => {
	// The shipped bash hook (plugins/ws/hooks/openwiki-freshness.sh) and the omp
	// twins must select the same dev-docs paths. These run the real hook against a
	// fixture and diff its reported file set against collectStale. Skipped where
	// bash is unavailable (a capability guard, not a platform-specific assertion).
	const hookPath = path.join(import.meta.dir, "../../../plugins/ws/hooks/openwiki-freshness.sh");
	const bash = (() => { try { return Bun.which("bash") ?? null; } catch { return null; } })();

	async function runHook(cwd: string): Promise<string> {
		const proc = Bun.spawn(["bash", hookPath], { cwd, stdout: "pipe", stderr: "pipe" });
		const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
		return stdout.trim();
	}

	// Pull the comma-separated file list out of
	// "...last wiki refresh (FILES). Convention", not the earlier "file(s)".
	function hookFiles(stdout: string): string[] {
		if (!stdout) return [];
		const files = /last wiki refresh \(([^)]*)\)\. Convention/.exec(stdout)?.[1];
		return files ? files.split(", ").map(s => s.trim()).filter(Boolean) : [];
	}

	// Build a hub fixture: project.yaml + marker (openwiki/.last-update.json at
	// markerSec) + per-repo dev-docs files pinned newer/older than the marker.
	async function parityHub(
		yaml: string,
		markerSec: number,
		files: Array<[string, string, boolean]>,
	): Promise<{ cwd: string; markerMs: number }> {
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "ws-parity-"));
		dirs.push(cwd);
		await fs.writeFile(path.join(cwd, "project.yaml"), yaml);
		await fs.mkdir(path.join(cwd, "openwiki"), { recursive: true });
		const marker = path.join(cwd, "openwiki", ".last-update.json");
		await fs.writeFile(marker, "{}");
		await fs.utimes(marker, markerSec, markerSec);
		for (const [repo, file, newer] of files) {
			const p = path.join(cwd, repo, "dev-docs", file);
			await fs.mkdir(path.dirname(p), { recursive: true });
			await fs.writeFile(p, "x");
			const sec = newer ? markerSec + 100000 : markerSec - 100000;
			await fs.utimes(p, sec, sec);
		}
		return { cwd, markerMs: markerSec * 1000 };
	}

	const MARKER = new Date("2021-06-01T00:00:00Z").getTime() / 1000;

	test.skipIf(!bash)("quoted path with trailing whitespace + CRLF: both walk it", async () => {
		// CRLF + a space after the closing quote used to strand a quote in the awk
		// clean(), dropping the repo. Both twins must resolve ./app.
		const yaml = "repos:\r\n  - name: app\r\n    path: \"./app\" \r\n    type: working\r\n";
		const { cwd, markerMs } = await parityHub(yaml, MARKER, [["app", "a.md", true]]);
		const ts = (await collectStale(cwd, markerMs, await readWorkingRepos(cwd))).sort();
		const sh = hookFiles(await runHook(cwd)).sort();
		expect(ts).toEqual(["app/dev-docs/a.md"]);
		expect(sh).toEqual(ts);
	});

	test.skipIf(!bash)("hidden directory under dev-docs: both prune it", async () => {
		const yaml = "repos:\n  - name: app\n    type: working\n";
		const { cwd, markerMs } = await parityHub(yaml, MARKER, [
			["app", "real.md", true],
			["app", ".cache/secret.md", true],
		]);
		const ts = (await collectStale(cwd, markerMs, await readWorkingRepos(cwd))).sort();
		const sh = hookFiles(await runHook(cwd)).sort();
		expect(ts).toEqual(["app/dev-docs/real.md"]);
		expect(sh).toEqual(ts);
	});

	test.skipIf(!bash)("standalone: symlinked immediate sub-directory is skipped by both", async () => {
		const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "ws-parity-"));
		dirs.push(cwd);
		const target = await fs.mkdtemp(path.join(os.tmpdir(), "ws-parity-tgt-"));
		dirs.push(target);
		await fs.mkdir(path.join(cwd, "openwiki"), { recursive: true });
		const marker = path.join(cwd, "openwiki", ".last-update.json");
		await fs.writeFile(marker, "{}");
		await fs.utimes(marker, MARKER, MARKER);
		for (const [base, file] of [
			[path.join(cwd, "dev-docs"), "own.md"],
			[path.join(cwd, "real", "dev-docs"), "r.md"],
			[path.join(target, "dev-docs"), "t.md"],
		] as const) {
			await fs.mkdir(base, { recursive: true });
			await fs.writeFile(path.join(base, file), "x");
			await fs.utimes(path.join(base, file), MARKER + 100000, MARKER + 100000);
		}
		await fs.symlink(target, path.join(cwd, "link"));
		const ts = (await collectStale(cwd, MARKER * 1000, undefined)).sort();
		const sh = hookFiles(await runHook(cwd)).sort();
		// `link` is a symlink to a dir: Dirent.isDirectory()/`-L` both skip it, so
		// target/dev-docs/t.md is never reported as link/dev-docs/t.md.
		expect(ts).toEqual(["dev-docs/own.md", "real/dev-docs/r.md"]);
		expect(sh).toEqual(ts);
	});

	test.skipIf(!bash)("comment-only path and type: both resolve the named repo (parity)", async () => {
		// The literal regression: `path:  # defaults to ./app` and `type: # working`.
		// The old awk clean() (/[[:space:]]+#/) and old TS clean() (/\s+#/) both
		// require whitespace before #, so a column-0 comment stranded as the value:
		// path became "# defaults to ./app" (a nonexistent dir) and type became
		// "# working" (a non-working value that dropped the repo). Both twins must now
		// resolve ./app and walk its dev-docs. The TS literal is pinned BEFORE the
		// parity check so a shared regression still fails the suite.
		const yaml = "repos:\n  - name: app\n    path:  # defaults to ./app\n    type: # working\n";
		const { cwd, markerMs } = await parityHub(yaml, MARKER, [["app", "a.md", true]]);
		const ts = (await collectStale(cwd, markerMs, await readWorkingRepos(cwd))).sort();
		const sh = hookFiles(await runHook(cwd)).sort();
		expect(ts).toEqual(["app/dev-docs/a.md"]);
		expect(sh).toEqual(ts);
	});

	test.skipIf(!bash)("column-0 repos sequence: both twins walk it (not dropped)", async () => {
		// `- name:` at column 0 is valid YAML under `repos:`. The TS parser fix
		// keeps these entries; the awk twin must too, or non-omp Claude users on a
		// column-0 hub get no freshness reminder while omp users do.
		const yaml = "repos:\n- name: app\n  type: working\n";
		const { cwd, markerMs } = await parityHub(yaml, MARKER, [["app", "a.md", true]]);
		const ts = (await collectStale(cwd, markerMs, await readWorkingRepos(cwd))).sort();
		const sh = hookFiles(await runHook(cwd)).sort();
		expect(ts).toEqual(["app/dev-docs/a.md"]);
		expect(sh).toEqual(ts);
	});
});
