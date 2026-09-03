import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { registerCompaction } from "../src/compaction";
import { registerDashboard } from "../src/dashboard";
import { registerGuard } from "../src/guard";

type NativeHook = (
	event: Record<string, unknown>,
	context: Record<string, unknown>,
) => Promise<unknown>;

let root: string;

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-native-policy-consumers-"));
	await fs.mkdir(path.join(root, ".scratch"));
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

describe("native legacy-policy blockers", () => {
	test("guard, dashboard, and compaction return the same fail-closed setup handoff", async () => {
		const handlers: Record<string, NativeHook[]> = {};
		const pi = {
			on(event: string, handler: NativeHook) {
				handlers[event] ??= [];
				handlers[event].push(handler);
			},
			logger: { warn() {} },
		} as unknown as Parameters<typeof registerGuard>[0];
		registerGuard(pi);
		registerDashboard(pi);
		registerCompaction(pi);

		const blocker = "legacy repository policy detected in .scratch; run /ws-setup to migrate to .wsagency/config.yaml.";
		const guardHook = handlers.tool_call?.[0];
		const dashboardHook = handlers.session_start?.[0];
		const compactionHook = handlers["session.compacting"]?.[0];
		expect(guardHook).toBeDefined();
		expect(dashboardHook).toBeDefined();
		expect(compactionHook).toBeDefined();

		const guardResult = await guardHook!(
			{ toolName: "bash", input: { command: "git push --force", cwd: root } },
			{ cwd: root },
		);
		expect(guardResult).toEqual({ block: true, reason: `ws-guard: ${blocker}` });

		const notifications: Array<{ message: string; level: string }> = [];
		await dashboardHook!(
			{},
			{
				cwd: root,
				hasUI: true,
				ui: {
					notify(message: string, level: string) {
						notifications.push({ message, level });
					},
				},
			},
		);
		expect(notifications).toEqual([{ message: `ws-dashboard: ${blocker}`, level: "warning" }]);

		const compactionResult = await compactionHook!({}, { cwd: root });
		expect(compactionResult).toEqual({ context: [`ws-compaction: ${blocker}`] });
	});
});
