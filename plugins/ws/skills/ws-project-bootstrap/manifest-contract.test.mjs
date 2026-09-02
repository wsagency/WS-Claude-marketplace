import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseCanonicalConfigYaml, serializeCanonicalConfig } from "./config.mjs";
import { discoverHubTransaction } from "./hub-transaction.mjs";
import { runManifestTransaction } from "./manifest-contract.mjs";
import { createMockReconfigureAdapters } from "./reconfigure.test-support.mjs";
import { discoverLegacySetup } from "./migration.mjs";
import { CANONICAL_CONFIG_YAML, discoverStandaloneRepository, RECOMMENDED_LOCAL_CHOICES } from "./transaction.mjs";
import { FakeJiraAdapter } from "./test-support/fake-jira-adapter.mjs";
import { hashField } from "./sync.mjs";

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

function createBackfillHarness({
	localTickets = {},
	syncState = { mappings: {}, pendingOperations: [] },
	jiraTickets = {},
	failReturnedIdentityOnce = false,
} = {}) {
	let durable = structuredClone(syncState);
	let failReturnedIdentity = failReturnedIdentityOnce;
	const jiraAdapter = new FakeJiraAdapter(jiraTickets);
	const persistence = {
		async persistSyncState(state) {
			if (failReturnedIdentity && state.pendingOperations.some(operation => operation.returnedId)) {
				failReturnedIdentity = false;
				throw new Error("simulated crash before returned identity became durable");
			}
			durable = structuredClone(state);
		},
		async readLocalTickets() {
			if (!localTickets) throw new Error("Unreadable source");
			return structuredClone(localTickets);
		},
		async readSyncState() {
			return structuredClone(durable);
		},
	};
	return {
		jiraAdapter,
		snapshot: () => structuredClone(durable),
		adapter: () => ({
			localTickets: structuredClone(localTickets),
			syncState: structuredClone(durable),
			jiraAdapter,
			persistence,
		}),
	};
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
	const mirroredTicket = await exists(path.join(root, "dev-docs/tickets/open/mirrored-ticket.md"));
	const backfill = createBackfillHarness(mirroredTicket
		? {
			localTickets: {
				"mirrored-ticket": {
					title: "Preserve mirrored ticket",
					description: "Keep the local source and its returned Jira key.",
					status: "ready-for-agent",
				},
			},
			syncState: {
				mappings: { "mirrored-ticket": { jiraId: "WCM-17", fieldHashes: {} } },
				pendingOperations: [],
			},
			jiraTickets: { "WCM-17": { id: "WCM-17", title: "Preserve mirrored ticket" } },
		}
		: {});
	const request = {
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
	};
	return {
		...request,
		...extra,
		adapters: {
			jiraBackfill: backfill.adapter(),
			...(extra.adapters ?? {}),
		},
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

test("hub manifest binds and persists repository-qualified Local Jira backfills", async () => {
	const { parent, root } = await createHub();
	const hubConfig = parseCanonicalConfigYaml(CANONICAL_CONFIG_YAML);
	hubConfig.jira = { project: "WCM", default_issue_type: "Task", sync: "all_local_tickets" };
	await mkdir(path.join(root, ".wsagency"), { recursive: true });
	await writeFile(path.join(root, ".wsagency", "config.yaml"), serializeCanonicalConfig(hubConfig), "utf8");
	git(root, "add", ".wsagency/config.yaml");
	git(root, "commit", "--quiet", "-m", "test: enable Local Jira backfill");
	const hubBackfill = createBackfillHarness({
		localTickets: {
			"hub-ticket": { title: "Hub ticket", description: "Hub-owned", status: "open", type: "Task" },
		},
	});
	const serviceBackfill = createBackfillHarness({
		localTickets: {
			"service-ticket": { title: "Service ticket", description: "Service-owned", status: "open", type: "Task" },
		},
	});
	try {
		const request = {
			mode: "hub",
			root,
			snapshot: await discoverHubTransaction(root, MACHINE),
			choices: {
				documentation: false,
				hub: { jiraValidation: { ready: true } },
				working: { service: { jiraValidation: { ready: true } } },
			},
			adapters: {
				backfillFactory: async target => target.repository === "hub"
					? hubBackfill.adapter()
					: serviceBackfill.adapter(),
			},
		};
		const planned = await runManifestTransaction(request);
		const backfillCreates = planned.manifest.categories.CREATE.filter(effect => effect.phase === "backfill");
		assert.deepEqual(
			backfillCreates.map(effect => `${effect.scope}:${effect.target}`).sort(),
			["hub:jira:WCM:hub-ticket", "service:jira:WCM:service-ticket"],
		);
		assert.equal(JSON.stringify(planned.manifest).includes("\"input\""), false);

		const applied = await runManifestTransaction({ ...request, authorization: planned.manifest.hash });

		assert.equal(applied.applied, true, `${applied.report}\n${JSON.stringify(applied.outcomes ?? [])}`);
		assert.match(hubBackfill.snapshot().mappings["hub-ticket"].jiraId, /^PROJ-/);
		assert.equal(hubBackfill.snapshot().mappings["service-ticket"], undefined);
		assert.match(serviceBackfill.snapshot().mappings["service-ticket"].jiraId, /^PROJ-/);
		assert.equal(serviceBackfill.snapshot().mappings["hub-ticket"], undefined);
		assert.deepEqual(hubBackfill.snapshot().pendingOperations, []);
		assert.deepEqual(serviceBackfill.snapshot().pendingOperations, []);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

function runtimeReconfiguration() {
	return {
		snapshot: {
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
		},
		choices: {
			domains: ["runtime"],
			fields: ["runtime.session_discipline", "runtime.dangerous_git_guard"],
			values: { "runtime.session_discipline": "required", "runtime.dangerous_git_guard": "disabled" },
			authorizeOwnedCleanup: true,
		},
	};
}
test("reconfiguration failure and resume retain the exact authorized journal", async () => {
	const adapters = createMockReconfigureAdapters();
	const { snapshot, choices } = runtimeReconfiguration();
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

function materializedSetupChoices(mutator = () => {}) {
	const config = parseCanonicalConfigYaml(CANONICAL_CONFIG_YAML);
	mutator(config);
	return {
		profile: "materialized",
		targetConfig: serializeCanonicalConfig(config),
		capabilities: { ghCli: true, glabCli: true },
		jiraValidation: { ready: true },
		docsReadiness: { ready: true },
	};
}

async function createStandaloneRepository(prefix) {
	const parent = await mkdtemp(path.join(tmpdir(), prefix));
	const root = path.join(parent, "repository");
	await mkdir(root, { recursive: true });
	await writeFile(path.join(root, "README.md"), "# Repository\n");
	await initializeRepository(root);
	return { parent, root };
}

test("all tracker modes plan and apply through the manifest facade", async t => {
	const modes = [
		{ name: "local", configure: () => {} },
		{ name: "github", origin: "git@github.com:wsagency/project.git", configure: config => { config.tracker.primary = "github"; } },
		{ name: "gitlab", origin: "https://gitlab.com/wsagency/project.git", configure: config => { config.tracker.primary = "gitlab"; } },
		{ name: "jira", configure: config => {
			config.tracker.primary = "jira";
			config.jira = { project: "WCM", default_issue_type: "Task", sync: "disabled" };
		} },
		{ name: "local-jira", configure: config => {
			config.jira = { project: "WCM", default_issue_type: "Task", sync: "all_local_tickets" };
		} },
	];
	for (const mode of modes) {
		await t.test(mode.name, async () => {
			const { parent, root } = await createStandaloneRepository(`ws-manifest-tracker-${mode.name}-`);
			try {
				if (mode.origin) git(root, "remote", "add", "origin", mode.origin);
				const choices = materializedSetupChoices(mode.configure);
				const backfill = createBackfillHarness();
				const request = {
					mode: "setup",
					root,
					snapshot: await discoverStandaloneRepository(root, MACHINE),
					choices,
					adapters: { jiraBackfill: backfill.adapter() },
				};
				const planned = await runManifestTransaction(request);
				assert.equal(planned.requiresAuthorization, true, planned.report);
				const applied = await runManifestTransaction({ ...request, authorization: planned.manifest.hash });
				assert.equal(applied.applied, true);
				assert.equal(applied.readiness.trackerReady, true);
				assert.deepEqual(
					parseCanonicalConfigYaml(await readFile(path.join(root, ".wsagency/config.yaml"), "utf8")),
					parseCanonicalConfigYaml(choices.targetConfig),
				);
			} finally {
				await rm(parent, { recursive: true, force: true });
			}
		});
	}
});

test("Local Jira backfill is authorized once and resumes a returned-key crash without duplicate creation", async () => {
	const { parent, root } = await createStandaloneRepository("ws-manifest-backfill-");
	const backfill = createBackfillHarness({
		localTickets: {
			"local-1": {
				title: "Backfill me",
				description: "Created from Local Markdown.",
				status: "open",
				priority: "medium",
				type: "Task",
			},
		},
		failReturnedIdentityOnce: true,
	});
	try {
		const choices = materializedSetupChoices(config => {
			config.jira = { project: "WCM", default_issue_type: "Task", sync: "all_local_tickets" };
		});
		const request = {
			mode: "setup",
			root,
			snapshot: await discoverStandaloneRepository(root, MACHINE),
			choices,
			adapters: { jiraBackfill: backfill.adapter() },
		};
		const planned = await runManifestTransaction(request);
		const backfillCreates = planned.manifest.categories.CREATE.filter(effect => effect.phase === "backfill");
		assert.deepEqual(backfillCreates.map(effect => effect.target), ["jira:WCM:local-1"]);
		assert.equal(backfill.jiraAdapter.getCallLog().filter(call => call.method === "createTicket").length, 0);

		const interrupted = await runManifestTransaction({ ...request, authorization: planned.manifest.hash });
		assert.equal(interrupted.applied, false);
		assert.match(interrupted.failure.error, /returned identity became durable/);
		assert.equal(backfill.jiraAdapter.getCallLog().filter(call => call.method === "createTicket").length, 1);
		assert.equal(backfill.snapshot().pendingOperations[0].returnedId, undefined);

		const resumedRequest = {
			...request,
			snapshot: await discoverStandaloneRepository(root, MACHINE),
			adapters: { jiraBackfill: backfill.adapter() },
		};
		const resumedPlan = await runManifestTransaction(resumedRequest);
		assert.equal(resumedPlan.requiresAuthorization, true);
		const resumed = await runManifestTransaction({
			...resumedRequest,
			authorization: resumedPlan.manifest.hash,
		});
		assert.equal(resumed.applied, true);
		assert.equal(resumed.readiness.jiraBackfillReady, true);
		assert.equal(backfill.jiraAdapter.getCallLog().filter(call => call.method === "createTicket").length, 1);
		assert.ok(backfill.snapshot().mappings["local-1"].jiraId);
		assert.deepEqual(backfill.snapshot().pendingOperations, []);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

test("Local Jira backfill fails on execution if local tickets drift after authorization with zero remote writes", async () => {
	const { parent, root } = await createStandaloneRepository("ws-manifest-backfill-drift-");
	const sourceTickets = {
		"local-1": {
			title: "Original Title",
			description: "Original Description",
			status: "open",
		},
	};
	const backfill = createBackfillHarness({
		localTickets: sourceTickets,
	});
	try {
		const choices = materializedSetupChoices(config => {
			config.jira = { project: "WCM", default_issue_type: "Task", sync: "all_local_tickets" };
		});
		const request = {
			mode: "setup",
			root,
			snapshot: await discoverStandaloneRepository(root, MACHINE),
			choices,
			adapters: { jiraBackfill: backfill.adapter() },
		};
		const planned = await runManifestTransaction(request);
		
		// Drift local tickets before execution
		sourceTickets["local-1"].title = "Drifted Title";
		
		const failed = await runManifestTransaction({ ...request, authorization: planned.manifest.hash });
		assert.equal(failed.applied, false);
		assert.match(failed.failure.error, /Local tickets changed after manifest authorization/);
		assert.equal(backfill.jiraAdapter.getCallLog().filter(call => call.method === "createTicket").length, 0);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

test("Local Jira backfill rejects remote mapping drift before core or remote writes", async () => {
	const { parent, root } = await createStandaloneRepository("ws-manifest-backfill-remote-drift-");
	const localTicket = {
		title: "Original Title",
		description: "Original Description",
		status: "open",
		priority: "medium",
		type: "Task",
	};
	const backfill = createBackfillHarness({
		localTickets: { "local-1": localTicket },
		syncState: {
			mappings: { "local-1": { jiraId: "PROJ-1", fieldHashes: { title: hashField(localTicket.title) } } },
			pendingOperations: [],
		},
		jiraTickets: { "PROJ-1": { id: "PROJ-1", ...localTicket } },
	});
	try {
		const choices = materializedSetupChoices(config => {
			config.jira = { project: "WCM", default_issue_type: "Task", sync: "all_local_tickets" };
		});
		const request = {
			mode: "setup",
			root,
			snapshot: await discoverStandaloneRepository(root, MACHINE),
			choices,
			adapters: { jiraBackfill: backfill.adapter() },
		};
		const planned = await runManifestTransaction(request);
		delete backfill.jiraAdapter.existingData["PROJ-1"];

		const failed = await runManifestTransaction({ ...request, authorization: planned.manifest.hash });

		assert.equal(failed.applied, false, `${failed.report}\n${JSON.stringify(failed.outcomes ?? [])}`);
		assert.match(failed.report, /Resolve Local\/Jira mapping audit failures/);
		assert.deepEqual(failed.manifest.delegated.backfill.audit.stale, [{ localId: "local-1", jiraId: "PROJ-1" }]);
		assert.equal(await exists(path.join(root, ".wsagency", "config.yaml")), false);
		assert.equal(
			backfill.jiraAdapter.getCallLog().some(call => ["createTicket", "updateTicket", "updateStatus", "addComment"].includes(call.method)),
			false,
		);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

test("zero-item Local Jira backfill refreshes durable targets before core writes", async () => {
	const { parent, root } = await createStandaloneRepository("ws-manifest-backfill-expanded-");
	const sourceTickets = {};
	const backfill = createBackfillHarness({ localTickets: sourceTickets });
	try {
		const choices = materializedSetupChoices(config => {
			config.jira = { project: "WCM", default_issue_type: "Task", sync: "all_local_tickets" };
		});
		const request = {
			mode: "setup",
			root,
			snapshot: await discoverStandaloneRepository(root, MACHINE),
			choices,
			adapters: { jiraBackfill: backfill.adapter() },
		};
		const planned = await runManifestTransaction(request);
		assert.deepEqual(planned.manifest.categories.CREATE.filter(effect => effect.phase === "backfill"), []);

		sourceTickets["local-2"] = {
			title: "Added after authorization",
			description: "This expanded target was not authorized.",
			status: "open",
		};

		const failed = await runManifestTransaction({ ...request, authorization: planned.manifest.hash });
		assert.equal(failed.applied, false);
		assert.match(failed.failure.error, /Local tickets changed after manifest authorization/);
		assert.equal(backfill.jiraAdapter.getCallLog().filter(call => call.method === "createTicket").length, 0);
		assert.equal(await exists(path.join(root, ".wsagency", "config.yaml")), false);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

test("documentation failure preserves completed core work and a fresh manifest resumes it", async () => {
	const { parent, root } = await createStandaloneRepository("ws-manifest-docs-failure-");
	try {
		const choices = materializedSetupChoices(config => {
			config.docs = {
				user_track: "guides",
				dev_track: "engineering",
				default_audience: "ask",
				default_scope: "repo",
				adr_for_arch_changes: true,
			};
		});
		const request = {
			mode: "setup",
			root,
			snapshot: await discoverStandaloneRepository(root, MACHINE),
			choices,
		};
		const planned = await runManifestTransaction(request);
		const firstDocumentationWrite = planned.manifest.categories.CREATE
			.find(effect => effect.phase === "docs");
		assert.ok(firstDocumentationWrite);
		const agentsItem = planned.manifest.items.find(effect => effect.phase === "core" && effect.target === "AGENTS.md");
		const claudeEffect = planned.manifest.delegated.core.effects.find(effect => effect.target === "CLAUDE.md");
		assert.match(agentsItem.diff, /Documentation maintenance/);
		assert.equal(
			claudeEffect.after,
			"<!-- Canonical project context lives in AGENTS.md (agent-neutral). Keep this file as a one-line import. -->\n@AGENTS.md\n",
		);
		assert.equal(planned.manifest.items.filter(effect => effect.target === "AGENTS.md").length, 1);
		const interrupted = await runManifestTransaction({
			...request,
			authorization: planned.manifest.hash,
			injection: { docsFailure: firstDocumentationWrite.target },
		});
		assert.equal(interrupted.applied, false);
		assert.equal(await exists(path.join(root, ".wsagency/config.yaml")), true);
		assert.match(interrupted.report, /No rollback was performed/);

		const resumedRequest = { ...request, snapshot: await discoverStandaloneRepository(root, MACHINE) };
		const resumedPlan = await runManifestTransaction(resumedRequest);
		const resumed = await runManifestTransaction({ ...resumedRequest, authorization: resumedPlan.manifest.hash });
		assert.equal(resumed.applied, true);
		assert.equal(await exists(path.join(root, "guides")), true);
		assert.equal(await exists(path.join(root, "engineering")), true);
		const agentsContent = await readFile(path.join(root, "AGENTS.md"), "utf8");
		assert.equal([...agentsContent.matchAll(/^# Documentation maintenance$/gm)].length, 1);
		assert.equal(
			await readFile(path.join(root, "CLAUDE.md"), "utf8"),
			"<!-- Canonical project context lives in AGENTS.md (agent-neutral). Keep this file as a one-line import. -->\n@AGENTS.md\n",
		);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

test("migration cleanup failure preserves earlier applied operations and resumes properly", async () => {
	const { parent, root } = await temporaryRepository("reconfigure-ready");
	try {
		const request = await migrationRequest(root);
		const planned = await runManifestTransaction(request);
		
		const interrupted = await runManifestTransaction({
			...request,
			authorization: planned.manifest.hash,
			injection: { cleanupFailure: "migration:cleanup" }
		});
		
		assert.equal(interrupted.applied, false);
		assert.equal(interrupted.readiness.runtimeReady, false);
		assert.match(interrupted.report, /No rollback was performed/);
		assert.equal(interrupted.failure.target, "migration:cleanup");
		// Core/Backfill/Docs operations should still be included
		assert.ok(interrupted.operations.length > 0);

		const resumedRequest = {
			...request,
			snapshot: {
				legacy: await discoverLegacySetup(root, REPOSITORY_MACHINE),
				core: await discoverStandaloneRepository(root, MACHINE),
			},
		};
		const resumedPlan = await runManifestTransaction(resumedRequest);
		const resumed = await runManifestTransaction({ ...resumedRequest, authorization: resumedPlan.manifest.hash });
		
		assert.equal(resumed.applied, true);
		assert.ok(resumed.readiness.runtimeReady);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

test("hub failure records pending repositories and a fresh manifest resumes them", async () => {
	const { parent, root, child } = await createHub();
	try {
		const request = {
			mode: "hub",
			root,
			snapshot: await discoverHubTransaction(root, MACHINE),
			choices: { documentation: false },
		};
		const planned = await runManifestTransaction(request);
		const interrupted = await runManifestTransaction({
			...request,
			authorization: planned.manifest.hash,
			injection: { failure: { targetRoot: root, phase: "core_write", target: ".wsagency/config.yaml" } },
		});
		assert.equal(interrupted.applied, false);
		assert.ok(interrupted.outcomes.some(outcome => outcome.status === "failed"));
		assert.ok(interrupted.outcomes.some(outcome => outcome.repository === "service" && outcome.status === "pending"));
		assert.equal(await exists(path.join(child, ".wsagency/config.yaml")), false);

		const resumedRequest = { ...request, snapshot: await discoverHubTransaction(root, MACHINE) };
		const resumedPlan = await runManifestTransaction(resumedRequest);
		const resumed = await runManifestTransaction({ ...resumedRequest, authorization: resumedPlan.manifest.hash });
		assert.equal(resumed.applied, true);
		assert.equal(await exists(path.join(root, ".wsagency/config.yaml")), true);
		assert.equal(await exists(path.join(child, ".wsagency/config.yaml")), true);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

test("setup authorization rejects path drift before the first write", async () => {
	const { parent, root } = await createStandaloneRepository("ws-manifest-drift-");
	try {
		const request = {
			mode: "setup",
			root,
			snapshot: await discoverStandaloneRepository(root, MACHINE),
			choices: RECOMMENDED_LOCAL_CHOICES,
		};
		const planned = await runManifestTransaction(request);
		await mkdir(path.join(root, ".wsagency"), { recursive: true });
		await writeFile(path.join(root, ".wsagency/config.yaml"), "user-owned: true\n", "utf8");
		await assert.rejects(
			() => runManifestTransaction({ ...request, authorization: planned.manifest.hash }),
			/Authorization is stale/,
		);
		assert.equal(await readFile(path.join(root, ".wsagency/config.yaml"), "utf8"), "user-owned: true\n");
		assert.equal(await exists(path.join(root, "dev-docs/agents/issue-tracker.md")), false);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

test("tracker and documentation reconfiguration domains apply through the facade", async t => {
	const cases = [
		{
			name: "tracker",
			field: "tracker.pull_requests",
			value: "triage",
		},
		{
			name: "documentation",
			field: "changelog.update_mode",
			value: "commit",
		},
	];
	for (const reconfiguration of cases) {
		await t.test(reconfiguration.name, async () => {
			const config = parseCanonicalConfigYaml(CANONICAL_CONFIG_YAML);
			const snapshot = {
				config,
				target: {
					shape: "standalone",
					repositoryId: "repo",
					entries: { [`config:${reconfiguration.field}`]: { fingerprint: "config-v1" } },
				},
				machine: {},
			};
			const choices = {
				domains: [reconfiguration.name],
				fields: [reconfiguration.field],
				values: { [reconfiguration.field]: reconfiguration.value },
			};
			const adapters = createMockReconfigureAdapters();
			const request = { mode: "reconfigure", root: "/repo", snapshot, choices, adapters };
			const planned = await runManifestTransaction(request);
			assert.ok(planned.manifest.categories.UPDATE.some(effect => effect.target === `config:${reconfiguration.field}`));
			const applied = await runManifestTransaction({ ...request, authorization: planned.manifest.hash });
			assert.equal(applied.applied, true);
			assert.equal(applied.phase, "done");
		});
	}
});

test("reviewed valid partial reconfiguration is accepted through the facade", async () => {
	const { snapshot, choices } = runtimeReconfiguration();
	const adapters = createMockReconfigureAdapters({
		validatePartialState: async () => ({ valid: true, ownershipReport: { repo: "partial" } }),
	});
	const request = { mode: "reconfigure", root: "/repo", snapshot, choices, adapters };
	const planned = await runManifestTransaction(request);
	const interrupted = await runManifestTransaction({
		...request,
		authorization: planned.manifest.hash,
		injection: { reconfigure: { failAtPhase: "cleanup" } },
	});
	assert.equal(interrupted.applied, false);
	const acceptancePlan = await runManifestTransaction({ ...request, action: "accept_partial" });
	assert.equal(acceptancePlan.manifest.hash, planned.manifest.hash);
	const accepted = await runManifestTransaction({
		...request,
		action: "accept_partial",
		authorization: acceptancePlan.manifest.hash,
	});
	assert.equal(accepted.applied, true);
	assert.equal(accepted.ownership.repo, "partial");
	assert.equal(adapters.getAudit().acceptedPartial, true);
	assert.equal(adapters.getJournal(), null);
});
