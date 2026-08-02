import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { collectStale, readWorkingRepos } from "../src/wiki-freshness";

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

	test("a sibling path: ../X is kept verbatim and resolves from the hub", async () => {
		const yaml = `repos:\n  - name: acme-sib\n    path: ../acme-sib\n    type: working\n`;
		const { cwd } = await makeHub(yaml, {});
		expect(await readWorkingRepos(cwd)).toEqual([{ name: "acme-sib", path: "../acme-sib" }]);
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
		// Backdate old.md well into the past; marker is "now".
		const pastSec = new Date("2020-01-01T00:00:00Z").getTime() / 1000;
		await fs.utimes(path.join(cwd, "acme-app", "dev-docs", "old.md"), pastSec, pastSec);
		const stale = await collectStale(cwd, Date.now(), await readWorkingRepos(cwd));
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
