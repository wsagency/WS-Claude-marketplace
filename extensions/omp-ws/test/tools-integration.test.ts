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

async function call(tool: FakeTool, params: Record<string, unknown>) {
	return tool.execute("test-call", params, undefined, undefined, { cwd });
}

describe("ws_ticket", () => {
	const tool = collectTools(registerTicketTool).get("ws_ticket") as FakeTool;

	test("refuses when dev-docs/tickets is missing", async () => {
		const result = await call(tool, { op: "create", title: "X", body: "Y" });
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("/ws-matt setup");
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
		expect(await fs.readFile(path.join(cwd, "dev-docs", "tickets", "done", "add-dark-mode-toggle.md"), "utf8")).toContain(
			"share: https://example.com/s/1",
		);
		await expect(fs.stat(openPath)).rejects.toThrow();
	});

	test("move to=open reopens a done ticket", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "done"), { recursive: true });
		await fs.writeFile(path.join(cwd, "dev-docs", "tickets", "done", "old.md"), "# Old\n", "utf8");
		const result = await call(tool, { op: "move", slug: "old", to: "open" });
		expect(result.isError).toBeFalsy();
		expect(await fs.readFile(path.join(cwd, "dev-docs", "tickets", "open", "old.md"), "utf8")).toBe("# Old\n");
	});

	test("close of a missing slug errors", async () => {
		await fs.mkdir(path.join(cwd, "dev-docs", "tickets", "open"), { recursive: true });
		const result = await call(tool, { op: "close", slug: "nope" });
		expect(result.isError).toBe(true);
	});
});

describe("ws_adr", () => {
	const tool = collectTools(registerAdrTool).get("ws_adr") as FakeTool;

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
});

describe("ws_changelog", () => {
	const tool = collectTools(registerChangelogTool).get("ws_changelog") as FakeTool;
	const BASE = "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- Initial\n";

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
});
