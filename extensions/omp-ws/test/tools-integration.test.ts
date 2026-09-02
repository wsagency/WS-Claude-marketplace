/**
 * Integration tests: run the registered tools' execute() against a temp
 * directory through a minimal fake ExtensionAPI (zod comes from the real
 * transitive dependency, so schemas behave exactly as in omp).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as zod from "zod/v4";
import { registerAdrTool } from "../src/tools/adr";
import { registerChangelogTool } from "../src/tools/changelog";
import { registerTicketTool } from "../src/tools/ticket";

interface FakeTool {
	name: string;
	execute: (id: string, params: Record<string, unknown>, signal: undefined, onUpdate: undefined, ctx: { cwd: string }) => Promise<{
		content: { type: string; text: string }[];
		isError?: boolean;
	}>;
}

function collectTools(register: (pi: never) => void): Map<string, FakeTool> {
	const tools = new Map<string, FakeTool>();
	const pi = {
		zod,
		registerTool: (tool: FakeTool) => tools.set(tool.name, tool),
		on: () => {},
		logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
	};
	register(pi as never);
	return tools;
}

let cwd: string;

beforeEach(async () => {
	cwd = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-test-"));
});

afterEach(async () => {
	await fs.rm(cwd, { recursive: true, force: true });
});
async function writeCanonicalPolicy(options: {
	tracker?: "local" | "github" | "gitlab" | "jira";
	jiraSync?: "disabled" | "all_local_tickets";
	devTrack?: string;
} = {}) {
	const tracker = options.tracker ?? "local";
	const jira = options.jiraSync === undefined
		? ""
		: `
jira:
  project: WCM
  default_issue_type: Task
  sync: ${options.jiraSync}
`;
	await fs.mkdir(path.join(cwd, ".wsagency"), { recursive: true });
	await fs.writeFile(
		path.join(cwd, ".wsagency", "config.yaml"),
		`schema_version: 1
tracker:
  primary: ${tracker}
  pull_requests: ignore
docs:
  user_track: docs
  dev_track: ${options.devTrack ?? "dev-docs"}
  default_audience: ask
  default_scope: repo
  adr_for_arch_changes: true
${jira}`,
		"utf8",
	);
}


async function call(tool: FakeTool, params: Record<string, unknown>, callCwd = cwd) {
	return tool.execute("test-call", params, undefined, undefined, { cwd: callCwd });
}

describe("ws_ticket", () => {
	const tool = collectTools(registerTicketTool).get("ws_ticket") as FakeTool;
	beforeEach(async () => {
		await writeCanonicalPolicy();
	});


	test("refuses when dev-docs/tickets is missing", async () => {
		const result = await call(tool, { op: "create", title: "X", body: "Y" });
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("/ws-setup");
	});

	test("create -> close lifecycle", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });

		const created = await call(tool, {
			op: "create",
			title: "Add dark mode toggle",
			body: "Theme switch persists.",
			blocked_by: ["settings-screen"],
			criteria: ["Toggle works"],
		});
		expect(created.isError).toBeFalsy();
		const openPath = path.join(cwd, "dev-docs", "tickets", "open", "add-dark-mode-toggle.md");
		const text = await fs.readFile(openPath, "utf8");
		expect(text).toContain("# Add dark mode toggle");
		expect(text).toContain("**Blocked by:** settings-screen");
		expect(text).toContain("- [ ] Toggle works");

		const duplicate = await call(tool, { op: "create", title: "Add dark mode toggle", body: "again" });
		expect(duplicate.isError).toBe(true);

		const closed = await call(tool, { op: "close", slug: "add-dark-mode-toggle", share: "https://example.com/s/1" });
		expect(closed.isError).toBeFalsy();
		const closedText = await fs.readFile(path.join(cwd, "dev-docs", "tickets", "done", "add-dark-mode-toggle.md"), "utf8");
		expect(closedText).toContain("share: https://example.com/s/1");
		expect(closedText).toContain("**Status:** done");
		await expect(fs.stat(openPath)).rejects.toThrow();
	});

	test("move to=open reopens a done ticket", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "done"), { recursive: true });
		await fs.writeFile(path.join(cwd, "dev-docs", "tickets", "done", "old.md"), "# Old\n", "utf8");
		const result = await call(tool, { op: "move", slug: "old", to: "open" });
		expect(result.isError).toBeFalsy();
		expect(await fs.readFile(path.join(cwd, "dev-docs", "tickets", "open", "old.md"), "utf8")).toContain("**Status:** ready-for-agent");
	});

	test("close of a missing slug errors", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		const result = await call(tool, { op: "close", slug: "nope" });
		expect(result.isError).toBe(true);
	});

	test("close refuses to overwrite an existing done ticket", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "done"), { recursive: true });
		await fs.writeFile(path.join(cwd, "dev-docs", "tickets", "open", "dup.md"), "# New\n", "utf8");
		await fs.writeFile(path.join(cwd, "dev-docs", "tickets", "done", "dup.md"), "# Old\n", "utf8");
		const result = await call(tool, { op: "close", slug: "dup" });
		expect(result.isError).toBe(true);
		expect(await fs.readFile(path.join(cwd, "dev-docs", "tickets", "done", "dup.md"), "utf8")).toBe("# Old\n");
		expect(await fs.readFile(path.join(cwd, "dev-docs", "tickets", "open", "dup.md"), "utf8")).toBe("# New\n");
	});
	test("move/close preserve the exact hand-authored ticket slug", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		const openPath = path.join(cwd, "dev-docs", "tickets", "open", "Fix Login.md");
		const donePath = path.join(cwd, "dev-docs", "tickets", "done", "Fix Login.md");
		await fs.writeFile(openPath, "# Fix Login\n", "utf8");

		const closed = await call(tool, { op: "close", slug: "Fix Login.md" });
		expect(closed.isError).toBeFalsy();
		await expect(fs.stat(openPath)).rejects.toThrow();
		expect(await fs.readFile(donePath, "utf8")).toContain("# Fix Login");

		const moved = await call(tool, { op: "move", slug: "Fix Login.md", to: "open" });
		expect(moved.isError).toBeFalsy();
		expect(await fs.readFile(openPath, "utf8")).toContain("# Fix Login");
		await expect(fs.stat(donePath)).rejects.toThrow();
	});

	test("close does not mutate the source on a destination collision", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "done"), { recursive: true });
		const openPath = path.join(cwd, "dev-docs", "tickets", "open", "stale.md");
		const donePath = path.join(cwd, "dev-docs", "tickets", "done", "stale.md");
		await fs.writeFile(openPath, "# Stale\n", "utf8");
		await fs.writeFile(donePath, "# Archived\n", "utf8");
		const result = await call(tool, { op: "close", slug: "stale", share: "https://example.com/s/9" });
		expect(result.isError).toBe(true);
		// The specific collision message tells the caller the ticket is already
		// archived and needs a different slug (the recovery path).
		expect(result.content[0]?.text).toContain("already exists");
		// reported as failed AND left BOTH files untouched (no share line written,
		// destination not overwritten).
		expect(await fs.readFile(openPath, "utf8")).toBe("# Stale\n");
		expect(await fs.readFile(donePath, "utf8")).toBe("# Archived\n");
		// Recovery: clear the collision, then the close succeeds.
		await fs.rm(donePath);
		const recovered = await call(tool, { op: "close", slug: "stale", share: "https://example.com/s/9" });
		expect(recovered.isError).toBeFalsy();
		expect(await fs.readFile(donePath, "utf8")).toContain("share: https://example.com/s/9");
		await expect(fs.stat(openPath)).rejects.toThrow();
	});

	test("move does not overwrite a destination on a collision", async () => {
		// Mirror of the close-collision guard for op=move: an unguarded rename
		// would silently destroy the destination ticket.
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "done"), { recursive: true });
		await fs.writeFile(path.join(cwd, "dev-docs", "tickets", "done", "x.md"), "# Done\n", "utf8");
		await fs.writeFile(path.join(cwd, "dev-docs", "tickets", "open", "x.md"), "# Open\n", "utf8");
		const result = await call(tool, { op: "move", slug: "x", to: "open" });
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("already exists");
		expect(await fs.readFile(path.join(cwd, "dev-docs", "tickets", "done", "x.md"), "utf8")).toBe("# Done\n");
		expect(await fs.readFile(path.join(cwd, "dev-docs", "tickets", "open", "x.md"), "utf8")).toBe("# Open\n");
	});

	test("a path-traversal slug is rejected before any write", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		const result = await call(tool, { op: "close", slug: ".." });
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("bare slug");
	});

	test("create rejects a title that slugifies to empty", async () => {
		// slugify("..") and a CJK-only title both reduce to "" (ticket.test.ts), so
		// create — the op that writes a new file from caller text — must refuse
		// before writing dev-docs/tickets/open/.md (a hidden file the tracker never
		// lists again). close's non-empty guard is already pinned; create needs its
		// own. (An explicit slug that slugifies to a safe value, e.g. "../escape"
		// -> "escape", is correctly accepted and is NOT a defect.)
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		const dots = await call(tool, { op: "create", title: "..", body: "x" });
		expect(dots.isError).toBe(true);
		expect(dots.content[0]?.text).toContain("empty slug");
		const cjk = await call(tool, { op: "create", title: "日本語", body: "x" });
		expect(cjk.isError).toBe(true);
		expect(cjk.content[0]?.text).toContain("empty slug");
		// No file (especially no hidden .md) appeared under open/.
		expect(await fs.readdir(path.join(cwd, "dev-docs", "tickets", "open"))).toEqual([]);
	});

	test("create refuses a slug already archived in done/", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "done"), { recursive: true });
		await fs.writeFile(path.join(cwd, "dev-docs", "tickets", "done", "revive.md"), "# Done\n", "utf8");
		const result = await call(tool, { op: "create", title: "Revive", body: "Again", slug: "revive" });
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("already archived");
		await expect(fs.stat(path.join(cwd, "dev-docs", "tickets", "open", "revive.md"))).rejects.toThrow();
	});
	test("fails closed for missing, malformed, and non-Local canonical policy", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		await fs.rm(path.join(cwd, ".wsagency", "config.yaml"));
		const missing = await call(tool, { op: "create", title: "Missing", body: "Policy" });
		expect(missing.isError).toBe(true);
		expect(missing.content[0]?.text).toContain(".wsagency/config.yaml is missing");

		await fs.writeFile(path.join(cwd, ".wsagency", "config.yaml"), "schema_version: nope\n", "utf8");
		const malformed = await call(tool, { op: "create", title: "Malformed", body: "Policy" });
		expect(malformed.isError).toBe(true);
		expect(malformed.content[0]?.text).toContain("invalid");

		await writeCanonicalPolicy({ tracker: "github" });
		const remotePrimary = await call(tool, { op: "create", title: "Remote", body: "Primary" });
		expect(remotePrimary.isError).toBe(true);
		expect(remotePrimary.content[0]?.text).toContain("tracker.primary is github");
		expect(await fs.readdir(path.join(cwd, "dev-docs", "tickets", "open"))).toEqual([]);
	});

	test("fails closed when all-ticket Jira sync lacks the durable boundary", async () => {
		await writeCanonicalPolicy({ jiraSync: "all_local_tickets" });
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		const result = await call(tool, { op: "create", title: "Synchronized", body: "Required" });
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("durable synchronization boundary is unavailable");
		expect(await fs.readdir(path.join(cwd, "dev-docs", "tickets", "open"))).toEqual([]);
	});

	test("routes create and status writes through the durable boundary without Local-only metadata", async () => {
		await writeCanonicalPolicy({ jiraSync: "all_local_tickets" });
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		const operations: Array<{ action: string; payload: Record<string, unknown> }> = [];
		const synchronizedTool = collectTools(pi => registerTicketTool(pi, {
			runSynchronizedOperation: async ({ operation }) => {
				operations.push({ action: operation.action, payload: operation.payload });
				return operation.perform();
			},
		})).get("ws_ticket") as FakeTool;

		const created = await call(synchronizedTool, {
			op: "create",
			title: "Durable native",
			body: "Use the shared boundary.",
			criteria: ["Persist intent"],
			blocked_by: ["local-only-blocker"],
			share: "https://private.example/session",
		});
		expect(created.isError).toBeFalsy();
		const closed = await call(synchronizedTool, {
			op: "close",
			slug: "durable-native",
			share: "https://private.example/session",
		});
		expect(closed.isError).toBeFalsy();
		expect(operations).toEqual([
			{
				action: "create",
				payload: {
					title: "Durable native",
					description: "Use the shared boundary.",
					acceptanceCriteria: "- [ ] Persist intent",
					status: "ready-for-agent",
					type: "Task",
				},
			},
			{ action: "status", payload: { status: "done" } },
		]);
		expect(JSON.stringify(operations)).not.toContain("private.example");
		expect(JSON.stringify(operations)).not.toContain("local-only-blocker");
	});

	test("resolves the repository root before accessing canonical tickets", async () => {
		const git = Bun.spawn(["git", "init", "-q"], { cwd, stdout: "ignore", stderr: "ignore" });
		expect(await git.exited).toBe(0);
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		const nested = path.join(cwd, "nested", "work");
		await fs.mkdir(nested, { recursive: true });

		const result = await call(tool, { op: "create", title: "Root routed", body: "From a nested cwd." }, nested);
		expect(result.isError).toBeFalsy();
		expect(await fs.readFile(path.join(cwd, "dev-docs", "tickets", "open", "root-routed.md"), "utf8")).toContain(
			"From a nested cwd.",
		);
	});

});

describe("ws_adr", () => {
	const tool = collectTools(registerAdrTool).get("ws_adr") as FakeTool;
	beforeEach(async () => {
		await writeCanonicalPolicy();
	});


	test("numbers continue the existing sequence and return the path", async () => {
		const dir = path.join(cwd, "dev-docs", "decisions");
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(path.join(dir, "0003-single-ws-plugin.md"), "# 0003 — x\n", "utf8");

		const result = await call(tool, { title: "Ship omp-ws as its own package", sentences: "Native omp behaviors need TS. Revisit if the marketplace learns TS." });
		expect(result.isError).toBeFalsy();
		const filePath = path.join(dir, "0004-ship-omp-ws-as-its-own-package.md");
		expect(result.content[0]?.text).toContain(filePath);
		expect(await fs.readFile(filePath, "utf8")).toBe(
			"# 0004 — Ship omp-ws as its own package\n\nNative omp behaviors need TS. Revisit if the marketplace learns TS.\n",
		);
	});

	test("bootstraps dev-docs/decisions at 0001 when absent", async () => {
		const result = await call(tool, { title: "First decision", sentences: "Because." });
		expect(result.isError).toBeFalsy();
		expect(result.content[0]?.text).toContain("0001-first-decision.md");
	});
	test("returns an error envelope (not a crash) when decisions exists as a file", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs"), { recursive: true });
		await fs.writeFile(path.join(cwd, "dev-docs", "decisions"), "not a dir", "utf8");
		const result = await call(tool, { title: "Blocked", sentences: "Because." });
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("cannot use");
	});

	test("ignores non-numeric siblings (README/template) when continuing the sequence", async () => {
		// A real repo's decisions/ often carries README.md or template.md; only
		// NNNN-prefixed files advance the counter. An impl using Math.max over
		// parseInt(names) would yield NaN, and a lexicographic-last impl would
		// restart at 0001, silently overwriting an existing decision.
		const dir = path.join(cwd, "dev-docs", "decisions");
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(path.join(dir, "0003-single-ws-plugin.md"), "# 0003 — x\n", "utf8");
		await fs.writeFile(path.join(dir, "README.md"), "# Decisions\n", "utf8");
		await fs.writeFile(path.join(dir, "template.md"), "template\n", "utf8");
		const result = await call(tool, { title: "Next decision", sentences: "Because." });
		expect(result.isError).toBeFalsy();
		expect(result.content[0]?.text).toContain("0004-next-decision.md");
	});
	test("rolls zero-padding over at the 0009 -> 0010 boundary", async () => {
		const dir = path.join(cwd, "dev-docs", "decisions");
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(path.join(dir, "0009-ninth.md"), "# 0009 — x\n", "utf8");
		const result = await call(tool, { title: "Tenth", sentences: "Because." });
		expect(result.isError).toBeFalsy();
		expect(result.content[0]?.text).toContain("0010-tenth.md");
	});
	test("routes from a nested hub directory to configured docs.dev_track decisions", async () => {
		await writeCanonicalPolicy({ devTrack: "internal" });
		await fs.writeFile(path.join(cwd, "project.yaml"), "project:\n  name: example\n", "utf8");
		const git = Bun.spawn(["git", "init", "-q"], { cwd, stdout: "ignore", stderr: "ignore" });
		expect(await git.exited).toBe(0);
		const nested = path.join(cwd, "working-repo-view");
		await fs.mkdir(nested, { recursive: true });

		const result = await call(tool, { title: "Hub-owned decision", sentences: "Keep product decisions at the hub root." }, nested);
		expect(result.isError).toBeFalsy();
		const target = path.join(cwd, "internal", "decisions", "0001-hub-owned-decision.md");
		expect(await fs.readFile(target, "utf8")).toContain("Keep product decisions at the hub root.");
		await expect(fs.stat(path.join(nested, "dev-docs", "decisions"))).rejects.toThrow();
	});

	test("fails closed for missing, legacy, malformed, and incomplete docs policy", async () => {
		await fs.rm(path.join(cwd, ".wsagency", "config.yaml"));
		const missing = await call(tool, { title: "Missing", sentences: "Policy." });
		expect(missing.isError).toBe(true);
		expect(missing.content[0]?.text).toContain(".wsagency/config.yaml is missing");

		await fs.mkdir(path.join(cwd, ".claude"), { recursive: true });
		await fs.writeFile(path.join(cwd, ".claude", "docs-config.yaml"), "docs:\n  dev_track: dev-docs\n", "utf8");
		const legacy = await call(tool, { title: "Legacy", sentences: "Policy." });
		expect(legacy.isError).toBe(true);
		expect(legacy.content[0]?.text).toContain("legacy repository policy");
		await fs.rm(path.join(cwd, ".claude"), { recursive: true });

		await fs.writeFile(path.join(cwd, ".wsagency", "config.yaml"), "schema_version: nope\n", "utf8");
		const malformed = await call(tool, { title: "Malformed", sentences: "Policy." });
		expect(malformed.isError).toBe(true);
		expect(malformed.content[0]?.text).toContain("invalid");

		await fs.writeFile(
			path.join(cwd, ".wsagency", "config.yaml"),
			"schema_version: 1\ntracker:\n  primary: local\n  pull_requests: ignore\n",
			"utf8",
		);
		const incomplete = await call(tool, { title: "Incomplete", sentences: "Policy." });
		expect(incomplete.isError).toBe(true);
		expect(incomplete.content[0]?.text).toContain("docs.dev_track");
	});

});

describe("ws_changelog", () => {
	const tool = collectTools(registerChangelogTool).get("ws_changelog") as FakeTool;
	const BASE = "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- Initial\n";

	beforeEach(async () => {
		await fs.mkdir(path.join(cwd, ".wsagency"), { recursive: true });
		await fs.writeFile(
			path.join(cwd, ".wsagency", "config.yaml"),
			`schema_version: 1

changelog:
  update_mode: pull_request
  path: CHANGELOG.md
  skip_types: [docs, chore, test, style, build, ci]

docs:
  user_track: docs
  dev_track: dev-docs
  default_audience: ask
  default_scope: ask
  adr_for_arch_changes: true
`,
		);
	});

	test("errors without CHANGELOG.md", async () => {
		const result = await call(tool, { type: "feat", text: "X" });
		expect(result.isError).toBe(true);
	});

	test("writes the entry and mirrors when docs/changelog.md exists", async () => {
		await fs.writeFile(path.join(cwd, "CHANGELOG.md"), BASE, "utf8");
		await fs.mkdir(path.join(cwd, "docs"), { recursive: true });
		await fs.writeFile(path.join(cwd, "docs", "changelog.md"), BASE, "utf8");

		const result = await call(tool, { type: "fix", text: "Repair race", ticket: "WSC-9" });
		expect(result.isError).toBeFalsy();
		expect(result.content[0]?.text).toContain("mirrored");

		const root = await fs.readFile(path.join(cwd, "CHANGELOG.md"), "utf8");
		expect(root).toContain("### Fixed");
		expect(root).toContain("- Repair race (WSC-9)");
		expect(await fs.readFile(path.join(cwd, "docs", "changelog.md"), "utf8")).toBe(root);
	});

	test("no mirror write when docs/changelog.md is absent", async () => {
		await fs.writeFile(path.join(cwd, "CHANGELOG.md"), BASE, "utf8");
		const result = await call(tool, { type: "feat", text: "Add thing" });
		expect(result.isError).toBeFalsy();
		expect(result.content[0]?.text).not.toContain("mirrored");
		await expect(fs.stat(path.join(cwd, "docs", "changelog.md"))).rejects.toThrow();
	});
	test("success message tells the caller to stage the configured changelog", async () => {
		await fs.writeFile(path.join(cwd, "CHANGELOG.md"), BASE, "utf8");
		const result = await call(tool, { type: "feat", text: "Add thing" });
		expect(result.isError).toBeFalsy();
		expect(result.content[0]?.text).toContain("Stage the updated file");
	});

	test("writes the changelog path selected by canonical policy", async () => {
		const configPath = path.join(cwd, ".wsagency", "config.yaml");
		const config = await fs.readFile(configPath, "utf8");
		await fs.writeFile(configPath, config.replace("path: CHANGELOG.md", "path: changes/HISTORY.md"));
		await fs.mkdir(path.join(cwd, "changes"), { recursive: true });
		await fs.writeFile(path.join(cwd, "changes", "HISTORY.md"), BASE, "utf8");

		const result = await call(tool, { type: "feat", text: "Use canonical path" });
		expect(result.isError).toBeFalsy();
		expect(await fs.readFile(path.join(cwd, "changes", "HISTORY.md"), "utf8")).toContain("- Use canonical path");
		await expect(fs.stat(path.join(cwd, "CHANGELOG.md"))).rejects.toThrow();
	});

	test("surfaces a failed mirror write instead of reporting no mirror", async () => {
		await fs.writeFile(path.join(cwd, "CHANGELOG.md"), BASE, "utf8");
		await fs.mkdir(path.join(cwd, "docs"), { recursive: true });
		// docs/changelog.md exists as a directory -> stat succeeds (mirror exists)
		// but the write fails (EISDIR). Must be reported, not swallowed as "no mirror".
		await fs.mkdir(path.join(cwd, "docs", "changelog.md"), { recursive: true });
		const result = await call(tool, { type: "fix", text: "Repair race" });
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("could not mirror");
		// the root source-of-truth entry was still written
		expect(await fs.readFile(path.join(cwd, "CHANGELOG.md"), "utf8")).toContain("- Repair race");
	});
});
