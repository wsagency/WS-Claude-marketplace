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

/** Fixture hub: project.yaml + per-repo dev-docs files, all newer than the marker. */
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
			{ name: "acme-app", dir: "./acme-app" },
			{ name: "legacy-lib", dir: "./legacy-lib" },
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

	test("hub with zero working repos is never stale (no legacy fallback)", async () => {
		const yaml = `repos:\n  - name: c\n    path: ./c\n    type: input\n`;
		const { cwd, markerMtimeMs } = await makeHub(yaml, { c: ["a.md"] });
		const stale = await collectStale(cwd, markerMtimeMs, await readWorkingRepos(cwd));
		expect(stale).toEqual([]);
	});
});
