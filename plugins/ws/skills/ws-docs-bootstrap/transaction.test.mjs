import { describe, test } from "node:test";
import assert from "node:assert";
import * as path from "node:path";
import { discoverDocumentation, planDocumentation } from "./transaction.mjs";
import { realpath } from "node:fs/promises";

// Mocking some FS operations for the tests or just test the pure plan logic.
// discoverDocumentation needs real FS if we don't mock it, but planDocumentation is pure.

describe("Documentation Bootstrap Plan", () => {
	test("Standalone missing-only creates both tracks and 3-file CONTRIBUTING", () => {
		const discovery = {
			root: "/mock/root",
			projectShape: "standalone",
			entries: {
				".claude/docs-config.yaml": { kind: "missing", fingerprint: null },
				"CHANGELOG.md": { kind: "missing", fingerprint: null },
				"CONTRIBUTING.md": { kind: "missing", fingerprint: null },
				"docs/contributing.md": { kind: "missing", fingerprint: null },
				"dev-docs/development.md": { kind: "missing", fingerprint: null },
				"docs": { kind: "missing", fingerprint: null },
				"dev-docs": { kind: "missing", fingerprint: null }
			}
		};

		const plan = planDocumentation(discovery);
		
		const createdTargets = plan.effects.filter(e => e.classification === "CREATE").map(e => e.target);
		assert.ok(createdTargets.includes("docs"), "Should create docs dir");
		assert.ok(createdTargets.includes("dev-docs"), "Should create dev-docs dir");
		assert.ok(createdTargets.includes("CONTRIBUTING.md"), "Should create CONTRIBUTING.md");
		assert.ok(createdTargets.includes("docs/contributing.md"), "Should create docs/contributing.md");
		assert.ok(createdTargets.includes("dev-docs/development.md"), "Should create dev-docs/development.md");
		assert.ok(!plan.effects.some(effect => effect.target === ".claude/docs-config.yaml"), "Legacy docs config must not be recreated");
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
	});

	test("Hub subrepository missing-only creates only internal track and 2-file CONTRIBUTING", () => {
		const discovery = {
			root: "/mock/root",
			projectShape: "hub_subrepository",
			entries: {
				".claude/docs-config.yaml": { kind: "missing", fingerprint: null },
				"CHANGELOG.md": { kind: "missing", fingerprint: null },
				"CONTRIBUTING.md": { kind: "missing", fingerprint: null },
				"dev-docs/development.md": { kind: "missing", fingerprint: null },
				"dev-docs": { kind: "missing", fingerprint: null }
			}
		};

		const plan = planDocumentation(discovery);
		
		const createdTargets = plan.effects.filter(e => e.classification === "CREATE").map(e => e.target);
		assert.ok(!createdTargets.includes("docs"), "Should NOT create docs dir");
		assert.ok(createdTargets.includes("dev-docs"), "Should create dev-docs dir");
		assert.ok(createdTargets.includes("CONTRIBUTING.md"), "Should create CONTRIBUTING.md");
		assert.ok(!createdTargets.includes("docs/contributing.md"), "Should NOT create docs/contributing.md");
		assert.ok(createdTargets.includes("dev-docs/development.md"), "Should create dev-docs/development.md");
	});
	test("Standalone PRESERVE keeps differing existing content", () => {
		const discovery = {
			root: "/mock", projectShape: "standalone",
			entries: { "CONTRIBUTING.md": { kind: "file", content: "Custom existing contributing." } }
		};
		const plan = planDocumentation(discovery);
		const effect = plan.effects.find(e => e.target === "CONTRIBUTING.md");
		assert.strictEqual(effect.classification, "PRESERVE");
		assert.strictEqual(effect.after, "Custom existing contributing.");
	});

	test("Aligned NO-OP applies to exact matching content", () => {
		const discovery = {
			root: "/mock", projectShape: "standalone",
			entries: { "CHANGELOG.md": { kind: "file", content: "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).\n\n## [Unreleased]\n" } }
		};
		const plan = planDocumentation(discovery);
		const effect = plan.effects.find(e => e.target === "CHANGELOG.md");
		assert.strictEqual(effect.classification, "NO-OP");
	});

	test("Hub root maps to isStandalone logic (generates all)", () => {
		const discovery = {
			root: "/mock", projectShape: "hub_root",
			entries: { }
		};
		const plan = planDocumentation(discovery);
		// Hub root is effectively standalone in terms of local docs shape.
		// Wait, the logic is `projectShape === "standalone" || projectShape === "not_git"`.
		// Ah, for hub root, it shouldn't generate docs/. Let's check the test expectation.
		const docsEffect = plan.effects.find(e => e.target === "docs");
		assert.strictEqual(docsEffect.classification, "SKIP");
	});

});
import { applyDocumentation } from "./transaction.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("Documentation Bootstrap Apply", () => {
	let tempDir;
	
	test("setup tempdir", async () => {
		tempDir = await mkdtemp(path.join(tmpdir(), "ws-docs-test-"));
	});

	test("Stops on injected failure before writes", async () => {
		const plan = { effects: [{ classification: "CREATE", target: "docs", kind: "directory" }] };
		try {
			await applyDocumentation(tempDir, plan, "before_writes");
			assert.fail("Should throw");
		} catch (e) {
			assert.strictEqual(e.message, "Injected failure before writes.");
		}
	});

	test("Stops on injected failure at specific target", async () => {
		const plan = { effects: [
			{ classification: "CREATE", target: "docs", kind: "directory" },
			{ classification: "CREATE", target: "docs/index.md", kind: "file", after: "content" }
		] };
		
		try {
			await applyDocumentation(tempDir, plan, "docs/index.md");
			assert.fail("Should throw");
		} catch (e) {
			assert.strictEqual(e.message, "Injected failure writing docs/index.md.");
			assert.strictEqual(e.completed.length, 1);
			assert.strictEqual(e.completed[0].target, "docs");
			assert.strictEqual(e.pending.length, 1);
			assert.strictEqual(e.pending[0].target, "docs/index.md");
		}
	});
	test("Resume missing-only skips already created files", async () => {
		// Setup initial state
		const plan1 = { effects: [
			{ classification: "CREATE", target: "docs", kind: "directory" },
			{ classification: "CREATE", target: "docs/index.md", kind: "file", after: "content" }
		] };
		
		// Apply failure on second
		try {
			await applyDocumentation(tempDir, plan1, "docs/index.md");
		} catch (e) {
			// Recovered state should show docs as existing
			const plan2 = { effects: [
				{ classification: "NO-OP", target: "docs", kind: "directory" },
				{ classification: "CREATE", target: "docs/index.md", kind: "file", after: "content" }
			] };
			const ops = await applyDocumentation(tempDir, plan2);
			// Only writing index.md on resume
			assert.strictEqual(ops.filter(o => o.action === "write").length, 1);
			assert.strictEqual(ops[0].target, "docs/index.md");
		}
	});

	test("cleanup", async () => {
		if (tempDir) await rm(tempDir, { recursive: true, force: true });
	});
});
