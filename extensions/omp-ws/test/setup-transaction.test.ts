import { expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
	type EffectClassification,
	RECOMMENDED_LOCAL_CHOICES,
	discoverStandaloneRepository,
	runSetupTransaction,
} from "../../../plugins/ws/skills/ws-project-bootstrap/transaction.mjs";

const READY_RUNTIME = {
	activeHarness: "omp" as const,
	sessionDiscipline: true,
	dangerousGitGuard: true,
};

async function runGit(root: string, ...args: string[]): Promise<void> {
	const process = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
	const exitCode = await process.exited;
	if (exitCode !== 0) throw new Error(await new Response(process.stderr).text());
}

async function repositoryFiles(root: string, relative = ""): Promise<Record<string, string>> {
	const result: Record<string, string> = {};
	const current = path.join(root, relative);
	for (const entry of await fs.readdir(current, { withFileTypes: true })) {
		if (entry.name === ".git") continue;
		const child = path.join(relative, entry.name);
		if (entry.isDirectory()) Object.assign(result, await repositoryFiles(root, child));
		else result[child] = await fs.readFile(path.join(root, child), "utf8");
	}
	return result;
}

test("recommended Local setup is one confirmed transaction and its rerun is a prompt-free no-op", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "ws-setup-transaction-"));
	try {
		await runGit(root, "init", "--quiet");
		await runGit(root, "remote", "add", "origin", "git@example.test:team/repository.git");
		await fs.writeFile(path.join(root, "README.md"), "# Existing repository\n");
		await fs.writeFile(path.join(root, "AGENTS.md"), "# Existing agent instructions\n\nKeep this authored guidance.\n");
		const initialFiles = await repositoryFiles(root);

		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		expect(discovery.projectShape).toBe("standalone");
		expect(discovery.setupState).toBe("unconfigured");
		expect(discovery.git.origin).toBe("git@example.test:team/repository.git");
		expect(await repositoryFiles(root)).toEqual(initialFiles);

		const undecided = await runSetupTransaction({ root, discovery });
		expect(undecided.questions).toEqual([
			{
				id: "setup_profile",
				question: "Use the recommended Local Markdown engineering setup?",
				recommended: "recommended_local",
			},
		]);
		expect(undecided.plan).toBeUndefined();
		expect(await repositoryFiles(root)).toEqual(initialFiles);

		const planned = await runSetupTransaction({ root, discovery, choices: RECOMMENDED_LOCAL_CHOICES });
		expect(planned.questions).toEqual([]);
		expect(planned.requiresConfirmation).toBe(true);
		expect(planned.plan).toBeDefined();
		expect(await repositoryFiles(root)).toEqual(initialFiles);
		const plan = planned.plan!;
		const expectedClassifications: EffectClassification[] = ["CREATE", "UPDATE", "PRESERVE", "SKIP", "NO-OP"];
		expect([...new Set(plan.effects.map(effect => effect.classification))].sort()).toEqual(
			expectedClassifications.sort(),
		);
		const agentsEffect = plan.effects.find(effect => effect.target === "AGENTS.md");
		expect(agentsEffect).toMatchObject({
			classification: "UPDATE",
			before: initialFiles["AGENTS.md"],
		});
		expect(agentsEffect?.after).toContain("Keep this authored guidance.");
		expect(agentsEffect?.after).toContain("<!-- WS-AGENT-SKILLS:START -->");
		expect(agentsEffect?.diff).toContain("+<!-- WS-AGENT-SKILLS:START -->");

		const applied = await runSetupTransaction({
			root,
			discovery,
			choices: RECOMMENDED_LOCAL_CHOICES,
			authorization: plan.hash,
		});
		expect(applied.questions).toEqual([]);
		expect(applied.requiresConfirmation).toBe(false);
		expect(applied.readiness).toEqual({
			configValid: true,
			engineeringReady: true,
			trackerReady: true,
			runtimeReady: true,
		});
		expect(applied.operations).toEqual(
			plan.effects
				.filter(effect => effect.classification === "CREATE" || effect.classification === "UPDATE")
				.flatMap(effect => [
					{ action: "write", target: effect.target },
					{ action: "verify", target: effect.target },
				]),
		);
		expect(applied.report).toContain("WS setup verified");
		const config = await fs.readFile(path.join(root, ".wsagency/config.yaml"), "utf8");
		expect(config).toContain("schema_version: 1");
		expect(config).toContain("primary: local");
		expect(config).not.toContain(root);
		expect(config).not.toContain(os.userInfo().username);
		expect(config).not.toMatch(/token|password|secret|git@example\.test/i);

		const alignedFiles = await repositoryFiles(root);
		const alignedDiscovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		expect(alignedDiscovery.setupState).toBe("aligned");
		const rerun = await runSetupTransaction({ root, discovery: alignedDiscovery });
		expect(rerun.questions).toEqual([]);
		expect(rerun.requiresConfirmation).toBe(false);
		expect(rerun.operations).toEqual([]);
		expect(rerun.report).toContain("No changes required");
		expect(await repositoryFiles(root)).toEqual(alignedFiles);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
