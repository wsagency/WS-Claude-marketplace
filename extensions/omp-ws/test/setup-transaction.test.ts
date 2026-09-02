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
		await runGit(root, "add", "README.md", "AGENTS.md");
		await runGit(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial");
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
			docsReady: false,
			docsConfigured: false,
			runtimeReady: true,
			blockers: { tracker: [], docs: [] },
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
test("parent-path collisions remain read-only blocking effects", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "ws-setup-parent-collision-"));
	try {
		await runGit(root, "init", "--quiet");
		await fs.writeFile(path.join(root, ".wsagency"), "occupied by a file\n");
		await runGit(root, "add", ".wsagency");
		await runGit(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial");
		const initialFiles = await repositoryFiles(root);

		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const result = await runSetupTransaction({ root, discovery, choices: RECOMMENDED_LOCAL_CHOICES });

		expect(result.requiresConfirmation).toBe(false);
		expect(result.plan?.effects.find(effect => effect.target === ".wsagency/config.yaml")).toMatchObject({
			classification: "BLOCKING_CONFLICT",
		});
		expect(result.report).toContain("Setup blocked before writes");
		expect(await repositoryFiles(root)).toEqual(initialFiles);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("malformed managed markers block instead of appending another range", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "ws-setup-marker-conflict-"));
	try {
		await runGit(root, "init", "--quiet");
		await fs.writeFile(
			path.join(root, "AGENTS.md"),
			"# Existing guidance\n\n<!-- WS-AGENT-SKILLS:START -->\nunterminated managed content\n",
		);
		await runGit(root, "add", "AGENTS.md");
		await runGit(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial");

		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const result = await runSetupTransaction({ root, discovery, choices: RECOMMENDED_LOCAL_CHOICES });

		expect(result.requiresConfirmation).toBe(false);
		expect(result.plan?.effects.find(effect => effect.target === "AGENTS.md")).toMatchObject({
			classification: "BLOCKING_CONFLICT",
		});
		expect(result.operations).toEqual([]);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("managed-range updates preserve exact authored prefix and suffix bytes", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "ws-setup-managed-range-"));
	const prefix = "# Existing guidance\n\n";
	const suffix = "\nAuthored suffix without terminal newline";
	try {
		await runGit(root, "init", "--quiet");
		await fs.writeFile(
			path.join(root, "AGENTS.md"),
			`${prefix}<!-- WS-AGENT-SKILLS:START -->\nold managed content\n<!-- WS-AGENT-SKILLS:END -->${suffix}`,
		);
		await runGit(root, "add", "AGENTS.md");
		await runGit(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial");

		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const result = await runSetupTransaction({ root, discovery, choices: RECOMMENDED_LOCAL_CHOICES });
		const effect = result.plan?.effects.find(candidate => candidate.target === "AGENTS.md");

		expect(effect).toMatchObject({ classification: "UPDATE" });
		expect(effect?.after?.slice(0, prefix.length)).toBe(prefix);
		expect(effect?.after?.slice(-suffix.length)).toBe(suffix);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("discovery outside git asks for creation and does not mutate", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "ws-setup-not-git-"));
	try {
		const result = await runSetupTransaction({
			root,
			discovery: await discoverStandaloneRepository(root, READY_RUNTIME),
		});
		expect(result.questions.map(q => q.id)).toContain("create_repository");
		expect(result.operations).toHaveLength(0);
		expect(await fs.readdir(root)).toHaveLength(0);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("repository creation requires valid origin and initializes as planned", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "ws-setup-create-repo-"));
	try {
		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);

		// Missing origin -> blocked
		const missingOrigin = await runSetupTransaction({
			root,
			discovery,
			choices: { profile: "recommended_local", createRepository: true },
		});
		expect(missingOrigin.questions.map(q => q.id)).toContain("origin_url");

		// Invalid origin -> blocked
		const invalidOrigin = await runSetupTransaction({
			root,
			discovery,
			choices: { profile: "recommended_local", createRepository: true, origin: "not-a-url" },
		});
		expect(invalidOrigin.report).toContain("Invalid origin URL");
		expect(invalidOrigin.plan?.effects.find(e => e.target === "git:origin")?.classification).toBe("BLOCKING_CONFLICT");

		// Inaccessible origin (injected validation failure) -> blocked
		const inaccessibleOrigin = await runSetupTransaction({
			root,
			discovery,
			choices: { profile: "recommended_local", createRepository: true, origin: "https://example.com/dead.git" },
			injectedOriginValidation: { origin: "https://example.com/dead.git", isValid: false, reason: "Connection refused" },
		});
		expect(inaccessibleOrigin.report).toContain("Connection refused");
		expect(inaccessibleOrigin.plan?.effects.find(e => e.target === "git:origin")?.classification).toBe("BLOCKING_CONFLICT");
		// Valid injected origin -> applied
		const validOrigin = await runSetupTransaction({
			root,
			discovery,
			choices: { profile: "recommended_local", createRepository: true, origin: "https://example.com/repo.git" },
			injectedOriginValidation: { origin: "https://example.com/repo.git", isValid: true },
		});
		expect(validOrigin.requiresConfirmation).toBe(true);
		const auth = validOrigin.plan!.hash;

		const applied = await runSetupTransaction({
			root,
			discovery,
			choices: { profile: "recommended_local", createRepository: true, origin: "https://example.com/repo.git" },
			injectedOriginValidation: { origin: "https://example.com/repo.git", isValid: true },
			authorization: auth,
		});
		expect(applied.report).toContain("WS setup verified");
		expect(applied.operations.some(o => o.target === "git:repository")).toBe(true);
		
		// Git repo was actually created
		const isGit = await fs.stat(path.join(root, ".git"));
		expect(isGit.isDirectory()).toBe(true);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("partial failure stops work, reports state, and reruns correctly", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "ws-setup-partial-failure-"));
	try {
		await runGit(root, "init");
		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const firstRun = await runSetupTransaction({
			root,
			discovery,
			choices: RECOMMENDED_LOCAL_CHOICES,
		});
		const auth = firstRun.plan!.hash;

		// Inject a failure at CONTEXT.md
		const failedRun = await runSetupTransaction({
			root,
			discovery,
			choices: RECOMMENDED_LOCAL_CHOICES,
			authorization: auth,
			injectedFailure: { phase: "write", target: "CONTEXT.md" },
		});

		expect(failedRun.report).toContain("Transaction stopped at CONTEXT.md");
		expect(failedRun.report).toContain("No rollback was performed");
		expect(failedRun.report).toContain("Pending: CONTEXT.md"); // at least CONTEXT.md
		// Rerun should pick up where it left off
		const retryDiscovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const retryPlan = await runSetupTransaction({
			root,
			discovery: retryDiscovery,
			choices: RECOMMENDED_LOCAL_CHOICES,
		});
		
		const retryAuth = retryPlan.plan!.hash;

		// Inject a verify failure on the retry
		const verifyFailedRun = await runSetupTransaction({
			root,
			discovery: retryDiscovery,
			choices: RECOMMENDED_LOCAL_CHOICES,
			authorization: retryAuth,
			injectedFailure: { phase: "verify", target: "CONTEXT.md" },
		});

		expect(verifyFailedRun.report).toContain("Transaction stopped at CONTEXT.md: Injected verify failure");
		expect(verifyFailedRun.report).toContain("Completed: none"); // Failed verify means not complete
		expect(verifyFailedRun.report).toContain("Pending: CONTEXT.md, AGENTS.md, CLAUDE.md");

		// Final run picking up where it left off
		const finalDiscovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const finalPlan = await runSetupTransaction({
			root,
			discovery: finalDiscovery,
			choices: RECOMMENDED_LOCAL_CHOICES,
		});

		const finalAuth = finalPlan.plan!.hash;
		const finalRun = await runSetupTransaction({
			root,
			discovery: finalDiscovery,
			choices: RECOMMENDED_LOCAL_CHOICES,
			authorization: finalAuth,
		});

		expect(finalRun.report).toContain("WS setup verified");
		
		// Initial parts were no-op, remaining parts were executed
		expect(finalRun.plan!.effects.find(e => e.target === ".wsagency/config.yaml")?.classification).toBe("NO-OP");
		expect(finalRun.plan!.effects.find(e => e.target === "CONTEXT.md")?.classification).toBe("NO-OP");
		expect(finalRun.plan!.effects.find(e => e.target === "AGENTS.md")?.classification).toBe("CREATE");
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("discovery distinguishes standalone repositories, hub roots, and working repositories", async () => {
	const outer = await fs.mkdtemp(path.join(os.tmpdir(), "ws-setup-shapes-"));
	try {
		await runGit(outer, "init");
		await fs.writeFile(path.join(outer, "project.yaml"), "schema_version: 1");
		
		const inner = path.join(outer, "subrepo");
		await fs.mkdir(inner);
		await runGit(inner, "init");

		const outerDiscovery = await discoverStandaloneRepository(outer, READY_RUNTIME);
		expect(outerDiscovery.projectShape).toBe("hub_root");

		const innerDiscovery = await discoverStandaloneRepository(inner, READY_RUNTIME);
		expect(innerDiscovery.projectShape).toBe("hub_subrepository");

		// The core transaction supports both shapes; hub fan-out remains owned by hub-transaction.
		const planOuter = await runSetupTransaction({ root: outer, discovery: outerDiscovery, choices: RECOMMENDED_LOCAL_CHOICES });
		expect(planOuter.requiresConfirmation).toBe(true);
		expect(planOuter.plan?.scope.projectShape).toBe("hub_root");

		const planInner = await runSetupTransaction({ root: inner, discovery: innerDiscovery, choices: RECOMMENDED_LOCAL_CHOICES });
		expect(planInner.requiresConfirmation).toBe(true);
		expect(planInner.plan?.scope.projectShape).toBe("hub_subrepository");
	} finally {
		await fs.rm(outer, { recursive: true, force: true });
	}
});

test("plan fingerprints repository identity and revalidates it before write", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "ws-setup-repo-identity-"));
	try {
		await runGit(root, "init");
		// Create a commit so we have a HEAD
		await fs.writeFile(path.join(root, "initial.txt"), "hello");
		await runGit(root, "add", "initial.txt");
		await runGit(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial");
		
		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const planResult = await runSetupTransaction({ root, discovery, choices: RECOMMENDED_LOCAL_CHOICES });
		expect(planResult.requiresConfirmation).toBe(true);
		
		// Mutate repo identity by making another commit
		await fs.writeFile(path.join(root, "second.txt"), "world");
		await runGit(root, "add", "second.txt");
		await runGit(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Second");

		// Attempt to apply original plan -> stale authorization because HEAD changed
		await expect(
			runSetupTransaction({
				root,
				discovery,
				choices: RECOMMENDED_LOCAL_CHOICES,
				authorization: planResult.plan!.hash,
			}),
		).rejects.toThrow("Authorization is stale because the planned target set or payload changed");
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("dirty overlap blocks plan, while unrelated dirty content is preserved", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "ws-setup-dirty-"));
	try {
		await runGit(root, "init", "--quiet");
		
		// Create tracked files
		await fs.writeFile(path.join(root, "unrelated.txt"), "original unrelated\n");
		await fs.writeFile(path.join(root, "CONTEXT.md"), "original context\n");
		await runGit(root, "add", "unrelated.txt", "CONTEXT.md");
		await runGit(root, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Initial");
		
		// Make them dirty
		await fs.writeFile(path.join(root, "unrelated.txt"), "dirty unrelated\n");
		await fs.writeFile(path.join(root, "CONTEXT.md"), "dirty context\n");
		
		const discoveryOverlap = await discoverStandaloneRepository(root, READY_RUNTIME);
		const planOverlap = await runSetupTransaction({ root, discovery: discoveryOverlap, choices: RECOMMENDED_LOCAL_CHOICES });
		
		// Overlap blocks
		expect(planOverlap.report).toContain("Setup blocked before writes:");
		expect(planOverlap.report).toContain("CONTEXT.md");
		expect(planOverlap.report).toContain("Dirty"); // specific reason for dirty overlap
		expect(planOverlap.report).not.toContain("unrelated.txt");

		// Unrelated dirty file is named and preserved
		expect(planOverlap.plan?.effects.find(e => e.target === "unrelated.txt")?.classification).toBe("PRESERVE");
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
