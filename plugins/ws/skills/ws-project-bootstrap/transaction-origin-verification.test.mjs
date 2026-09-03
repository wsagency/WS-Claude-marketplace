import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseCanonicalConfigYaml, serializeCanonicalConfig } from "./config.mjs";
import {
	buildPlan,
	CANONICAL_CONFIG_YAML,
	discoverStandaloneRepository,
	runSetupTransaction,
} from "./transaction.mjs";

const READY_RUNTIME = {
	activeHarness: "omp",
	sessionDiscipline: true,
	dangerousGitGuard: true,
	ghCli: true,
	glabCli: true,
};

const ORIGINS = [
	{
		name: "GitHub HTTPS",
		origin: "https://github.com/wsagency/project.git",
		identity: { provider: "github", host: "github.com", owner: "wsagency", repo: "project" },
	},
	{
		name: "GitHub SSH",
		origin: "git@github.com:wsagency/project.git",
		identity: { provider: "github", host: "github.com", owner: "wsagency", repo: "project" },
	},
	{
		name: "GitLab HTTPS",
		origin: "https://gitlab.com/wsagency/group/project.git",
		identity: { provider: "gitlab", host: "gitlab.com", owner: "wsagency", repo: "group/project" },
	},
	{
		name: "GitLab SSH",
		origin: "ssh://git@gitlab.com/wsagency/group/project.git",
		identity: { provider: "gitlab", host: "gitlab.com", owner: "wsagency", repo: "group/project" },
	},
];

function choicesFor(origin, provider = "local") {
	const config = parseCanonicalConfigYaml(CANONICAL_CONFIG_YAML);
	config.tracker.primary = provider;
	return {
		profile: "materialized",
		createRepository: true,
		origin,
		targetConfig: serializeCanonicalConfig(config),
		capabilities: { ghCli: true, glabCli: true },
	};
}

function accessibleVerifier(identity, calls = []) {
	return async request => {
		calls.push(request);
		return { accessible: true, identity };
	};
}

async function withEmptyDirectory(prefix, run) {
	const root = await mkdtemp(path.join(os.tmpdir(), prefix));
	try {
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function assertNoWrites(root, result) {
	assert.deepEqual(result.operations, []);
	assert.deepEqual(await readdir(root), []);
}

for (const { name, origin, identity } of ORIGINS) {
	test(`${name} origin is verified before confirmation`, async () => {
		await withEmptyDirectory("ws-origin-valid-", async root => {
			const calls = [];
			const result = await runSetupTransaction({
				root,
				discovery: await discoverStandaloneRepository(root, READY_RUNTIME),
				choices: choicesFor(origin, identity.provider),
				originVerifier: accessibleVerifier(identity, calls),
			});

			assert.equal(result.requiresConfirmation, true);
			assert.deepEqual(result.plan.originIdentity, identity);
			assert.deepEqual(calls, [{ origin, expectedIdentity: identity }]);
			assert.equal(result.plan.effects.find(effect => effect.target === "git:origin").classification, "CREATE");
			assert.equal(result.plan.effects.some(effect => effect.classification === "BLOCKING_CONFLICT"), false);
			await assertNoWrites(root, result);
		});
	});
}

test("missing origin verification blocks every write", async () => {
	await withEmptyDirectory("ws-origin-missing-", async root => {
		const result = await runSetupTransaction({
			root,
			discovery: await discoverStandaloneRepository(root, READY_RUNTIME),
			choices: choicesFor(ORIGINS[0].origin),
		});

		assert.match(result.report, /accessibility was not verified/);
		assert.equal(result.plan.effects.find(effect => effect.target === "git:origin").classification, "BLOCKING_CONFLICT");
		await assertNoWrites(root, result);
	});
});

test("unreachable origin verification blocks every write", async () => {
	await withEmptyDirectory("ws-origin-unreachable-", async root => {
		const result = await runSetupTransaction({
			root,
			discovery: await discoverStandaloneRepository(root, READY_RUNTIME),
			choices: choicesFor(ORIGINS[0].origin),
			originVerifier: async () => ({ accessible: false, identity: null, reason: "Connection refused" }),
		});

		assert.match(result.report, /Connection refused/);
		assert.equal(result.plan.effects.find(effect => effect.target === "git:origin").classification, "BLOCKING_CONFLICT");
		await assertNoWrites(root, result);
	});
});

test("malformed verified identity blocks every write", async () => {
	await withEmptyDirectory("ws-origin-malformed-", async root => {
		const result = await runSetupTransaction({
			root,
			discovery: await discoverStandaloneRepository(root, READY_RUNTIME),
			choices: choicesFor(ORIGINS[0].origin),
			originVerifier: async () => ({
				accessible: true,
				identity: { provider: "github", host: "github.com", owner: "", repo: "project" },
			}),
		});

		assert.match(result.report, /malformed remote identity/);
		assert.equal(result.plan.effects.find(effect => effect.target === "git:origin").classification, "BLOCKING_CONFLICT");
		await assertNoWrites(root, result);
	});
});

test("provider-mismatched verification blocks every write", async () => {
	await withEmptyDirectory("ws-origin-provider-", async root => {
		const result = await runSetupTransaction({
			root,
			discovery: await discoverStandaloneRepository(root, READY_RUNTIME),
			choices: choicesFor(ORIGINS[0].origin),
			originVerifier: accessibleVerifier(ORIGINS[2].identity),
		});

		assert.match(result.report, /provider mismatch: expected github, received gitlab/);
		assert.equal(result.plan.effects.find(effect => effect.target === "git:origin").classification, "BLOCKING_CONFLICT");
		await assertNoWrites(root, result);
	});
});

test("verified identity participates in the authorization hash", async () => {
	await withEmptyDirectory("ws-origin-hash-", async root => {
		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const choices = choicesFor(ORIGINS[0].origin);
		const authorized = buildPlan(discovery, choices, { accessible: true, identity: ORIGINS[0].identity });
		const substituted = buildPlan(discovery, choices, { accessible: true, identity: ORIGINS[2].identity });

		assert.deepEqual(authorized.originIdentity, ORIGINS[0].identity);
		assert.equal(substituted.originIdentity, null);
		assert.notEqual(authorized.hash, substituted.hash);
	});
});

test("changed verification invalidates confirmation before writes", async () => {
	await withEmptyDirectory("ws-origin-drift-", async root => {
		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const choices = choicesFor(ORIGINS[0].origin);
		const planned = await runSetupTransaction({
			root,
			discovery,
			choices,
			originVerifier: accessibleVerifier(ORIGINS[0].identity),
		});
		const changed = await runSetupTransaction({
			root,
			discovery,
			choices,
			authorization: planned.plan.hash,
			originVerifier: accessibleVerifier({ ...ORIGINS[0].identity, repo: "substituted" }),
		});

		assert.equal(changed.requiresConfirmation, false);
		assert.notEqual(changed.plan.hash, planned.plan.hash);
		assert.match(changed.report, /identity mismatch/);
		assert.equal(changed.plan.effects.find(effect => effect.target === "git:origin").classification, "BLOCKING_CONFLICT");
		await assertNoWrites(root, changed);
	});
});

test("pre-apply recheck invalidates authorization when the origin becomes inaccessible", async () => {
	await withEmptyDirectory("ws-origin-recheck-", async root => {
		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const choices = choicesFor(ORIGINS[0].origin);
		const planned = await runSetupTransaction({
			root,
			discovery,
			choices,
			originVerifier: accessibleVerifier(ORIGINS[0].identity),
		});
		let authorizedInvocationCalls = 0;
		const changingVerifier = async () => {
			authorizedInvocationCalls += 1;
			if (authorizedInvocationCalls === 1) {
				return { accessible: true, identity: ORIGINS[0].identity };
			}
			return { accessible: false, identity: null, reason: "Remote became unreachable" };
		};

		await assert.rejects(
			runSetupTransaction({
				root,
				discovery,
				choices,
				authorization: planned.plan.hash,
				originVerifier: changingVerifier,
			}),
			/Authorization is stale/,
		);
		assert.equal(authorizedInvocationCalls, 2);
		assert.deepEqual(await readdir(root), []);
	});
});

test("apply succeeds only after the authorized identity is reverified", async () => {
	await withEmptyDirectory("ws-origin-apply-", async root => {
		const calls = [];
		const choices = choicesFor(ORIGINS[0].origin);
		const verifier = accessibleVerifier(ORIGINS[0].identity, calls);
		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const planned = await runSetupTransaction({ root, discovery, choices, originVerifier: verifier });
		const applied = await runSetupTransaction({
			root,
			discovery,
			choices,
			authorization: planned.plan.hash,
			originVerifier: verifier,
		});

		assert.equal(calls.length, 3);
		assert.match(applied.report, /WS setup verified/);
		assert.equal(applied.operations.some(operation => operation.target === "git:repository"), true);
		assert.equal((await stat(path.join(root, ".git"))).isDirectory(), true);
		assert.equal(execFileSync("git", ["config", "--get", "remote.origin.url"], { cwd: root, encoding: "utf8" }).trim(), ORIGINS[0].origin);
	});
});

test("rerun after git init succeeds and origin write fails plans the missing verified origin", async () => {
	await withEmptyDirectory("ws-origin-partial-", async root => {
		const choices = choicesFor(ORIGINS[0].origin);
		const verifier = accessibleVerifier(ORIGINS[0].identity);
		const discovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const planned = await runSetupTransaction({ root, discovery, choices, originVerifier: verifier });
		const interrupted = await runSetupTransaction({
			root,
			discovery,
			choices,
			authorization: planned.plan.hash,
			originVerifier: verifier,
			injectedFailure: { phase: "write", target: "git:origin" },
		});
		assert.equal(interrupted.failure.target, "git:origin");
		assert.equal((await stat(path.join(root, ".git"))).isDirectory(), true);

		const rerunDiscovery = await discoverStandaloneRepository(root, READY_RUNTIME);
		const rerun = await runSetupTransaction({
			root,
			discovery: rerunDiscovery,
			choices,
			originVerifier: verifier,
		});
		assert.equal(rerun.plan.effects.find(effect => effect.target === "git:repository").classification, "NO-OP");
		assert.equal(rerun.plan.effects.find(effect => effect.target === "git:origin").classification, "CREATE");
		assert.deepEqual(rerun.plan.originIdentity, ORIGINS[0].identity);
	});
});
