import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyDocumentation, discoverDocumentation, planDocumentation } from "./transaction.mjs";

const CHANGELOG = "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).\n\n## [Unreleased]\n";

async function withTemporaryRoot(run) {
	const root = await realpath(await mkdtemp(path.join(tmpdir(), "ws-docs-test-")));
	try {
		return await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

test("standalone plan creates both documentation tracks and returns canonical policy", () => {
	const discovery = { root: "/mock/root", projectShape: "standalone", entries: {} };
	const plan = planDocumentation(discovery);
	const creates = plan.effects.filter(effect => effect.classification === "CREATE").map(effect => effect.target);

	assert.ok(creates.includes("docs"));
	assert.ok(creates.includes("dev-docs"));
	assert.ok(creates.includes("CONTRIBUTING.md"));
	assert.ok(creates.includes("docs/contributing.md"));
	assert.ok(creates.includes("dev-docs/development.md"));
	assert.ok(!plan.effects.some(effect => effect.target === ".claude/docs-config.yaml"));
	assert.deepEqual(plan.configFragment, {
		docs: {
			user_track: "docs",
			dev_track: "dev-docs",
			default_audience: "ask",
			default_scope: "repo",
			adr_for_arch_changes: true,
		},
		changelog: {
			update_mode: "pull_request",
			path: "CHANGELOG.md",
			skip_types: ["docs", "chore", "test", "style", "build", "ci"],
		},
	});
	assert.match(plan.contextFragments.agents, /^\n# Documentation maintenance/m);
	assert.equal(plan.contextFragments.claude, "<!-- Canonical project context lives in AGENTS.md (agent-neutral). Keep this file as a one-line import. -->\n@AGENTS.md\n");
});

test("hub subrepositories and hub roots omit product user-track scaffolding", () => {
	for (const projectShape of ["hub_subrepository", "hub_root"]) {
		const plan = planDocumentation({ root: "/mock/root", projectShape, entries: {} });
		assert.equal(plan.effects.find(effect => effect.target === "docs")?.classification, "SKIP");
		assert.ok(plan.effects.some(effect => effect.target === "dev-docs" && effect.classification === "CREATE"));
		assert.ok(!plan.effects.some(effect => effect.target === "docs/contributing.md"));
	}
});

test("authored content is preserved and exact generated content is a no-op", () => {
	const plan = planDocumentation({
		root: "/mock/root",
		projectShape: "standalone",
		entries: {
			"CONTRIBUTING.md": { kind: "file", content: "Custom contributing.\n", fingerprint: "custom" },
			"CHANGELOG.md": { kind: "file", content: CHANGELOG, fingerprint: "aligned" },
		},
	});

	const contributing = plan.effects.find(effect => effect.target === "CONTRIBUTING.md");
	assert.equal(contributing.classification, "PRESERVE");
	assert.equal(contributing.after, "Custom contributing.\n");
	assert.equal(plan.effects.find(effect => effect.target === "CHANGELOG.md")?.classification, "NO-OP");
});

test("apply rejects wrong authorization and drift without overwriting authored content", async () => {
	await withTemporaryRoot(async root => {
		const discovery = await discoverDocumentation(root, "standalone");
		const plan = planDocumentation(discovery);
		await assert.rejects(() => applyDocumentation(root, plan, "wrong-hash"), /authorization/i);

		await writeFile(path.join(root, "CHANGELOG.md"), "authored during confirmation\n", "utf8");
		await assert.rejects(() => applyDocumentation(root, plan, plan.hash), /drift/i);
		assert.equal(await readFile(path.join(root, "CHANGELOG.md"), "utf8"), "authored during confirmation\n");
	});
});

test("injected failure reports completed and pending effects and a fresh run resumes missing-only", async () => {
	await withTemporaryRoot(async root => {
		const firstPlan = planDocumentation(await discoverDocumentation(root, "standalone"));
		let failure;
		try {
			await applyDocumentation(root, firstPlan, firstPlan.hash, "docs/index.md");
		} catch (error) {
			failure = error;
		}
		assert.ok(failure);
		assert.ok(failure.completed.length > 0);
		assert.equal(failure.pending[0].target, "docs/index.md");
		assert.ok(failure.operations.every(operation => ["write", "verify"].includes(operation.action)));

		const resumePlan = planDocumentation(await discoverDocumentation(root, "standalone"));
		const operations = await applyDocumentation(root, resumePlan, resumePlan.hash);
		assert.ok(operations.some(operation => operation.target === "docs/index.md" && operation.action === "write"));
		assert.ok(!operations.some(operation => operation.target === "docs" && operation.action === "write"));

		const aligned = planDocumentation(await discoverDocumentation(root, "standalone"));
		assert.ok(!aligned.effects.some(effect => ["CREATE", "UPDATE"].includes(effect.classification)));
		assert.deepEqual(await applyDocumentation(root, aligned, aligned.hash), []);
	});
});

test("failure before writes reports the entire pending manifest", async () => {
	await withTemporaryRoot(async root => {
		const plan = planDocumentation(await discoverDocumentation(root, "standalone"));
		let failure;
		try {
			await applyDocumentation(root, plan, plan.hash, "before_writes");
		} catch (error) {
			failure = error;
		}
		assert.ok(failure);
		assert.deepEqual(failure.completed, []);
		assert.equal(failure.pending.length, plan.effects.filter(effect => effect.classification === "CREATE").length);
		assert.deepEqual(failure.operations, []);
	});
});
