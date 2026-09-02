import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import * as path from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { discoverHubTransaction, runHubTransaction, mergeConfig } from "./hub-transaction.mjs";
import { CANONICAL_CONFIG_YAML } from "./transaction.mjs";

describe("Hub Transaction Core Logic", () => {
	let tempDir;

	before(async () => {
		tempDir = await mkdtemp(path.join(tmpdir(), "ws-hub-test-"));
	});

	after(async () => {
		if (tempDir) await rm(tempDir, { recursive: true, force: true });
	});

	test("mergeConfig overrides hub defaults with valid explicit child values", () => {
		const hub = CANONICAL_CONFIG_YAML;
		const child = `schema_version: 1\ntracker:\n  primary: jira\n  pull_requests: triage\njira:\n  project: PROJ\n  default_issue_type: Task\n  sync: disabled\n`;
		const merged = mergeConfig(hub, child);
		assert.ok(merged.includes("primary: jira"));
		assert.ok(merged.includes("project: PROJ"));
		// Contains hub default for something else
		assert.ok(merged.includes("layout: single_context"));
	});

	test("mergeConfig gracefully falls back when parsing fails", () => {
		const hub = CANONICAL_CONFIG_YAML;
		const child = `malformed[yaml-!`;
		const merged = mergeConfig(hub, child);
		assert.equal(merged, child);
	});
});

describe("Hub Transaction Real Worktree Scenarios", () => {
	let rootDir;

	async function setupGitRepo(repoPath) {
		await mkdir(repoPath, { recursive: true });
		execFileSync("git", ["init"], { cwd: repoPath });
	}

	before(async () => {
		rootDir = await mkdtemp(path.join(tmpdir(), "ws-hub-real-test-"));
		
		// Hub
		await setupGitRepo(rootDir);
		await writeFile(path.join(rootDir, "project.yaml"), `project:
  name: test-hub
repos:
  - name: work1
    path: ./work1
    type: working
  - name: work2
    path: ./work2
    type: working
  - name: out1
    path: ./out1
    type: output
  - name: work3
    path: ./work3
    type: working`);
		
		// Sub-repos
		await setupGitRepo(path.join(rootDir, "work1"));
		await setupGitRepo(path.join(rootDir, "work2"));
		await setupGitRepo(path.join(rootDir, "out1"));
		await setupGitRepo(path.join(rootDir, "work3"));
		
		// Provide explicit config for work2
		await mkdir(path.join(rootDir, "work2", ".wsagency"), { recursive: true });
		await writeFile(path.join(rootDir, "work2", ".wsagency", "config.yaml"), `schema_version: 1\ntracker:\n  primary: jira\n  pull_requests: triage\njira:\n  project: CHILD\n  default_issue_type: Task\n  sync: disabled\n`);
	});

	after(async () => {
		if (rootDir) await rm(rootDir, { recursive: true, force: true });
	});

	const machine = { activeHarness: "omp", sessionDiscipline: true, dangerousGitGuard: true };

	let initialDiscovery;
	let initialPlan;

	test("Hub discovery scope, registry rejection (implicit via working exclusions), and input/output exclusions", async () => {
		initialDiscovery = await discoverHubTransaction(rootDir, machine);
		
		assert.strictEqual(initialDiscovery.registryError, null);
		assert.strictEqual(initialDiscovery.hub.projectShape, "hub_root");
		assert.strictEqual(initialDiscovery.working.length, 3);
		assert.strictEqual(initialDiscovery.working[0].name, "work1");
		assert.strictEqual(initialDiscovery.working[1].name, "work2");
		assert.strictEqual(initialDiscovery.working[2].name, "work3");
		
		// Exclusions check
		assert.strictEqual(initialDiscovery.excluded.length, 1);
		assert.strictEqual(initialDiscovery.excluded[0].name, "out1");
		assert.ok(initialDiscovery.excluded[0].reason.includes("output"));
	});

	test("Hub plan builds successfully and materializes configs", async () => {
		const req = {
			root: rootDir,
			discovery: initialDiscovery,
			choices: {
				removedRepositories: ["work3"] // Selection removal
			}
		};
		const res = await runHubTransaction(req);
		initialPlan = res.plan;
		
		assert.ok(initialPlan);
		assert.ok(res.report.includes("Awaiting authorization"));
		assert.strictEqual(initialPlan.working.length, 2); // work3 removed
		
		const work2Plan = initialPlan.working.find(w => w.name === "work2").plan;
		const work2ConfigEffect = work2Plan.effects.find(e => e.target === ".wsagency/config.yaml");
		
		assert.ok(work2ConfigEffect.after.includes("project: CHILD"));
		assert.ok(work2ConfigEffect.after.includes("layout: single_context")); // from hub default
	});

	test("First-failure stop correctly aborts sequential writes", async () => {
		const req = {
			root: rootDir,
			discovery: initialDiscovery,
			authorization: initialPlan.hash,
			choices: {
				removedRepositories: ["work3"]
			},
			injectedFailure: {
				targetRoot: path.join(rootDir, "work1"),
				phase: "write",
				target: ".wsagency/config.yaml"
			}
		};
		
		const res = await runHubTransaction(req);
		assert.ok(res.report.includes("Injected write failure"));
		assert.ok(res.report.includes("skipped due to previous failure"), "work2 should be skipped because work1 failed");
	});

	test("Interrupted hub transactions require a fresh plan, then aligned reruns stay prompt-free", async () => {
		const resumedDiscovery = await discoverHubTransaction(rootDir, machine);
		const resumedPlan = await runHubTransaction({
			root: rootDir,
			discovery: resumedDiscovery,
			choices: { removedRepositories: ["work3"] },
		});
		const res = await runHubTransaction({
			root: rootDir,
			discovery: resumedDiscovery,
			authorization: resumedPlan.plan.hash,
			choices: { removedRepositories: ["work3"] },
		});
		assert.ok(res.report.includes("WS setup verified"));
		assert.ok(!res.report.includes("skipped due to previous failure"));
		
		// Rediscover and run again (no-op)
		const alignedDiscovery = await discoverHubTransaction(rootDir, machine);
		const rerunReq = {
			root: rootDir,
			discovery: alignedDiscovery,
			choices: { removedRepositories: ["work3"] }
		};
		const rerunRes = await runHubTransaction(rerunReq);
		
		assert.ok(rerunRes.report.includes("No changes required"));
	});
});

describe("Hub Sub-repository non-fan-out", () => {
	let subRepoDir;
	
	before(async () => {
		subRepoDir = await mkdtemp(path.join(tmpdir(), "ws-hub-sub-test-"));
		await mkdir(subRepoDir, { recursive: true });
		execFileSync("git", ["init"], { cwd: subRepoDir });
		await writeFile(path.join(subRepoDir, "project.yaml"), "project:\n  name: ignored-if-ancestor");
		
		const nestedDir = path.join(subRepoDir, "nested");
		await mkdir(nestedDir, { recursive: true });
		execFileSync("git", ["init"], { cwd: nestedDir });
	});

	after(async () => {
		if (subRepoDir) await rm(subRepoDir, { recursive: true, force: true });
	});

	test("A sub-repo invocation remains current-repo only", async () => {
		// For a sub-repository, we wouldn't use discoverHubTransaction; we'd use discoverStandaloneRepository
		// The test ensures the regular logic doesn't magically fan out.
		const { discoverStandaloneRepository } = await import("./transaction.mjs");
		const machine = { activeHarness: "omp", sessionDiscipline: true, dangerousGitGuard: true };
		const nestedDir = path.join(subRepoDir, "nested");
		const discovery = await discoverStandaloneRepository(nestedDir, machine);
		
		assert.strictEqual(discovery.projectShape, "hub_subrepository");
		// Since it's evaluated as a standalone (subrepo), it does not fan out.
		assert.ok(!discovery.working);
	});
});
