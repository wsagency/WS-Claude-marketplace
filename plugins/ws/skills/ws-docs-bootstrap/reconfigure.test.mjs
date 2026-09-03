import assert from "node:assert/strict";
import test from "node:test";
import { acceptPartial, apply, plan, resume } from "./reconfigure.mjs";
import { createMockReconfigureAdapters } from "../ws-project-bootstrap/reconfigure.test-support.mjs";

const BASE_CONFIG = Object.freeze({
	schema_version: 1,
	docs: Object.freeze({
		user_track: "docs",
		dev_track: "dev-docs",
		default_audience: "ask",
		default_scope: "repo",
		adr_for_arch_changes: true,
	}),
	changelog: Object.freeze({
		update_mode: "pull_request",
		path: "CHANGELOG.md",
		skip_types: ["docs", "chore", "test", "style", "build", "ci"],
	}),
});

const DISCOVERY = Object.freeze({
	root: "/fake/repo",
	projectShape: "standalone",
	entries: {
		"CHANGELOG.md": { kind: "file", content: "# Authored changelog\n\nKeep history.\n", fingerprint: "changelog-v1" },
		"docs/CHANGELOG.md": { kind: "missing", fingerprint: null },
		docs: { kind: "directory", fingerprint: "docs-dir" },
		"docs/index.md": { kind: "file", content: "# Authored product docs\n", fingerprint: "docs-index-v1" },
		"dev-docs": { kind: "missing", fingerprint: null },
		"AGENTS.md": { kind: "file", content: "Changelog: CHANGELOG.md\n", fingerprint: "agents-v1" },
	},
});


function changelogMove(overrides = {}) {
	return {
		domains: ["documentation"],
		fields: ["changelog.path"],
		values: { "changelog.path": "docs/CHANGELOG.md" },
		pathTransitions: [{
			source: "CHANGELOG.md",
			destination: "docs/CHANGELOG.md",
			intent: "move",
			managedReferences: [{
				target: "AGENTS.md",
				before: "Changelog: CHANGELOG.md\n",
				after: "Changelog: docs/CHANGELOG.md\n",
				fingerprint: "agents-v1",
			}],
			verificationSteps: ["destination content hash matches source", "canonical path and managed references resolve"],
		}],
		...overrides,
	};
}

test("documentation and changelog fields are independently selectable and all unselected policy/artifacts are preserved", () => {
	const selected = {
		domains: ["documentation"],
		fields: ["docs.default_audience"],
		values: { "docs.default_audience": "user" },
	};
	const result = plan(BASE_CONFIG, DISCOVERY, selected);
	assert.equal(result.effects.find(effect => effect.target === "config:docs.default_audience")?.classification, "UPDATE");
	assert.equal(result.effects.find(effect => effect.target === "config:docs.default_scope")?.classification, "PRESERVE");
	assert.equal(result.effects.find(effect => effect.target === "config:changelog.path")?.classification, "PRESERVE");
	assert.equal(result.effects.find(effect => effect.target === "docs/index.md")?.classification, "PRESERVE");
	assert.equal(result.effects.filter(effect => ["CREATE", "UPDATE", "DELETE"].includes(effect.classification)).length, 1);
});

test("policy-only changes touch canonical policy only when no managed reference depends on them", () => {
	const audience = plan(BASE_CONFIG, DISCOVERY, {
		domains: ["documentation"],
		fields: ["docs.default_audience"],
		values: { "docs.default_audience": "dev" },
	});
	assert.deepEqual(audience.effects.filter(effect => ["CREATE", "UPDATE", "DELETE"].includes(effect.classification)).map(effect => effect.target), ["config:docs.default_audience"]);

	const cadence = plan(BASE_CONFIG, DISCOVERY, {
		domains: ["documentation"],
		fields: ["changelog.update_mode"],
		values: { "changelog.update_mode": "commit" },
	});
	assert.deepEqual(cadence.effects.filter(effect => ["CREATE", "UPDATE", "DELETE"].includes(effect.classification)).map(effect => effect.target), ["config:changelog.update_mode"]);
});

test("documentation enablement composes the shared missing-only bootstrap and preserves authored files", () => {
	const result = plan(BASE_CONFIG, DISCOVERY, { domains: ["documentation"], fields: [], enableDocs: true });
	assert.equal(result.effects.find(effect => effect.target === "docs")?.classification, "PRESERVE");
	assert.equal(result.effects.find(effect => effect.target === "docs/index.md")?.classification, "PRESERVE");
	assert.equal(result.effects.find(effect => effect.target === "dev-docs")?.classification, "CREATE");
	assert.equal(result.effects.some(effect => effect.target === "docs/index.md" && effect.classification === "UPDATE"), false);
	assert.equal(result.requiresConfirmation, true);
});

test("documentation disablement removes only canonical policy and preserves authored content", async () => {
	const selected = { domains: ["documentation"], fields: [], disableDocs: true };
	const result = plan(BASE_CONFIG, DISCOVERY, selected);
	for (const target of ["CHANGELOG.md", "docs", "docs/index.md", "AGENTS.md"]) {
		assert.equal(result.effects.find(effect => effect.target === target)?.classification, "PRESERVE");
	}
	const mutations = result.effects.filter(effect => ["CREATE", "UPDATE", "DELETE"].includes(effect.classification));
	assert.deepEqual(mutations.map(effect => effect.target), ["config:docs"]);
	assert.equal(mutations[0].classification, "UPDATE");
	assert.deepEqual(mutations[0].payload, {
		operation: "remove_config_section",
		section: "docs",
		preserveUnselected: true,
		preserveCommentsAndOrder: true,
	});
	assert.equal(result.effects.some(effect => effect.classification === "DELETE"), false);
	assert.equal(result.requiresConfirmation, true);

	const appliedConfig = structuredClone(BASE_CONFIG);
	const adapters = createMockReconfigureAdapters({
		applyEffect: async effect => {
			if (effect.payload?.operation === "remove_config_section") delete appliedConfig[effect.payload.section];
		},
	});
	const applied = await apply(BASE_CONFIG, DISCOVERY, selected, result.hash, result.effects, adapters);
	assert.equal(applied.success, true);
	assert.equal(Object.hasOwn(appliedConfig, "docs"), false);
	assert.deepEqual(appliedConfig.changelog, BASE_CONFIG.changelog);
	assert.deepEqual(adapters.getApplied(), [mutations[0].id]);
	assert.equal(DISCOVERY.entries["docs/index.md"].content, "# Authored product docs\n");

	const aligned = plan(appliedConfig, DISCOVERY, selected);
	assert.equal(aligned.requiresConfirmation, false);
	const alignedAdapters = createMockReconfigureAdapters();
	const rerun = await apply(appliedConfig, DISCOVERY, selected, aligned.hash, aligned.effects, alignedAdapters);
	assert.equal(rerun.report, "Aligned reconfiguration. No changes required.");
	assert.deepEqual(alignedAdapters.getHistory(), []);
});

test("configured path changes expose content, collision, intent, reference, and verification manifests before confirmation", () => {
	const result = plan(BASE_CONFIG, DISCOVERY, changelogMove());
	assert.equal(result.contentManifest.length, 1);
	assert.deepEqual(result.contentManifest[0], {
		source: "CHANGELOG.md",
		destination: "docs/CHANGELOG.md",
		intent: "move",
		collision: null,
		managedReferences: ["AGENTS.md"],
		verificationSteps: ["destination content hash matches source", "canonical path and managed references resolve"],
		field: "changelog.path",
	});
	assert.deepEqual(result.dependencyClosure.map(item => item.field), ["changelog.path"]);
	assert.equal(result.requiresConfirmation, true);
});

test("path collision and incomplete managed-reference manifests block before confirmation without writes", () => {
	const collisionDiscovery = {
		...DISCOVERY,
		entries: { ...DISCOVERY.entries, "docs/CHANGELOG.md": { kind: "file", content: "existing", fingerprint: "dest-v1" } },
	};
	const collision = plan(BASE_CONFIG, collisionDiscovery, changelogMove());
	assert.equal(collision.requiresConfirmation, false);
	assert.equal(collision.blockers.length, 1);
	assert.ok(collision.contentManifest[0].collision);

	const incomplete = plan(BASE_CONFIG, DISCOVERY, changelogMove({
		pathTransitions: [{ source: "CHANGELOG.md", destination: "docs/CHANGELOG.md", intent: "move" }],
	}));
	assert.equal(incomplete.requiresConfirmation, false);
	assert.match(incomplete.blockers[0].reason, /managed-reference effects/);
});

test("path inputs reject traversal and cancelled dependencies perform no mutation", () => {
	assert.throws(() => plan(BASE_CONFIG, DISCOVERY, changelogMove({
		pathTransitions: [{ source: "CHANGELOG.md", destination: "../outside.md", intent: "copy" }],
	})), error => error.code === "ERR_INVALID_PATH_TRANSITION");
	const configBefore = structuredClone(BASE_CONFIG);
	const contentBefore = DISCOVERY.entries["CHANGELOG.md"].content;
	assert.throws(
		() => plan(BASE_CONFIG, DISCOVERY, changelogMove({ cancelDependent: true })),
		error => error.code === "ERR_DEPENDENT_CANCELLED",
	);
	assert.deepEqual(BASE_CONFIG, configBefore);
	assert.equal(DISCOVERY.entries["CHANGELOG.md"].content, contentBefore);
});

test("destination content and active references verify before cutover and source cleanup", async () => {
	const selected = changelogMove();
	const result = plan(BASE_CONFIG, DISCOVERY, selected);
	const destination = result.effects.find(effect => effect.target === "docs/CHANGELOG.md" && effect.classification === "CREATE");
	const reference = result.effects.find(effect => effect.target === "AGENTS.md" && effect.classification === "UPDATE");
	const config = result.effects.find(effect => effect.target === "config:changelog.path");
	const cleanup = result.effects.find(effect => effect.target === "CHANGELOG.md" && effect.classification === "DELETE");
	assert.equal(destination.after, DISCOVERY.entries["CHANGELOG.md"].content);
	assert.deepEqual(config.dependencies, [destination.id]);
	assert.deepEqual(new Set(cleanup.dependencies), new Set([destination.id, reference.id, config.id]));
	assert.equal(cleanup.phase, "cleanup");

	const adapters = createMockReconfigureAdapters();
	const applied = await apply(BASE_CONFIG, DISCOVERY, selected, result.hash, result.effects, adapters);
	assert.equal(applied.success, true, applied.report);
	assert.ok(adapters.getHistory().indexOf(`verify:${destination.id}`) < adapters.getHistory().indexOf(`apply:${config.id}`));
	assert.ok(adapters.getHistory().indexOf(`verify:${reference.id}`) < adapters.getHistory().indexOf(`apply:${cleanup.id}`));
	assert.equal(adapters.getAudit().status, "completed");
});

test("interrupted move resumes without recopying the verified destination", async () => {
	const selected = changelogMove();
	const result = plan(BASE_CONFIG, DISCOVERY, selected);
	const adapters = createMockReconfigureAdapters();
	const interrupted = await apply(BASE_CONFIG, DISCOVERY, selected, result.hash, result.effects, adapters, { failAtPhase: "cutover" });
	assert.equal(interrupted.success, false);
	const prepared = [...adapters.getApplied()];
	const resumed = await resume(BASE_CONFIG, DISCOVERY, selected, adapters);
	assert.equal(resumed.success, true);
	assert.deepEqual(adapters.getApplied().filter(id => prepared.includes(id)), prepared);
	assert.equal(new Set(adapters.getApplied()).size, adapters.getApplied().length);
});

test("reviewed valid partial state can be accepted before source cleanup and records durable audit", async () => {
	const selected = changelogMove();
	const result = plan(BASE_CONFIG, DISCOVERY, selected);
	const adapters = createMockReconfigureAdapters({
		validatePartialState: async () => ({ valid: true, ownershipReport: { "/fake/repo": "partial" } }),
	});
	await apply(BASE_CONFIG, DISCOVERY, selected, result.hash, result.effects, adapters, { failAtPhase: "cleanup" });
	const accepted = await acceptPartial(BASE_CONFIG, DISCOVERY, selected, adapters);
	assert.equal(accepted.success, true);
	assert.equal(accepted.ownershipReport["/fake/repo"], "partial");
	assert.equal(adapters.getAudit().acceptedPartial, true);
	assert.equal(adapters.getJournal(), null);
	assert.ok(adapters.getHistory().indexOf("appendAudit") < adapters.getHistory().indexOf("removeJournal"));
});

test("aligned documentation policy is prompt-free and writes nothing", async () => {
	const selected = {
		domains: ["documentation"],
		fields: ["docs.default_audience"],
		values: { "docs.default_audience": "ask" },
	};
	const result = plan(BASE_CONFIG, DISCOVERY, selected);
	const adapters = createMockReconfigureAdapters();
	assert.equal(result.requiresConfirmation, false);
	const applied = await apply(BASE_CONFIG, DISCOVERY, selected, result.hash, result.effects, adapters);
	assert.equal(applied.report, "Aligned reconfiguration. No changes required.");
	assert.deepEqual(adapters.getHistory(), []);
});

test("absent docs policy is enabled only with every explicit required leaf and verified bootstrap dependencies", () => {
	const config = { schema_version: 1 };
	const choices = {
		domains: ["documentation"],
		fields: [
			"docs.user_track",
			"docs.dev_track",
			"docs.default_audience",
			"docs.default_scope",
			"docs.adr_for_arch_changes",
		],
		values: {
			"docs.user_track": "docs",
			"docs.dev_track": "dev-docs",
			"docs.default_audience": "ask",
			"docs.default_scope": "repo",
			"docs.adr_for_arch_changes": true,
		},
		enableDocs: true,
	};
	const enabled = plan(config, DISCOVERY, choices);
	const bootstrapIds = enabled.effects.filter(effect => effect.id.startsWith("prepare:docs-bootstrap:")).map(effect => effect.id);
	assert.ok(bootstrapIds.length > 0);
	for (const field of choices.fields) {
		const effect = enabled.effects.find(candidate => candidate.target === `config:${field}`);
		assert.deepEqual(new Set(effect.dependencies), new Set(bootstrapIds));
	}
	assert.throws(
		() => plan(config, DISCOVERY, {
			...choices,
			fields: ["docs.user_track"],
			values: { "docs.user_track": "docs" },
		}),
		error => error.code === "ERR_INCOMPLETE_SECTION_ENABLEMENT",
	);
});

test("documentation and changelog moves reject manifests not bound to a selected canonical path field", () => {
	assert.throws(
		() => plan(BASE_CONFIG, DISCOVERY, {
			domains: ["documentation"],
			fields: [],
			values: {},
			pathTransitions: changelogMove().pathTransitions,
		}),
		error => error.code === "ERR_UNBOUND_PATH_TRANSITION",
	);
});
