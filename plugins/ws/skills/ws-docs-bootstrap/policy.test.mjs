import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
	deriveDocumentationReadiness,
	derivePolicyReadiness,
	inspectCanonicalPolicy,
	requirePolicyCapability,
} from "./policy.mjs";

const CANONICAL_POLICY = `schema_version: 1

changelog:
  update_mode: commit
  path: changes/CHANGELOG.md
  skip_types: [docs, chore]

docs:
  user_track: handbook
  dev_track: engineering/docs
  default_audience: user
  default_scope: product
  adr_for_arch_changes: false
`;

async function withRoot(run) {
	const root = await mkdtemp(path.join(tmpdir(), "ws-docs-policy-"));
	try {
		return await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function write(root, target, content) {
	await mkdir(path.dirname(path.join(root, target)), { recursive: true });
	await writeFile(path.join(root, target), content, "utf8");
}

test("canonical policy exposes configured docs and changelog fields without defaults", async () => {
	await withRoot(async root => {
		await write(root, ".wsagency/config.yaml", CANONICAL_POLICY);
		const inspection = await inspectCanonicalPolicy(root);
		assert.equal(inspection.status, "valid");
		assert.deepEqual(inspection.docs, {
			user_track: "handbook",
			dev_track: "engineering/docs",
			default_audience: "user",
			default_scope: "product",
			adr_for_arch_changes: false,
		});
		assert.deepEqual(inspection.changelog, {
			update_mode: "commit",
			path: "changes/CHANGELOG.md",
			skip_types: ["docs", "chore"],
		});
		assert.equal(derivePolicyReadiness(inspection, "maintenance").ready, true);
	});
});

test("capability readiness requires only its canonical section", async () => {
	await withRoot(async root => {
		await write(root, ".wsagency/config.yaml", "schema_version: 1\n\ndocs:\n  user_track: docs\n  dev_track: dev-docs\n  default_audience: ask\n  default_scope: repo\n  adr_for_arch_changes: true\n");
		const inspection = await inspectCanonicalPolicy(root);
		assert.equal(derivePolicyReadiness(inspection, "documentation").ready, true);
		assert.equal(derivePolicyReadiness(inspection, "changelog").ready, false);
		await assert.rejects(() => requirePolicyCapability(root, "changelog"), error => {
			assert.equal(error.code, "missing_changelog_policy");
			assert.match(error.message, /\/ws-setup/);
			return true;
		});
	});
});

test("legacy docs and setup files are detected by path but never parsed as policy", async () => {
	for (const legacyPath of [".claude/docs-config.yaml", ".claude/ws-project.yaml"]) {
		await withRoot(async root => {
			await write(root, legacyPath, "docs:\n  default_audience: user\nchangelog:\n  update_mode: commit\n");
			const inspection = await inspectCanonicalPolicy(root);
			assert.equal(inspection.status, "blocked");
			assert.equal(inspection.config, null);
			assert.match(inspection.blockers[0].message, new RegExp(legacyPath.replaceAll(".", "\\.")));
			assert.match(inspection.blockers[0].message, /not a policy fallback/);
			assert.match(inspection.blockers[0].message, /\/ws-setup/);
		});
	}
});

test("valid canonical policy wins without consulting an adjacent legacy file", async () => {
	await withRoot(async root => {
		await write(root, ".wsagency/config.yaml", CANONICAL_POLICY);
		await write(root, ".claude/docs-config.yaml", "this: is: deliberately: invalid\n");
		const inspection = await inspectCanonicalPolicy(root);
		assert.equal(inspection.status, "valid");
		assert.equal(inspection.docs.user_track, "handbook");
	});
});

test("project-shape readiness distinguishes repo docs from a missing product output", async () => {
	await withRoot(async root => {
		await write(root, ".wsagency/config.yaml", CANONICAL_POLICY);
		const inspection = await inspectCanonicalPolicy(root);
		const standalone = deriveDocumentationReadiness(inspection, {
			projectShape: "standalone",
			userTrack: true,
			devTrack: true,
			changelog: true,
		});
		assert.equal(standalone.publishReady, true);
		const hubInternal = deriveDocumentationReadiness(inspection, {
			projectShape: "hub_root",
			devTrack: true,
			changelog: true,
			productDocsRepository: false,
		});
		assert.equal(hubInternal.docsReady, true);
		assert.ok(!hubInternal.blockers.some(blocker => blocker.code === "missing_product_docs_repository"));
		const hub = deriveDocumentationReadiness(inspection, {
			projectShape: "hub_root",
			devTrack: true,
			changelog: true,
			requireProductDocsRepository: true,
			productDocsRepository: false,
		});
		assert.equal(hub.docsReady, true);
		assert.equal(hub.publishReady, false);
		assert.ok(hub.blockers.some(blocker => blocker.code === "missing_product_docs_repository"));
	});
});
