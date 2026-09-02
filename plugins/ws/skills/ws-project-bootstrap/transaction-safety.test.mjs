import assert from "node:assert/strict";
import { access, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyPlan, buildPlan, CANONICAL_CONFIG_YAML, discoverStandaloneRepository } from "./transaction.mjs";

async function withTemporaryRoot(prefix, run) {
	const root = await realpath(await mkdtemp(path.join(tmpdir(), prefix)));
	try {
		return await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

function createFileEffect(target, after = "generated\n") {
	return {
		order: 10,
		target,
		kind: "file",
		classification: "CREATE",
		reason: "Regression fixture",
		fingerprint: null,
		after,
	};
}

test("apply rejects symlinked target ancestry before writing outside the repository", async () => {
	await withTemporaryRoot("ws-setup-root-", async root => {
		await withTemporaryRoot("ws-setup-outside-", async outside => {
			await symlink(outside, path.join(root, "dev-docs"));
			const plan = { effects: [createFileEffect("dev-docs/escaped.md")] };
			await assert.rejects(() => applyPlan(root, plan), /symlink/i);
			await assert.rejects(() => access(path.join(outside, "escaped.md")), /ENOENT/);
		});
	});
});

test("apply validates every target before the first write", async () => {
	await withTemporaryRoot("ws-setup-preflight-", async root => {
		await writeFile(path.join(root, "later.txt"), "authored\n", "utf8");
		const plan = {
			effects: [
				createFileEffect("first.txt"),
				{ ...createFileEffect("later.txt"), order: 20 },
			],
		};
		await assert.rejects(() => applyPlan(root, plan), /stale/i);
		assert.equal(await readFile(path.join(root, "later.txt"), "utf8"), "authored\n");
		await assert.rejects(() => access(path.join(root, "first.txt")), /ENOENT/);
	});
});

test("managed discovery blocks a symlinked core target in the plan", async () => {
	await withTemporaryRoot("ws-setup-discovery-", async root => {
		await withTemporaryRoot("ws-setup-authored-", async outside => {
			const authored = path.join(outside, "AGENTS.md");
			await writeFile(authored, "# Authored outside\n", "utf8");
			await symlink(authored, path.join(root, "AGENTS.md"));
			const discovery = await discoverStandaloneRepository(root, {
				activeHarness: "omp",
				sessionDiscipline: true,
				dangerousGitGuard: true,
			});
			const plan = buildPlan(discovery, {
				profile: "materialized",
				createRepository: false,
				targetConfig: CANONICAL_CONFIG_YAML,
				capabilities: discovery.machine,
			});
			const agents = plan.effects.find(effect => effect.target === "AGENTS.md");
			assert.equal(agents.classification, "BLOCKING_CONFLICT");
			assert.match(agents.reason, /non-file/i);
			assert.equal(await readFile(authored, "utf8"), "# Authored outside\n");
		});
	});
});
