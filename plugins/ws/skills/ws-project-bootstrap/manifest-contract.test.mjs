import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseCanonicalConfigYaml } from "./config.mjs";
import { discoverHubTransaction } from "./hub-transaction.mjs";
import { runManifestTransaction } from "./manifest-contract.mjs";
import { discoverLegacySetup } from "./migration.mjs";
import { discoverStandaloneRepository, RECOMMENDED_LOCAL_CHOICES } from "./transaction.mjs";

const SKILL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.join(SKILL_ROOT, "fixtures");
const RELEASED_ROOT = path.join(FIXTURES_ROOT, "released-repositories");
const MACHINE = { activeHarness: "omp", sessionDiscipline: true, dangerousGitGuard: true, jiraCli: true };
const REPOSITORY_MACHINE = { sessionDiscipline: true, dangerousGitGuard: true };
const FIXTURE_NAMES = [
	"ws-init-only",
	"local",
	"local-jira",
	"documentation-initialized",
	"customized-combined",
	"unsupported-custom-tracker",
];

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

async function initializeRepository(root) {
	git(root, "init", "--quiet");
	git(root, "config", "user.name", "WS Fixture");
	git(root, "config", "user.email", "fixture@example.test");
	git(root, "add", ".");
	git(root, "commit", "--quiet", "--allow-empty", "-m", "test: released fixture");
}

async function materializeFixture(name, root) {
	const fixtureRoot = path.join(RELEASED_ROOT, name);
	await mkdir(root, { recursive: true });
	const repository = path.join(fixtureRoot, "repository");
	if (await exists(repository)) await cp(repository, root, { recursive: true });
	const linksPath = path.join(fixtureRoot, "input-links.json");
	if (await exists(linksPath)) {
		const links = JSON.parse(await readFile(linksPath, "utf8"));
		for (const link of links.files) {
			let content = await readFile(path.join(FIXTURES_ROOT, link.source), "utf8");
			for (const [before, after] of Object.entries(link.replace ?? {})) content = content.replaceAll(before, after);
			const target = path.join(root, link.target);
			await mkdir(path.dirname(target), { recursive: true });
			await writeFile(target, content, "utf8");
		}
	}
	await initializeRepository(root);
	return fixtureRoot;
}

async function temporaryRepository(name) {
	const parent = await mkdtemp(path.join(tmpdir(), `ws-manifest-${name}-`));
	const root = path.join(parent, "repository");
	const fixtureRoot = await materializeFixture(name, root);
	return { parent, root, fixtureRoot };
}

async function migrationRequest(root, extra = {}) {
	return {
		mode: "migration",
		root,
		snapshot: {
			legacy: await discoverLegacySetup(root, REPOSITORY_MACHINE),
			core: await discoverStandaloneRepository(root, MACHINE),
		},
		choices: {
			core: {
				jiraValidation: { ready: true },
				docsReadiness: { ready: true },
				capabilities: { ghCli: true, glabCli: true },
			},
		},
		...extra,
	};
}

function assertExpectedEffects(manifest, expected) {
	for (const effect of expected.effects) {
		assert.ok(
			manifest.items.some(item => item.phase === effect.phase && item.target === effect.target && item.classification === effect.classification),
			`missing expected ${effect.phase} ${effect.classification} ${effect.target}`,
		);
	}
}

async function assertPreserved(root, fixtureRoot, expected) {
	for (const target of expected.preserved) {
		const actual = await readFile(path.join(root, target));
		const preserved = await readFile(path.join(fixtureRoot, "expected", "preserved", target));
		assert.deepEqual(actual, preserved, `${target} was not preserved byte-for-byte`);
	}
	for (const target of expected.deleted) assert.equal(await exists(path.join(root, target)), false, `${target} was not deleted`);
}

test("released repository fixtures are complete and migrate through one contract", async t => {
	assert.deepEqual((await readdir(RELEASED_ROOT, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort(), [...FIXTURE_NAMES].sort());
	for (const name of FIXTURE_NAMES) {
		await t.test(name, async () => {
			const { parent, root, fixtureRoot } = await temporaryRepository(name);
			try {
				const expected = JSON.parse(await readFile(path.join(fixtureRoot, "expected", "outcome.json"), "utf8"));
				const externalCalls = [];
				const request = await migrationRequest(root, {
					adapters: {
						verifyMigrationReadiness: async () => {
							externalCalls.push("verifyMigrationReadiness");
							return expected.readiness ?? {};
						},
					},
				});
				const planned = await runManifestTransaction(request);
				assertExpectedEffects(planned.manifest, expected);
				assert.equal(planned.manifest.items.length, Object.values(planned.manifest.categories).flat().length);
				assert.equal(planned.manifest.version, 1);

				if (expected.readiness === null) {
					assert.equal(planned.requiresAuthorization, false);
					assert.equal(planned.applied, false);
					assert.equal(await exists(path.join(root, ".wsagency/config.yaml")), false);
					for (const fragment of expected.reportIncludes) assert.match(planned.report, new RegExp(fragment));
					await assertPreserved(root, fixtureRoot, expected);
					assert.deepEqual(externalCalls, expected.externalCalls);
					return;
				}

				assert.equal(planned.requiresAuthorization, true, `${name}: ${planned.report}\n${planned.manifest.blockers.join("\n")}`);
				await assert.rejects(
					() => runManifestTransaction({ ...request, authorization: "stale" }),
					/complete manifest/,
				);
				const applied = await runManifestTransaction({ ...request, authorization: planned.manifest.hash });
				assert.equal(applied.applied, true);
				assert.deepEqual(applied.readiness, expected.readiness);
				for (const fragment of expected.reportIncludes) assert.match(applied.report, new RegExp(fragment));
				assert.deepEqual(externalCalls, expected.externalCalls);
				const expectedConfig = parseCanonicalConfigYaml(await readFile(path.join(fixtureRoot, "expected", "config.yaml"), "utf8"));
				const actualConfig = parseCanonicalConfigYaml(await readFile(path.join(root, ".wsagency/config.yaml"), "utf8"));
				assert.deepEqual(actualConfig, expectedConfig);
				await assertPreserved(root, fixtureRoot, expected);

				const aligned = await runManifestTransaction(await migrationRequest(root));
				assert.equal(aligned.requiresAuthorization, false);
				assert.equal(aligned.applied, true);
				assert.match(aligned.report, /Valid canonical configuration wins/);
			} finally {
				await rm(parent, { recursive: true, force: true });
			}
		});
	}
});

test("first run stops on injected failure and resumes through the same manifest seam", async () => {
	const parent = await mkdtemp(path.join(tmpdir(), "ws-manifest-first-run-"));
	const root = path.join(parent, "repository");
	try {
		await mkdir(root, { recursive: true });
		await writeFile(path.join(root, "README.md"), "# First run\n");
		await initializeRepository(root);
		const discovery = await discoverStandaloneRepository(root, MACHINE);
		const request = { mode: "setup", root, snapshot: discovery, choices: RECOMMENDED_LOCAL_CHOICES };
		const planned = await runManifestTransaction(request);
		assert.equal(planned.requiresAuthorization, true);
		assert.ok(planned.manifest.categories.CREATE.length > 0);
		const interrupted = await runManifestTransaction({
			...request,
			authorization: planned.manifest.hash,
			injection: { failure: { phase: "write", target: ".wsagency/config.yaml" } },
		});
		assert.equal(interrupted.applied, false);
		assert.equal(interrupted.failure.target, ".wsagency/config.yaml");
		assert.match(interrupted.report, /No rollback was performed/);

		const resumedRequest = { ...request, snapshot: await discoverStandaloneRepository(root, MACHINE) };
		const resumedPlan = await runManifestTransaction(resumedRequest);
		const resumed = await runManifestTransaction({ ...resumedRequest, authorization: resumedPlan.manifest.hash });
		assert.equal(resumed.applied, true);
		assert.equal(resumed.readiness.configValid, true);
		const aligned = await runManifestTransaction({ ...request, snapshot: await discoverStandaloneRepository(root, MACHINE) });
		assert.equal(aligned.requiresAuthorization, false);
		assert.match(aligned.report, /aligned WS setup/i);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

async function createHub() {
	const parent = await mkdtemp(path.join(tmpdir(), "ws-manifest-hub-"));
	const root = path.join(parent, "product-main");
	const child = path.join(root, "service");
	await mkdir(root, { recursive: true });
	await writeFile(path.join(root, "README.md"), "# Product hub\n");
	await writeFile(path.join(root, ".gitignore"), "/service/\n");
	await writeFile(path.join(root, "project.yaml"), [
		"project:",
		"  name: product",
		"  description: Fixture-backed hub",
		"  conventions: 2",
		"repos:",
		"  - name: service",
		"    path: ./service",
		"    url: https://example.test/ws/service.git",
		"    description: service repository",
		"    type: working",
		"",
	].join("\n"));
	await initializeRepository(root);
	await mkdir(child, { recursive: true });
	await writeFile(path.join(child, "README.md"), "# Service\n");
	await initializeRepository(child);
	git(root, "remote", "add", "origin", "https://example.test/ws/product-main.git");
	git(child, "remote", "add", "origin", "https://example.test/ws/service.git");
	return { parent, root, child };
}

test("hub scope plans and applies every selected repository through the facade", async () => {
	const { parent, root, child } = await createHub();
	try {
		const calls = [];
		const request = {
			mode: "hub",
			root,
			snapshot: await discoverHubTransaction(root, MACHINE),
			choices: { documentation: false },
			adapters: { machinePrerequisite: async () => calls.push("machine") },
		};
		const planned = await runManifestTransaction(request);
		assert.equal(planned.requiresAuthorization, true, `${planned.report}\n${planned.manifest.blockers.join("\n")}`);
		assert.deepEqual(new Set(planned.manifest.items.map(item => item.scope)), new Set(["hub", "service"]));
		const applied = await runManifestTransaction({ ...request, authorization: planned.manifest.hash });
		assert.equal(applied.applied, true);
		assert.deepEqual(calls, ["machine"]);
		assert.equal(await exists(path.join(root, ".wsagency/config.yaml")), true);
		assert.equal(await exists(path.join(child, ".wsagency/config.yaml")), true);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

function reconfigureAdapters() {
	let journal = null;
	return {
		writeJournal: async (hash, state) => { journal = { hash, state }; },
		readJournal: async () => journal,
		removeJournal: async () => { journal = null; },
		appendAudit: async () => {},
		applyEffect: async effect => ({ identity: { id: effect.id, version: 1 } }),
		verifyEffect: async () => true,
		revalidateLocalFingerprints: async () => true,
		revalidateMachineFingerprints: async () => true,
		refetchRemoteFingerprint: async effect => effect.remoteFingerprint ?? effect.fingerprint ?? null,
		verifyCutover: async () => true,
		verifyCompletion: async () => true,
		deriveReadiness: async () => ({ config: "ready", tracker: "ready", documentation: "not_configured", runtime: "ready" }),
		now: () => 1_693_612_800_000,
	};
}

test("reconfiguration failure and resume retain the exact authorized journal", async () => {
	const adapters = reconfigureAdapters();
	const snapshot = {
		config: { schema_version: 1, runtime: { session_discipline: "required", dangerous_git_guard: "enabled" } },
		target: {
			shape: "standalone",
			repositoryId: "repo",
			entries: {
				"config:runtime.session_discipline": { fingerprint: "config-v1" },
				"config:runtime.dangerous_git_guard": { fingerprint: "config-v1" },
				"managed:AGENTS.md": { fingerprint: "agents-v1" },
			},
		},
		machine: {
			sessionDisciplineDelivered: false,
			sessionDisciplineFingerprint: "session-v1",
			sharedGuardsOwnedBy: ["repo"],
			sharedGuardExactGenerated: true,
			sharedGuardFingerprint: "guard-v1",
		},
	};
	const choices = {
		domains: ["runtime"],
		fields: ["runtime.session_discipline", "runtime.dangerous_git_guard"],
		values: { "runtime.session_discipline": "required", "runtime.dangerous_git_guard": "disabled" },
		authorizeOwnedCleanup: true,
	};
	const request = { mode: "reconfigure", root: "/repo", snapshot, choices, adapters };
	const planned = await runManifestTransaction(request);
	assert.equal(planned.requiresAuthorization, true);
	assert.ok(planned.manifest.items.some(item => item.phase === "prepare"));
	const interrupted = await runManifestTransaction({
		...request,
		authorization: planned.manifest.hash,
		injection: { reconfigure: { failAtPhase: "prepare" } },
	});
	assert.equal(interrupted.applied, false);
	assert.equal(interrupted.phase, "prepare");
	const resumedPlan = await runManifestTransaction({ ...request, action: "resume" });
	assert.equal(resumedPlan.manifest.hash, planned.manifest.hash);
	const resumed = await runManifestTransaction({ ...request, action: "resume", authorization: resumedPlan.manifest.hash });
	assert.equal(resumed.applied, true);
	assert.equal(resumed.phase, "done");
	assert.match(resumed.report, /cleanup completed/i);
});
