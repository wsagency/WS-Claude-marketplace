import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function source(relativePath) {
	return readFile(path.join(ROOT, relativePath), "utf8");
}

test("docs command consumes canonical capability policy and shared missing-only bootstrap", async () => {
	const command = await source("commands/ws-docs.md");
	assert.match(command, /\.wsagency\/config\.yaml/);
	assert.match(command, /derivePolicyReadiness/);
	assert.match(command, /discoverDocumentation\(root, projectShape, validatedConfig\)/);
	assert.match(command, /applyDocumentation\(root, plan, plan\.hash, failureInjection\)/);
	assert.match(command, /never walk upward for configuration/i);
	assert.match(command, /never copy hub\s+values at runtime/i);
	assert.match(command, /never create or initialize it/i);
	assert.doesNotMatch(command, /Project state lives in `\.claude\/docs-config\.yaml`/);
	assert.doesNotMatch(command, /auto\.enforce_via_hooks|changelog_per_commit/);
	assert.doesNotMatch(command, /DOCS_REPO\/docs/);
});

test("docs doctor and skills use canonical paths without legacy policy fallback", async () => {
	const [doctor, dualTrack, hubConvention, bootstrap] = await Promise.all([
		source("agents/docs-doctor.md"),
		source("skills/dual-track-docs/SKILL.md"),
		source("skills/project-hub-conventions/SKILL.md"),
		source("skills/ws-docs-bootstrap/SKILL.md"),
	]);
	for (const content of [doctor, dualTrack, hubConvention, bootstrap]) {
		assert.match(content, /\.wsagency\/config\.yaml/);
		assert.match(content, /never (?:parse|read)[^\n]*legacy|never parse those files as policy|never parse legacy content/i);
	}
	assert.match(doctor, /configured\s+`skip_types`; never substitute a default/);
	assert.match(dualTrack, /Runtime\s+inheritance is forbidden/);
	assert.match(hubConvention, /never read\s+from, merged with, or defaulted from the hub at runtime/);
	assert.match(bootstrap, /missing-only/);
});

test("hub docs workflow and architect use hub policy for product artifacts", async () => {
	const [hubCommand, architect] = await Promise.all([
		source("commands/ws-hub.md"),
		source("agents/hub-architect.md"),
	]);
	assert.match(hubCommand, /requirePolicyCapability\(hubRoot, "hub_documentation"\)/);
	assert.match(hubCommand, /HUB_DEV_TRACK = config\.docs\.dev_track/);
	assert.match(hubCommand, /never read a working child's config for product/);
	assert.match(architect, /read only the hub\s+root config/);
	assert.match(architect, /literal `dev-docs\/` fallback is forbidden/);
	assert.match(architect, /Do not create or initialize a missing docs output repository/);
});

test("shell hooks delegate policy parsing and contain no legacy readers", async () => {
	const [preCommit, stop, manifest] = await Promise.all([
		source("hooks/enforce-changelog.sh"),
		source("hooks/enforce-stop.sh"),
		source("hooks/hooks.json"),
	]);
	for (const hook of [preCommit, stop]) {
		assert.match(hook, /docs-policy\.mjs/);
		assert.doesNotMatch(hook, /docs-config\.yaml|ws-project\.yaml|\bawk\b/);
	}
	assert.match(manifest, /docs maintenance from \.wsagency\/config\.yaml/);
	assert.doesNotMatch(manifest, /docs-config\.yaml/);
});
