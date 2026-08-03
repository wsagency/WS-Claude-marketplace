import { describe, expect, test } from "bun:test";
import * as path from "node:path";

const pluginRoot = path.resolve(import.meta.dir, "../../../plugins/ws");
const hookPath = path.join(pluginRoot, "hooks", "session-discipline.sh");

describe("Claude session discipline hook", () => {
	test("emits the English and non-duplicating orchestration contract", async () => {
		const process = Bun.spawn(["bash", hookPath], { stdout: "pipe", stderr: "pipe" });
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(process.stdout).text(),
			new Response(process.stderr).text(),
			process.exited,
		]);

		expect(exitCode).toBe(0);
		expect(stderr).toBe("");
		const payload = JSON.parse(stdout);
		expect(payload.hookSpecificOutput.hookEventName).toBe("SessionStart");
		const context: string = payload.hookSpecificOutput.additionalContext;
		expect(context).toContain("Every artifact any skill, agent, or tool writes is English");
		expect(context).toContain("WS-HERDR-LANE");
		expect(context).toContain("WS Task workers are leaves and never spawn");
		expect(context).toContain("explicitly load the vendored `herdr` skill");
	});

	test("is registered for every SessionStart reason", async () => {
		const hooks = JSON.parse(await Bun.file(path.join(pluginRoot, "hooks", "hooks.json")).text());
		const registrations = hooks.hooks.SessionStart as Array<{
			matcher?: string;
			hooks: Array<{ command?: string }>;
		}>;
		const discipline = registrations.find(registration =>
			registration.hooks.some(hook => hook.command?.endsWith("/hooks/session-discipline.sh")),
		);

		expect(discipline?.matcher).toBe("startup|resume|clear|compact");
	});
});
