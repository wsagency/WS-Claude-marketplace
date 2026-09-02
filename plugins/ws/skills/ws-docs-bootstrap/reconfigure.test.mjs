import assert from "node:assert";
import test from "node:test";
import { acceptPartial, apply, plan, resume } from "./reconfigure.mjs";

const NOW_FIXTURE = 1_693_612_800_000;
const BASE_CONFIG = Object.freeze({
	schema_version: 1,
	docs: Object.freeze({
		user_track: "docs",
		dev_track: "dev-docs",
		default_audience: "ask",
		default_scope: "repo",
		adr_for_arch_changes: true
	}),
	changelog: Object.freeze({
		update_mode: "pull_request",
		path: "CHANGELOG.md",
		skip_types: ["docs", "chore", "test", "style", "build", "ci"]
	})
});

function mockAdapters(overrides = {}) {
	let journal = null;
	let audit = null;
	let appliedEffects = 0;
	const history = [];
	return {
		writeJournal: async (hash, state) => {
			journal = { hash, state };
			history.push("writeJournal");
		},
		readJournal: async () => journal,
		removeJournal: async () => {
			journal = null;
			history.push("removeJournal");
		},
		writeAudit: async record => {
			audit = record;
			history.push("writeAudit");
		},
		applyEffect: async () => {
			appliedEffects += 1;
			history.push("applyEffect");
		},
		revalidateFingerprints: async () => true,
		now: () => NOW_FIXTURE,
		getJournal: () => journal,
		getAudit: () => audit,
		getAppliedEffects: () => appliedEffects,
		getHistory: () => history,
		...overrides,
	};
}

const mockDiscovery = {
	root: "/fake/repo",
	projectShape: "standalone",
	entries: {
		"CHANGELOG.md": { kind: "file", content: "old content", fingerprint: "hash-1" },
		"docs/CHANGELOG.md": { kind: "missing", fingerprint: null },
		"docs": { kind: "directory", fingerprint: "dir" }
	}
};

test("policy-only changes update canonical policy without resetting unselected state", () => {
	const choices = {
		domain: "docs",
		fields: ["docs.default_audience"],
		values: { "docs.default_audience": "user" }
	};
	const result = plan(BASE_CONFIG, mockDiscovery, choices);
	
	const audienceEffect = result.effects.find(e => e.target === "config:docs.default_audience");
	assert.equal(audienceEffect.classification, "UPDATE");
	
	const scopeEffect = result.effects.find(e => e.target === "config:docs.default_scope");
	assert.equal(scopeEffect.classification, "PRESERVE");
	assert.equal(result.requiresConfirmation, true);
});

test("aligned no-op behavior works", async () => {
	const choices = {
		domain: "docs",
		fields: ["docs.default_audience"],
		values: { "docs.default_audience": "ask" } // Same as BASE_CONFIG
	};
	const result = plan(BASE_CONFIG, mockDiscovery, choices);
	const adapters = mockAdapters();
	
	assert.equal(result.requiresConfirmation, false);
	const applied = await apply(BASE_CONFIG, mockDiscovery, choices, result.hash, result.effects, adapters);
	assert.equal(applied.phase, "done");
	assert.equal(applied.ownershipReport["/fake/repo"], "aligned");
});

test("docs disablement preserves existing document/directory", () => {
	const choices = { disableDocs: true };
	const result = plan(BASE_CONFIG, mockDiscovery, choices);
	
	const clEffect = result.effects.find(e => e.target === "CHANGELOG.md");
	assert.equal(clEffect.classification, "PRESERVE");
	
	const missingEffect = result.effects.find(e => e.target === "docs/CHANGELOG.md");
	assert.ok(!missingEffect); // Missing entries shouldn't be PRESERVE targets
});

test("docs enablement invokes shared missing-only bootstrap", () => {
	const choices = { enableDocs: true };
	const result = plan(BASE_CONFIG, mockDiscovery, choices);
	
	// docs directory is existing in mockDiscovery, should be NO-OP/PRESERVE
	const docsEffect = result.effects.find(e => e.target === "docs" && e.kind === "directory");
	assert.equal(docsEffect.classification, "PRESERVE");

	// dev-docs doesn't exist in mockDiscovery, should be CREATE
	const devDocsEffect = result.effects.find(e => e.target === "dev-docs" && e.kind === "directory");
	assert.equal(devDocsEffect.classification, "CREATE");
});

test("path collision causes blocking conflict", () => {
	const choices = {
		pathTransitions: [{ source: "CHANGELOG.md", destination: "docs", intent: "move" }] // destination exists as dir
	};
	const result = plan(BASE_CONFIG, mockDiscovery, choices);
	const conflict = result.effects.find(e => e.target === "docs" && e.classification === "BLOCKING_CONFLICT");
	assert.ok(conflict);
});

test("changing track/changelog path explicit move intent with cleanup", async () => {
	const choices = {
		pathTransitions: [{ source: "CHANGELOG.md", destination: "docs/CHANGELOG.md", intent: "move" }]
	};
	const result = plan(BASE_CONFIG, mockDiscovery, choices);
	
	const createEffect = result.effects.find(e => e.target === "docs/CHANGELOG.md" && e.classification === "CREATE");
	assert.ok(createEffect);
	assert.equal(createEffect.after, "old content");
	
	const deleteEffect = result.effects.find(e => e.target === "CHANGELOG.md" && e.classification === "DELETE");
	assert.ok(deleteEffect);

	const adapters = mockAdapters();
	const applied = await apply(BASE_CONFIG, mockDiscovery, choices, result.hash, result.effects, adapters);
	
	assert.equal(applied.success, true);
	// applyEffect should be called twice (CREATE, DELETE)
	assert.equal(adapters.getAppliedEffects(), 2);
});

test("interrupted move stops before delete, resumes, and permits reviewed partial acceptance", async () => {
	const choices = {
		pathTransitions: [{ source: "CHANGELOG.md", destination: "docs/CHANGELOG.md", intent: "move" }]
	};
	const result = plan(BASE_CONFIG, mockDiscovery, choices);
	const adapters = mockAdapters();

	// Inject failure at cleanup phase (before delete)
	const interrupted = await apply(BASE_CONFIG, mockDiscovery, choices, result.hash, result.effects, adapters, { failAtPhase: "cleanup" });
	assert.equal(interrupted.success, false);
	assert.equal(interrupted.phase, "cleanup");
	assert.equal(adapters.getAppliedEffects(), 1); // Only CREATE happened

	// Partially accept
	const accepted = await acceptPartial(BASE_CONFIG, mockDiscovery, choices, adapters);
	assert.equal(accepted.success, true);
	assert.equal(accepted.ownershipReport["/fake/repo"], "partial");
	assert.equal(adapters.getAudit().acceptedPartial, true);
});

test("resume continues to cleanup", async () => {
	const choices = {
		pathTransitions: [{ source: "CHANGELOG.md", destination: "docs/CHANGELOG.md", intent: "move" }]
	};
	const result = plan(BASE_CONFIG, mockDiscovery, choices);
	const adapters = mockAdapters();

	// Inject failure at cleanup phase index 0
	await apply(BASE_CONFIG, mockDiscovery, choices, result.hash, result.effects, adapters, { failAtCleanupIndex: 0 });
	assert.equal(adapters.getAppliedEffects(), 1); // Only CREATE happened

	const resumed = await resume(BASE_CONFIG, mockDiscovery, choices, adapters);
	assert.equal(resumed.success, true);
	assert.equal(resumed.phase, "done");
	assert.equal(adapters.getAppliedEffects(), 2); // DELETE now happened
});
