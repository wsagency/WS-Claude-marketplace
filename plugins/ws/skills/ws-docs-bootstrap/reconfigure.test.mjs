import assert from "node:assert/strict";
import test from "node:test";
import { acceptPartial, apply, plan, resume } from "./reconfigure.mjs";

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

function mockAdapters(overrides = {}) {
	let journal = null;
	let audit = null;
	const applied = [];
	const verified = [];
	const history = [];
	return {
		writeJournal: async (hash, state) => {
			journal = { hash, state };
			history.push(`journal:${state.phase}`);
		},
		readJournal: async () => journal,
		removeJournal: async () => {
			journal = null;
			history.push("removeJournal");
		},
		appendAudit: async record => {
			audit = record;
			history.push("appendAudit");
		},
		revalidateLocalFingerprints: async () => true,
		revalidateMachineFingerprints: async () => true,
		applyEffect: async effect => {
			applied.push(effect.id);
			history.push(`apply:${effect.id}`);
		},
		verifyEffect: async effect => {
			verified.push(effect.id);
			history.push(`verify:${effect.id}`);
			return true;
		},
		verifyCutover: async () => true,
		verifyCompletion: async () => true,
		validatePartialState: async () => ({ valid: true, ownershipReport: { "/fake/repo": "partial" } }),
		now: () => 1_693_612_800_000,
		getJournal: () => journal,
		getAudit: () => audit,
		getApplied: () => applied,
		getVerified: () => verified,
		getHistory: () => history,
		...overrides,
	};
}

function changelogMove(overrides = {}) {
	return {
		domain: "changelog",
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
		domain: "docs",
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
		domain: "docs",
		fields: ["docs.default_audience"],
		values: { "docs.default_audience": "dev" },
	});
	assert.deepEqual(audience.effects.filter(effect => ["CREATE", "UPDATE", "DELETE"].includes(effect.classification)).map(effect => effect.target), ["config:docs.default_audience"]);

	const cadence = plan(BASE_CONFIG, DISCOVERY, {
		domain: "changelog",
		fields: ["changelog.update_mode"],
		values: { "changelog.update_mode": "commit" },
	});
	assert.deepEqual(cadence.effects.filter(effect => ["CREATE", "UPDATE", "DELETE"].includes(effect.classification)).map(effect => effect.target), ["config:changelog.update_mode"]);
});

test("documentation enablement composes the shared missing-only bootstrap and preserves authored files", () => {
	const result = plan(BASE_CONFIG, DISCOVERY, { domain: "docs", fields: [], enableDocs: true });
	assert.equal(result.effects.find(effect => effect.target === "docs")?.classification, "PRESERVE");
	assert.equal(result.effects.find(effect => effect.target === "docs/index.md")?.classification, "PRESERVE");
	assert.equal(result.effects.find(effect => effect.target === "dev-docs")?.classification, "CREATE");
	assert.equal(result.effects.some(effect => effect.target === "docs/index.md" && effect.classification === "UPDATE"), false);
	assert.equal(result.requiresConfirmation, true);
});

test("documentation disablement preserves every existing document and authored directory", async () => {
	const selected = { domain: "docs", fields: [], disableDocs: true };
	const result = plan(BASE_CONFIG, DISCOVERY, selected);
	for (const target of ["CHANGELOG.md", "docs", "docs/index.md", "AGENTS.md"]) {
		assert.equal(result.effects.find(effect => effect.target === target)?.classification, "PRESERVE");
	}
	assert.equal(result.effects.some(effect => effect.classification === "DELETE"), false);
	assert.equal(result.requiresConfirmation, false);
	const adapters = mockAdapters();
	const applied = await apply(BASE_CONFIG, DISCOVERY, selected, result.hash, result.effects, adapters);
	assert.equal(applied.success, true);
	assert.deepEqual(adapters.getHistory(), []);
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

test("path inputs reject traversal and cancellation performs no mutation", () => {
	assert.throws(() => plan(BASE_CONFIG, DISCOVERY, changelogMove({
		pathTransitions: [{ source: "CHANGELOG.md", destination: "../outside.md", intent: "copy" }],
	})), error => error.code === "ERR_INVALID_PATH_TRANSITION");
	const reviewed = plan(BASE_CONFIG, DISCOVERY, changelogMove());
	assert.equal(reviewed.requiresConfirmation, true);
	assert.equal(DISCOVERY.entries["CHANGELOG.md"].content, "# Authored changelog\n\nKeep history.\n");
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

	const adapters = mockAdapters();
	const applied = await apply(BASE_CONFIG, DISCOVERY, selected, result.hash, result.effects, adapters);
	assert.equal(applied.success, true, applied.report);
	assert.ok(adapters.getHistory().indexOf(`verify:${destination.id}`) < adapters.getHistory().indexOf(`apply:${config.id}`));
	assert.ok(adapters.getHistory().indexOf(`verify:${reference.id}`) < adapters.getHistory().indexOf(`apply:${cleanup.id}`));
	assert.equal(adapters.getAudit().status, "completed");
});

test("interrupted move resumes without recopying the verified destination", async () => {
	const selected = changelogMove();
	const result = plan(BASE_CONFIG, DISCOVERY, selected);
	const adapters = mockAdapters();
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
	const adapters = mockAdapters();
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
		domain: "docs",
		fields: ["docs.default_audience"],
		values: { "docs.default_audience": "ask" },
	};
	const result = plan(BASE_CONFIG, DISCOVERY, selected);
	const adapters = mockAdapters();
	assert.equal(result.requiresConfirmation, false);
	const applied = await apply(BASE_CONFIG, DISCOVERY, selected, result.hash, result.effects, adapters);
	assert.equal(applied.report, "Aligned reconfiguration. No changes required.");
	assert.deepEqual(adapters.getHistory(), []);
});
