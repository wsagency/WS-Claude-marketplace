import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { discoverHubTransaction, mergeConfig, runHubTransaction } from "./hub-transaction.mjs";
import { CANONICAL_CONFIG_YAML } from "./transaction.mjs";

const MACHINE = { activeHarness: "omp", sessionDiscipline: true, dangerousGitGuard: true };
const temporaryRoots = [];

function git(root, ...args) {
	return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function exists(target) {
	try {
		await access(target);
		return true;
	} catch {
		return false;
	}
}

async function initRepository(root, name, { origin = `https://example.test/ws/${name}.git` } = {}) {
	await mkdir(root, { recursive: true });
	git(root, "init", "--quiet");
	git(root, "config", "user.name", "WS Test");
	git(root, "config", "user.email", "ws-test@example.test");
	await writeFile(path.join(root, "README.md"), `# ${name}\n`);
	git(root, "add", "README.md");
	git(root, "commit", "--quiet", "-m", "test: seed repository");
	if (origin) git(root, "remote", "add", "origin", origin);
}

function registryEntry({ name, repoPath = `./${name}`, type = "working", purpose, url = `https://example.test/ws/${name}.git` }) {
	return [
		`  - name: ${name}`,
		`    path: ${repoPath}`,
		`    url: ${url}`,
		`    description: ${name} repository`,
		`    type: ${type}`,
		...(purpose ? [`    purpose: ${purpose}`] : []),
	].join("\n");
}

async function createHub(entries, { create = [] } = {}) {
	const parent = await mkdtemp(path.join(tmpdir(), "ws-hub-transaction-"));
	temporaryRoots.push(parent);
	const hubRoot = path.join(parent, "product-main");
	await initRepository(hubRoot, "product-main");
	for (const repository of create) {
		if (repository.kind === "directory") await mkdir(path.join(hubRoot, repository.name), { recursive: true });
		else if (repository.kind === "file") await writeFile(path.join(hubRoot, repository.name), "not a repository\n");
		else await initRepository(path.join(hubRoot, repository.name), repository.name, { origin: repository.origin });
	}
	const ignored = create.filter(repository => repository.kind !== "file").map(repository => `/${repository.name}/`).join("\n");
	await writeFile(path.join(hubRoot, ".gitignore"), `${ignored}${ignored ? "\n" : ""}`);
	await writeFile(path.join(hubRoot, "project.yaml"), [
		"project:",
		"  name: product",
		"  description: Test product",
		"  conventions: 2",
		"repos:",
		...entries,
		"",
	].join("\n"));
	git(hubRoot, "add", ".gitignore", "project.yaml");
	git(hubRoot, "commit", "--quiet", "-m", "test: add hub registry");
	return { parent, hubRoot };
}

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("hub configuration materialization", () => {
	test("valid explicit child values win over hub defaults", () => {
		const child = CANONICAL_CONFIG_YAML.replace("primary: local", "primary: github");
		const merged = mergeConfig(CANONICAL_CONFIG_YAML, child);
		assert.match(merged, /primary: github/);
		assert.match(merged, /layout: single_context/);
	});

	test("known older canonical state is migrated to schema version one", async () => {
		const { hubRoot } = await createHub([]);
		await mkdir(path.join(hubRoot, ".wsagency"));
		await writeFile(path.join(hubRoot, ".wsagency", "config.yaml"), "schema_version: 0\n");
		git(hubRoot, "add", ".wsagency/config.yaml");
		git(hubRoot, "commit", "--quiet", "-m", "test: add older canonical config");
		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const planned = await runHubTransaction({ root: hubRoot, discovery });
		assert.equal(
			planned.plan.hub.effects.find(effect => effect.target === ".wsagency/config.yaml").classification,
			"UPDATE",
		);
		const applied = await runHubTransaction({ root: hubRoot, discovery, authorization: planned.plan.hash });
		assert.match(await readFile(path.join(hubRoot, ".wsagency", "config.yaml"), "utf8"), /^schema_version: 1$/m);
	});

	test("each hub target composes semantic pre-5 values before core setup", async () => {
		const { hubRoot } = await createHub([registryEntry({ name: "work" })], { create: [{ name: "work" }] });
		const workRoot = path.join(hubRoot, "work");
		await mkdir(path.join(workRoot, ".claude"), { recursive: true });
		await writeFile(path.join(workRoot, ".claude", "docs-config.yaml"), `docs:
  user_track: handbook
  dev_track: engineering-docs
  default_audience: user
  default_scope: repo
  auto:
    changelog_per_commit: false
    adr_for_arch_changes: true
`);
		git(workRoot, "add", ".claude/docs-config.yaml");
		git(workRoot, "commit", "--quiet", "-m", "test: add pre-5 docs policy");
		const choices = {
			documentation: true,
			working: {
				work: {
					migration: { resolutions: { "changelog.update_mode": "pull_request" } },
				},
			},
		};

		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const planned = await runHubTransaction({ root: hubRoot, discovery, choices });
		const child = planned.plan.targets.find(target => target.name === "work");
		const configEffect = child.core.effects.find(effect => effect.target === ".wsagency/config.yaml");
		assert.match(configEffect.after, /user_track: handbook/);
		assert.match(configEffect.after, /dev_track: engineering-docs/);

		const applied = await runHubTransaction({
			root: hubRoot,
			discovery,
			choices,
			authorization: planned.plan.hash,
		});
		assert.equal(applied.outcomes.some(outcome => outcome.status === "failed"), false);
		assert.match(await readFile(path.join(workRoot, ".wsagency", "config.yaml"), "utf8"), /user_track: handbook/);
		assert.equal(await exists(path.join(workRoot, "handbook", "index.md")), true);
		assert.equal(await exists(path.join(workRoot, ".claude", "docs-config.yaml")), false);
	});
});

describe("complete hub preflight", () => {
	test("missing, escaping, non-git, inaccessible, invalid-origin, and duplicate selected targets block every write until explicitly excluded", async () => {
		const outside = await mkdtemp(path.join(tmpdir(), "ws-hub-outside-"));
		temporaryRoots.push(outside);
		await initRepository(outside, "escape");
		const entries = [
			registryEntry({ name: "valid" }),
			registryEntry({ name: "missing" }),
			registryEntry({ name: "escape", repoPath: path.relative(path.join(outside, "placeholder"), outside) === "." ? "../escape" : "../../escape" }),
			registryEntry({ name: "non-git" }),
			registryEntry({ name: "not-directory" }),
			registryEntry({ name: "bad-origin" }),
			registryEntry({ name: "duplicate", repoPath: "./valid", url: "https://example.test/ws/valid.git" }),
			registryEntry({ name: "delivery", type: "input" }),
			registryEntry({ name: "product-docs", type: "output", purpose: "docs" }),
		];
		const { hubRoot } = await createHub(entries, {
			create: [
				{ name: "valid" },
				{ name: "non-git", kind: "directory" },
				{ name: "not-directory", kind: "file" },
				{ name: "bad-origin", origin: null },
			],
		});

		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		assert.deepEqual(discovery.working.map(repository => repository.name), [
			"valid",
			"missing",
			"escape",
			"non-git",
			"not-directory",
			"bad-origin",
			"duplicate",
		]);
		assert.deepEqual(discovery.excluded.map(repository => repository.name), ["delivery", "product-docs"]);

		const blocked = await runHubTransaction({ root: hubRoot, discovery });
		assert.equal(blocked.requiresConfirmation, false);
		assert.equal(blocked.operations.length, 0);
		assert.deepEqual(new Set(blocked.blockers.map(blocker => blocker.repository)), new Set([
			"missing",
			"escape",
			"non-git",
			"not-directory",
			"bad-origin",
			"duplicate",
		]));
		assert.equal(await exists(path.join(hubRoot, ".wsagency")), false);
		assert.equal(await exists(path.join(hubRoot, "valid", ".wsagency")), false);

		const removedRepositories = ["missing", "escape", "non-git", "not-directory", "bad-origin", "duplicate"];
		const selectable = await runHubTransaction({ root: hubRoot, discovery, choices: { removedRepositories } });
		assert.equal(selectable.requiresConfirmation, true);
		assert.equal(selectable.blockers.length, 0);
		assert.deepEqual(
			selectable.outcomes.filter(outcome => outcome.status === "excluded").map(outcome => outcome.repository),
			["delivery", "product-docs", ...removedRepositories],
		);
	});

	test("documented sibling repository paths remain inside the hub workspace boundary", async () => {
		const { parent, hubRoot } = await createHub([
			registryEntry({ name: "work", repoPath: "../work" }),
		]);
		const siblingRoot = path.join(parent, "work");
		await initRepository(siblingRoot, "work");

		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const planned = await runHubTransaction({ root: hubRoot, discovery });
		assert.equal(planned.blockers.length, 0);
		assert.equal(planned.requiresConfirmation, true);

		const applied = await runHubTransaction({
			root: hubRoot,
			discovery,
			authorization: planned.plan.hash,
		});
		assert.equal(await exists(path.join(siblingRoot, ".wsagency", "config.yaml")), true);
		assert.ok(applied.operations.some(operation => operation.repository === "work" && operation.phase === "core"));
	});

	test("a working repository resolving to the hub root is a duplicate blocker", async () => {
		const { hubRoot } = await createHub([
			registryEntry({
				name: "self",
				repoPath: ".",
				url: "https://example.test/ws/product-main.git",
			}),
		]);
		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const blocked = await runHubTransaction({ root: hubRoot, discovery });
		assert.equal(blocked.requiresConfirmation, false);
		assert.equal(blocked.operations.length, 0);
		assert.ok(blocked.blockers.some(blocker => blocker.repository === "self" && /duplicate/i.test(blocker.reason)));
		assert.equal(await exists(path.join(hubRoot, ".wsagency")), false);
	});
});

	test("symlinked managed targets in a later root block the entire hub before writes", async () => {
		const { hubRoot } = await createHub(
			[registryEntry({ name: "work-a" }), registryEntry({ name: "work-b" })],
			{ create: [{ name: "work-a" }, { name: "work-b" }] },
		);
		const outside = await mkdtemp(path.join(tmpdir(), "ws-hub-managed-outside-"));
		temporaryRoots.push(outside);
		await writeFile(path.join(outside, "config.yaml"), CANONICAL_CONFIG_YAML);
		await mkdir(path.join(hubRoot, "work-b", ".wsagency"));
		await symlink(
			path.join(outside, "config.yaml"),
			path.join(hubRoot, "work-b", ".wsagency", "config.yaml"),
		);

		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const blocked = await runHubTransaction({ root: hubRoot, discovery });
		assert.equal(blocked.requiresConfirmation, false);
		assert.ok(blocked.blockers.some(blocker =>
			blocker.repository === "work-b"
			&& blocker.target === ".wsagency/config.yaml"
		));
		assert.equal(await exists(path.join(hubRoot, ".wsagency", "config.yaml")), false);
		assert.equal(await exists(path.join(hubRoot, "work-a", ".wsagency", "config.yaml")), false);
	});

describe("dirty-path preflight", () => {
	test("names and preserves tracked and untracked dirty paths outside the manifest", async () => {
		const { hubRoot } = await createHub([registryEntry({ name: "work" })], { create: [{ name: "work" }] });
		await writeFile(path.join(hubRoot, "notes.txt"), "baseline\n");
		git(hubRoot, "add", "notes.txt");
		git(hubRoot, "commit", "--quiet", "-m", "test: add authored notes");
		await writeFile(path.join(hubRoot, "notes.txt"), "authored change\n");
		await writeFile(path.join(hubRoot, "scratch.txt"), "untracked authored work\n");

		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const result = await runHubTransaction({ root: hubRoot, discovery });
		assert.equal(result.blockers.length, 0);
		const hubPlan = result.plan.targets.find(target => target.name === "hub").core;
		const preservedDirty = hubPlan.effects
			.filter(effect => effect.classification === "PRESERVE" && effect.reason.includes("uncommitted"))
			.map(effect => effect.target);
		assert.deepEqual(preservedDirty, ["notes.txt", "scratch.txt"]);
	});

	test("blocks dirty planned files and unprovable managed ranges before every repository write", async () => {
		const { hubRoot } = await createHub([registryEntry({ name: "work" })], { create: [{ name: "work" }] });
		await writeFile(path.join(hubRoot, "CONTEXT.md"), "# Authored context\n");
		await writeFile(path.join(hubRoot, "AGENTS.md"), "# Authored instructions\n");
		git(hubRoot, "add", "CONTEXT.md", "AGENTS.md");
		git(hubRoot, "commit", "--quiet", "-m", "test: add authored setup paths");
		await writeFile(path.join(hubRoot, "CONTEXT.md"), "# Dirty authored context\n");
		await writeFile(path.join(hubRoot, "AGENTS.md"), "# Dirty authored instructions\n");

		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const result = await runHubTransaction({ root: hubRoot, discovery });
		assert.equal(result.requiresConfirmation, false);
		assert.equal(result.operations.length, 0);
		assert.deepEqual(
			result.blockers.filter(blocker => blocker.repository === "hub").map(blocker => blocker.target),
			["CONTEXT.md", "AGENTS.md"],
		);
		assert.equal(await exists(path.join(hubRoot, ".wsagency")), false);
		assert.equal(await exists(path.join(hubRoot, "work", ".wsagency")), false);
	});
});

describe("ordered hub apply", () => {
	test("runs machine prerequisites once, every core in registry order, then every docs bootstrap", async () => {
		const entries = [
			registryEntry({ name: "work-a" }),
			registryEntry({ name: "delivery", type: "input" }),
			registryEntry({ name: "work-b" }),
			registryEntry({ name: "product-docs", type: "output", purpose: "docs" }),
		];
		const { hubRoot } = await createHub(entries, { create: [{ name: "work-a" }, { name: "work-b" }] });
		await writeFile(path.join(hubRoot, "CONTEXT.md"), "# Authored product context\n");
		git(hubRoot, "add", "CONTEXT.md");
		git(hubRoot, "commit", "--quiet", "-m", "test: add authored product context");
		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const choices = { documentation: true };
		const planned = await runHubTransaction({ root: hubRoot, discovery, choices });
		let prerequisiteCalls = 0;
		const applied = await runHubTransaction({
			root: hubRoot,
			discovery,
			choices,
			authorization: planned.plan.hash,
			machinePrerequisite: async () => {
				prerequisiteCalls += 1;
			},
		});

		assert.equal(prerequisiteCalls, 1);
		const boundaries = applied.operations
			.map(operation => `${operation.repository}:${operation.phase}`)
			.filter((boundary, index, all) => index === 0 || boundary !== all[index - 1]);
		assert.deepEqual(boundaries, [
			"machine:machine",
			"hub:core",
			"work-a:core",
			"work-b:core",
			"work-a:docs",
			"work-b:docs",
			"hub:docs",
		]);
		const firstDocs = applied.operations.findIndex(operation => operation.phase === "docs");
		const lastCore = applied.operations.findLastIndex(operation => operation.phase === "core");
		assert.ok(firstDocs > lastCore);
		assert.equal(await readFile(path.join(hubRoot, "dev-docs/index.md"), "utf8"), "# Internal Documentation\n\nWelcome to the dev-docs.\n");
		assert.equal(await readFile(path.join(hubRoot, "work-b", "dev-docs/index.md"), "utf8"), "# Internal Documentation\n\nWelcome to the dev-docs.\n");
		assert.equal(await readFile(path.join(hubRoot, "work-a", "docs/index.md"), "utf8"), "# Documentation\n\nWelcome to the documentation.\n");
		assert.equal(await exists(path.join(hubRoot, "docs", "index.md")), false);
		assert.equal(applied.readiness.hub.docsReady, true);
		assert.equal(applied.readiness.working["work-a"].docsReady, true);
		assert.equal(applied.readiness.working["work-b"].docsReady, true);
		assert.deepEqual(
			new Set(applied.outcomes.map(outcome => outcome.status)),
			new Set(["completed", "preserved", "skipped", "excluded", "no-op"]),
		);
	});
});

describe("drift and first-failure recovery", () => {
	test("rediscovers the entire selected manifest at apply and writes nothing when registry state drifted", async () => {
		const { hubRoot } = await createHub([registryEntry({ name: "work" })], { create: [{ name: "work" }] });
		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const planned = await runHubTransaction({ root: hubRoot, discovery });
		await writeFile(path.join(hubRoot, "project.yaml"), `${await readFile(path.join(hubRoot, "project.yaml"), "utf8")}# drift\n`);

		const applied = await runHubTransaction({ root: hubRoot, discovery, authorization: planned.plan.hash });
		assert.equal(applied.operations.length, 0);
		assert.match(applied.report, /Authorization is stale/);
		assert.equal(await exists(path.join(hubRoot, ".wsagency")), false);
		assert.equal(await exists(path.join(hubRoot, "work", ".wsagency")), false);
	});

	test("revalidates each root immediately before its first write", async t => {
		for (const failingName of ["hub", "work-a", "work-b"]) {
			await t.test(failingName, async () => {
				const { hubRoot } = await createHub(
					[registryEntry({ name: "work-a" }), registryEntry({ name: "work-b" })],
					{ create: [{ name: "work-a" }, { name: "work-b" }] },
				);
				const roots = { hub: hubRoot, "work-a": path.join(hubRoot, "work-a"), "work-b": path.join(hubRoot, "work-b") };
				const discovery = await discoverHubTransaction(hubRoot, MACHINE);
				const planned = await runHubTransaction({ root: hubRoot, discovery });
				const applied = await runHubTransaction({
					root: hubRoot,
					discovery,
					authorization: planned.plan.hash,
					beforePhase: async boundary => {
						if (boundary.phase === "core" && boundary.repository === failingName) {
							await writeFile(path.join(boundary.root, "drift.txt"), "pre-write drift\n");
						}
					},
				});

				assert.equal(applied.outcomes.some(outcome => outcome.repository === failingName && outcome.phase === "core" && outcome.status === "failed"), true);
				const failingIndex = ["hub", "work-a", "work-b"].indexOf(failingName);
				for (const pendingName of ["hub", "work-a", "work-b"].slice(failingIndex + 1)) {
					assert.equal(applied.outcomes.some(outcome => outcome.repository === pendingName && outcome.phase === "core" && outcome.status === "pending"), true);
					assert.equal(await exists(path.join(roots[pendingName], ".wsagency")), false);
				}
			});
		}
	});

	test("stops at a core failure at every repository boundary and fresh authorization recovers missing-only", async t => {
		for (const failingName of ["hub", "work-a", "work-b"]) {
			await t.test(failingName, async () => {
				const { hubRoot } = await createHub(
					[registryEntry({ name: "work-a" }), registryEntry({ name: "work-b" })],
					{ create: [{ name: "work-a" }, { name: "work-b" }] },
				);
				const roots = { hub: hubRoot, "work-a": path.join(hubRoot, "work-a"), "work-b": path.join(hubRoot, "work-b") };
				const discovery = await discoverHubTransaction(hubRoot, MACHINE);
				const planned = await runHubTransaction({ root: hubRoot, discovery });
				const failed = await runHubTransaction({
					root: hubRoot,
					discovery,
					authorization: planned.plan.hash,
					injectedFailure: {
						targetRoot: roots[failingName],
						phase: "core_write",
						target: ".wsagency/config.yaml",
					},
				});
				const failingIndex = ["hub", "work-a", "work-b"].indexOf(failingName);
				assert.equal(failed.outcomes.some(outcome =>
					outcome.repository === failingName
					&& outcome.phase === "core"
					&& outcome.status === "failed"
					&& outcome.target === ".wsagency/config.yaml"
				), true);
				for (const completedName of ["hub", "work-a", "work-b"].slice(0, failingIndex)) {
					assert.equal(failed.outcomes.some(outcome =>
						outcome.repository === completedName
						&& outcome.phase === "core"
						&& outcome.status === "completed"
						&& outcome.target === ".wsagency/config.yaml"
					), true);
				}
				assert.equal(failed.rerunInstruction, "/ws-setup");
				for (const pendingName of ["hub", "work-a", "work-b"].slice(failingIndex + 1)) {
					assert.equal(failed.outcomes.some(outcome => outcome.repository === pendingName && outcome.phase === "core" && outcome.status === "pending"), true);
					assert.equal(failed.outcomes.some(outcome =>
						outcome.repository === pendingName
						&& outcome.phase === "core"
						&& outcome.status === "pending"
						&& outcome.target === ".wsagency/config.yaml"
					), true);
					assert.equal(await exists(path.join(roots[pendingName], ".wsagency")), false);
				}

				const recoveryDiscovery = await discoverHubTransaction(hubRoot, MACHINE);
				const recoveryPlan = await runHubTransaction({ root: hubRoot, discovery: recoveryDiscovery });
				assert.equal(recoveryPlan.requiresConfirmation, true);
				const recovered = await runHubTransaction({
					root: hubRoot,
					discovery: recoveryDiscovery,
					authorization: recoveryPlan.plan.hash,
				});
				assert.equal(recovered.outcomes.some(outcome => outcome.status === "failed"), false);
				for (const root of Object.values(roots)) assert.equal(await exists(path.join(root, ".wsagency", "config.yaml")), true);
			});
		}
	});
});
describe("documentation failure recovery", () => {
	test("stops at a docs failure at every repository boundary and preserves authored content on missing-only recovery", async t => {
		for (const failingName of ["hub", "work-a", "work-b"]) {
			await t.test(failingName, async () => {
				const { hubRoot } = await createHub(
					[registryEntry({ name: "work-a" }), registryEntry({ name: "work-b" })],
					{ create: [{ name: "work-a" }, { name: "work-b" }] },
				);
				const roots = { hub: hubRoot, "work-a": path.join(hubRoot, "work-a"), "work-b": path.join(hubRoot, "work-b") };
				const authored = "# Authored contribution policy\n";
				await writeFile(path.join(roots[failingName], "CONTRIBUTING.md"), authored);
				git(roots[failingName], "add", "CONTRIBUTING.md");
				git(roots[failingName], "commit", "--quiet", "-m", "test: add authored contribution policy");
				const choices = { documentation: true };
				const discovery = await discoverHubTransaction(hubRoot, MACHINE);
				const planned = await runHubTransaction({ root: hubRoot, discovery, choices });
				const failed = await runHubTransaction({
					root: hubRoot,
					discovery,
					choices,
					authorization: planned.plan.hash,
					injectedFailure: {
						targetRoot: roots[failingName],
						phase: "docs_write",
						target: "CHANGELOG.md",
					},
				});
				assert.equal(failed.outcomes.some(outcome =>
					outcome.repository === failingName
					&& outcome.phase === "docs"
					&& outcome.status === "failed"
					&& outcome.target === "CHANGELOG.md"
				), true);
				assert.equal(failed.operations.filter(operation => operation.phase === "core").length > 0, true);
				const docsOrder = ["work-a", "work-b", "hub"];
				const failingIndex = docsOrder.indexOf(failingName);
				for (const pendingName of docsOrder.slice(failingIndex + 1)) {
					assert.equal(failed.outcomes.some(outcome =>
						outcome.repository === pendingName
						&& outcome.phase === "docs"
						&& outcome.status === "pending"
						&& outcome.target === "CHANGELOG.md"
					), true);
				}

				const recoveryDiscovery = await discoverHubTransaction(hubRoot, MACHINE);
				const recoveryPlan = await runHubTransaction({ root: hubRoot, discovery: recoveryDiscovery, choices });
				assert.equal(recoveryPlan.requiresConfirmation, true);
				const recovered = await runHubTransaction({
					root: hubRoot,
					discovery: recoveryDiscovery,
					choices,
					authorization: recoveryPlan.plan.hash,
				});
				assert.equal(recovered.outcomes.some(outcome => outcome.status === "failed"), false);
				assert.equal(await readFile(path.join(roots[failingName], "CONTRIBUTING.md"), "utf8"), authored);
				for (const root of Object.values(roots)) assert.equal(await exists(path.join(root, "dev-docs", "index.md")), true);
			});
		}
	});

	test("an aligned rerun is an exact prompt-free no-op", async () => {
		const { hubRoot } = await createHub([registryEntry({ name: "work" })], { create: [{ name: "work" }] });
		const choices = { documentation: true };
		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const planned = await runHubTransaction({ root: hubRoot, discovery, choices });
		await runHubTransaction({ root: hubRoot, discovery, choices, authorization: planned.plan.hash });

		const alignedDiscovery = await discoverHubTransaction(hubRoot, MACHINE);
		const aligned = await runHubTransaction({ root: hubRoot, discovery: alignedDiscovery, choices });
		assert.equal(aligned.requiresConfirmation, false);
		assert.equal(aligned.operations.length, 0);
		assert.equal(aligned.blockers.length, 0);
		assert.match(aligned.report, /No changes required/);
		assert.equal(aligned.outcomes.some(outcome => outcome.status === "no-op"), true);
		assert.equal(aligned.readiness.hub.docsReady, true);
		assert.equal(aligned.readiness.working.work.docsReady, true);
	});
});

describe("hub backfill integration", () => {
	test("orchestrates per-target backfill plans, prevents bleeding, and executes in exact order", async () => {
		const { hubRoot } = await createHub(
			[registryEntry({ name: "work-a" }), registryEntry({ name: "work-b" })],
			{ create: [{ name: "work-a" }, { name: "work-b" }] },
		);
		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const choices = { documentation: true };

		const logs = [];
		const factoryCalls = new Set();

		const createMockBackfill = (repoName, driftAt = null, failExecute = false) => {
			return {
				audit: { missing: [], stale: [], duplicated: [], conflicting: [], valid: [] },
				plan: { unmapped: [{ localId: `local-1-${repoName}`, proposedProject: "PROJ", proposedType: "Task", mappedFields: {}, unsupportedFields: [], sourceLink: "link", correlationToken: `token-${repoName}` }], project: "PROJ", defaultType: "Task" },
				effects: [{ order: 201, target: `jira:PROJ:local-1-${repoName}`, kind: "external", classification: "CREATE", reason: "Create", diff: "diff", fingerprint: "token" }],
				localTicketsFingerprint: `local-hash-${repoName}`,
				syncFingerprint: `sync-hash-${repoName}`,
				blockers: [],
				input: { repoName, isDrifted: false },
				driftAt,
				failExecute
			};
		};

		const backfillFactory = {
			usesLocalJiraBackfill: () => true,
			plan: async (config, target) => {
				factoryCalls.add(target.repository);
				return createMockBackfill(target.repository);
			},
			publicPlan: (backfill) => ({ audit: backfill.audit, plan: backfill.plan, effects: backfill.effects, localTicketsFingerprint: backfill.localTicketsFingerprint, syncFingerprint: backfill.syncFingerprint }),
			execute: async (backfill) => {
				logs.push(`execute-backfill:${backfill.input.repoName}`);
				if (backfill.failExecute) throw new Error(`simulated-failure:${backfill.input.repoName}`);
				return { completed: [`local-1-${backfill.input.repoName}`], pending: [], errors: [], nextSyncState: {} };
			},
			refresh: async (backfill) => {
				logs.push(`refresh-backfill:${backfill.input.repoName}`);
				if (backfill.driftAt === logs.length) throw new Error(`Drift detected in ${backfill.input.repoName}`);
				return backfill;
			},
			withReadiness: (readiness) => readiness,
			operations: () => [{ action: "verify", target: "mock" }],
			failure: (exec, err) => ({ target: "mock", completed: [], pending: [] })
		};

		const beforePhase = async ({ repository, phase }) => {
			logs.push(`beforePhase:${phase}:${repository}`);
		};

		// 1. Success Path & Ordering
		const planned = await runHubTransaction({ root: hubRoot, discovery, choices, backfill: backfillFactory });

		assert.equal(factoryCalls.has("hub"), true);
		assert.equal(factoryCalls.has("work-a"), true);
		assert.equal(factoryCalls.has("work-b"), true);

		const backfillEffectsHub = planned.plan.targets.find(t => t.name === "hub").backfill.effects;
		assert.equal(backfillEffectsHub.length, 1);
		assert.equal(backfillEffectsHub[0].classification, "CREATE");

		const applied = await runHubTransaction({ root: hubRoot, discovery, choices, authorization: planned.plan.hash, backfill: backfillFactory, beforePhase });

		// Verify Exact Execution Order
		const expectedOrder = [
			// Preflight (all)
			"refresh-backfill:hub", "refresh-backfill:work-a", "refresh-backfill:work-b",
			// Core (all)
			"beforePhase:core:hub", "beforePhase:core:work-a", "beforePhase:core:work-b",
			// Backfill (all)
			"beforePhase:backfill:hub", "refresh-backfill:hub", "execute-backfill:hub",
			"beforePhase:backfill:work-a", "refresh-backfill:work-a", "execute-backfill:work-a",
			"beforePhase:backfill:work-b", "refresh-backfill:work-b", "execute-backfill:work-b",
			// Docs (working repositories before the hub)
			"beforePhase:docs:work-a", "beforePhase:docs:work-b", "beforePhase:docs:hub"
		];
		assert.deepEqual(logs.filter(l => !l.startsWith("beforePhase:cleanup")), expectedOrder);

		// Verify target adapters didn't bleed (each execute got its own repoName)
		const executeLogs = logs.filter(l => l.startsWith("execute-backfill"));
		assert.deepEqual(executeLogs, ["execute-backfill:hub", "execute-backfill:work-a", "execute-backfill:work-b"]);
	});

	test("stops completely on preflight drift, writing nothing", async () => {
		const { hubRoot } = await createHub([registryEntry({ name: "work-a" })], { create: [{ name: "work-a" }] });
		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const backfillFactory = {
			usesLocalJiraBackfill: () => true,
			plan: async (config, target) => ({
				audit: { missing: [], stale: [], duplicated: [], conflicting: [], valid: [] },
				plan: { unmapped: [] },
				effects: [],
				localTicketsFingerprint: "hash",
				syncFingerprint: "hash",
				input: { repoName: target.repository }
			}),
			publicPlan: (backfill) => backfill,
			refresh: async (backfill) => { throw new Error("Drift detected during preflight"); },
			execute: async () => assert.fail("Should not execute"),
			operations: () => [],
			failure: () => ({ target: "mock", completed: [], pending: [] })
		};

		const planned = await runHubTransaction({ root: hubRoot, discovery, backfill: backfillFactory });
		const applied = await runHubTransaction({ root: hubRoot, discovery, authorization: planned.plan.hash, backfill: backfillFactory });

		assert.match(applied.report, /Global composite preflight failed; no mutations were performed/);
		assert.equal(applied.operations.length, 0);
		assert.ok(applied.outcomes.some(o => o.phase === "preflight" && o.status === "failed"));
	});

	test("stops immediately before backfill execution on drift, leaving docs pending", async () => {
		const { hubRoot } = await createHub([registryEntry({ name: "work-a" })], { create: [{ name: "work-a" }] });
		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const choices = { documentation: true };

		let refreshCount = 0;
		const backfillFactory = {
			usesLocalJiraBackfill: () => true,
			plan: async (config, target) => ({
				audit: { missing: [], stale: [], duplicated: [], conflicting: [], valid: [] },
				plan: { unmapped: [{ localId: "1", proposedProject: "P", proposedType: "T", mappedFields: {}, unsupportedFields: [], sourceLink: "l", correlationToken: "t" }] },
				effects: [{ order: 201, target: "jira", kind: "ext", classification: "CREATE", reason: "", diff: "", fingerprint: "" }],
				localTicketsFingerprint: "hash",
				syncFingerprint: "hash",
				input: { repoName: target.repository }
			}),
			publicPlan: (backfill) => backfill,
			refresh: async (backfill) => {
				refreshCount++;
				// Preflight passes (refreshCount 1 and 2 for hub and work-a)
				// Hub execution passes (refreshCount 3)
				// Work-a execution fails (refreshCount 4)
				if (refreshCount === 4) throw new Error("Drift detected before execution");
				return backfill;
			},
			execute: async (backfill) => {
				if (backfill.input.repoName === "work-a") assert.fail("Should not execute drifted backfill");
				return { completed: ["1"], pending: [], errors: [], nextSyncState: {} };
			},
			withReadiness: (r) => r,
			operations: () => [{ action: "verify", target: "mock" }],
			failure: (exec, err) => ({ target: "mock", completed: [], pending: ["1"] })
		};

		const planned = await runHubTransaction({ root: hubRoot, discovery, choices, backfill: backfillFactory });
		const applied = await runHubTransaction({ root: hubRoot, discovery, choices, authorization: planned.plan.hash, backfill: backfillFactory });

		assert.match(applied.report, /Local\/Jira backfill stopped at the first failure/);
		assert.ok(applied.outcomes.some(o => o.repository === "work-a" && o.phase === "backfill" && o.status === "failed"));
		assert.ok(applied.outcomes.some(o => o.repository === "work-a" && o.phase === "docs" && o.status === "pending"));
	});

	test("stops on the first backfill failure and marks every later target pending", async () => {
		const { hubRoot } = await createHub(
			[registryEntry({ name: "work-a" }), registryEntry({ name: "work-b" })],
			{ create: [{ name: "work-a" }, { name: "work-b" }] },
		);
		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const choices = { documentation: true };
		const executed = [];
		const backfillFactory = {
			usesLocalJiraBackfill: () => true,
			plan: async (config, target) => ({
				audit: { missing: [], stale: [], duplicated: [], conflicting: [], valid: [] },
				plan: {
					unmapped: [{
						localId: `local-${target.repository}`,
						proposedProject: "P",
						proposedType: "Task",
						mappedFields: {},
						unsupportedFields: [],
						sourceLink: "link",
						correlationToken: `token-${target.repository}`,
					}],
				},
				effects: [{
					order: 201,
					target: `jira:${target.repository}`,
					kind: "external",
					classification: "CREATE",
					reason: "Create",
					diff: "diff",
					fingerprint: `token-${target.repository}`,
				}],
				localTicketsFingerprint: `local-${target.repository}`,
				syncFingerprint: `sync-${target.repository}`,
				blockers: [],
				input: { repository: target.repository },
			}),
			publicPlan: backfill => ({
				audit: backfill.audit,
				plan: backfill.plan,
				effects: backfill.effects,
				localTicketsFingerprint: backfill.localTicketsFingerprint,
				syncFingerprint: backfill.syncFingerprint,
			}),
			refresh: async backfill => backfill,
			execute: async backfill => {
				executed.push(backfill.input.repository);
				if (backfill.input.repository === "work-a") throw new Error("simulated work-a failure");
				return { completed: [`local-${backfill.input.repository}`], pending: [], errors: [], nextSyncState: {} };
			},
			withReadiness: readiness => readiness,
			operations: () => [{ action: "verify", target: "mock" }],
			failure: (execution, error) => ({
				target: "mock",
				completed: [],
				pending: [],
				error: error.message,
			}),
		};
		const planned = await runHubTransaction({ root: hubRoot, discovery, choices, backfill: backfillFactory });

		const applied = await runHubTransaction({
			root: hubRoot,
			discovery,
			choices,
			authorization: planned.plan.hash,
			backfill: backfillFactory,
		});

		assert.deepEqual(executed, ["hub", "work-a"]);
		assert.equal(applied.outcomes.some(outcome =>
			outcome.repository === "work-a" && outcome.phase === "backfill" && outcome.status === "failed"
		), true);
		assert.equal(applied.outcomes.some(outcome =>
			outcome.repository === "work-b" && outcome.phase === "backfill" && outcome.status === "pending"
		), true);
		assert.equal(applied.outcomes.some(outcome =>
			outcome.repository === "work-b" && outcome.phase === "docs" && outcome.status === "pending"
		), true);
	});

	test("manifest payload is sanitized of local metadata", async () => {
		const { hubRoot } = await createHub([registryEntry({ name: "work-a" })], { create: [{ name: "work-a" }] });
		const discovery = await discoverHubTransaction(hubRoot, MACHINE);
		const backfillFactory = {
			usesLocalJiraBackfill: () => true,
			plan: async (config, target) => ({
				audit: { missing: [], stale: [], duplicated: [], conflicting: [], valid: [] },
				plan: { unmapped: [] },
				effects: [],
				localTicketsFingerprint: "hash",
				syncFingerprint: "hash",
				input: { localMetadata: "SECRET" }
			}),
			publicPlan: (backfill) => ({ ...backfill, input: undefined }),
		};

		const planned = await runHubTransaction({ root: hubRoot, discovery, backfill: backfillFactory });
		assert.equal(JSON.stringify(planned.plan).includes("SECRET"), false);
	});
});
