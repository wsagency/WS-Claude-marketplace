import assert from "node:assert/strict";
import test from "node:test";
import { apply, plan, resume } from "./reconfigure.mjs";

const CONFIG = Object.freeze({
	schema_version: 1,
	triage: Object.freeze({
		labels: Object.freeze({
			needs_triage: "needs-triage",
			needs_info: "needs-info",
			ready_for_agent: "ready-for-agent",
			ready_for_human: "ready-for-human",
			wontfix: "wontfix",
		}),
	}),
	domain: Object.freeze({ layout: "single_context" }),
});

function triageChoices(overrides = {}) {
	return {
		domain: "tracker",
		fields: ["triage.labels.needs_triage"],
		values: { "triage.labels.needs_triage": "queue/triage" },
		triageMappings: { needs_triage: { newLabel: "queue/triage" } },
		...overrides,
	};
}

function domainChoices(routes, overrides = {}) {
	return {
		domain: "tracker",
		fields: ["domain.layout"],
		values: { "domain.layout": "multi_context" },
		artifactRoutes: routes,
		...overrides,
	};
}

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
		refetchRemoteFingerprint: async effect => effect.remoteFingerprint,
		applyEffect: async effect => {
			applied.push(effect.id);
			history.push(`apply:${effect.id}`);
			return effect.target.startsWith("remote:") ? { identity: { id: effect.target, version: 1 } } : undefined;
		},
		verifyEffect: async effect => {
			verified.push(effect.id);
			history.push(`verify:${effect.id}`);
			return true;
		},
		verifyCutover: async () => true,
		verifyCompletion: async () => true,
		validatePartialState: async () => ({ valid: true }),
		now: () => 1_693_612_800_000,
		getJournal: () => journal,
		getAudit: () => audit,
		getApplied: () => applied,
		getVerified: () => verified,
		getHistory: () => history,
		...overrides,
	};
}

const TRIAGE_SNAPSHOT = Object.freeze({
	shape: "standalone",
	repositoryId: "repo",
	entries: {
		"remote:label:queue/triage": { kind: "missing", fingerprint: null },
		"remote:ticket:101": { kind: "file", content: JSON.stringify({ labels: ["needs-triage"] }), fingerprint: "remote-101-v1" },
		"local:ticket:local-1": { kind: "file", content: JSON.stringify({ labels: ["needs-triage"] }), fingerprint: "local-1-v1" },
		"remote:ticket:unaffected": { kind: "file", content: JSON.stringify({ labels: ["needs-info"] }), fingerprint: "remote-unaffected-v1" },
		"managed:triage-adapter": { kind: "file", fingerprint: "adapter-v1" },
	},
});

const DOMAIN_ROUTES = Object.freeze([
	{ source: "CONTEXT.md", destination: "CONTEXT-MAP.md", kind: "context", intent: "move", authorizeSourceDelete: true },
	{ source: "dev-docs/decisions/0001-auth.md", destination: "contexts/auth/decisions/0001-auth.md", kind: "decision", intent: "copy" },
]);

const DOMAIN_SNAPSHOT = Object.freeze({
	shape: "standalone",
	repositoryId: "repo",
	entries: {
		"CONTEXT.md": { kind: "file", content: "# Authored context\n\nPreserve me.\n", fingerprint: "context-v1" },
		"CONTEXT-MAP.md": { kind: "missing", fingerprint: null },
		"dev-docs/decisions/0001-auth.md": { kind: "file", content: "# Decision\n\nAuthored rationale.\n", fingerprint: "decision-v1" },
		"contexts/auth/decisions/0001-auth.md": { kind: "missing", fingerprint: null },
	},
});

test("triage reconfiguration is keyed by canonical semantic roles and preserves every unselected field and artifact", () => {
	const result = plan(CONFIG, TRIAGE_SNAPSHOT, {}, triageChoices());
	assert.equal(result.effects.find(effect => effect.target === "config:triage.labels.needs_triage")?.classification, "UPDATE");
	assert.equal(result.effects.find(effect => effect.target === "config:triage.labels.needs_info")?.classification, "PRESERVE");
	assert.equal(result.effects.find(effect => effect.target === "managed:triage-adapter")?.classification, "PRESERVE");
	assert.throws(() => plan(CONFIG, TRIAGE_SNAPSHOT, {}, triageChoices({
		fields: ["triage.labels.needs_triage"],
		values: { "triage.labels.needs_triage": "defect" },
		triageMappings: { defect: { newLabel: "defect" } },
	})), error => error.code === "ERR_UNKNOWN_TRIAGE_ROLE");
});

test("affected local and remote items are visible while unrelated work stays untouched", () => {
	const result = plan(CONFIG, TRIAGE_SNAPSHOT, {}, triageChoices());
	assert.deepEqual(result.affectedItems.map(item => item.target).sort(), ["local:ticket:local-1", "remote:ticket:101"]);
	assert.equal(result.effects.some(effect => effect.target === "remote:ticket:unaffected" && ["UPDATE", "DELETE"].includes(effect.classification)), false);
	assert.ok(result.effects.some(effect => effect.target === "remote:ticket:unaffected" && effect.classification === "PRESERVE"));
});

test("claimed work, unresolved tracker conflicts, pending sync, and unreadable items block only affected relabeling", () => {
	const snapshot = {
		shape: "standalone",
		entries: {
			"remote:label:queue/triage": { kind: "missing", fingerprint: null },
			"local:ticket:claimed": { kind: "file", content: JSON.stringify({ labels: ["needs-triage"], claimed: true }), fingerprint: "c1" },
			"remote:ticket:conflict": { kind: "file", content: JSON.stringify({ labels: ["needs-triage"], unresolvedConflict: true }), fingerprint: "c2" },
			"local:ticket:pending": { kind: "file", content: JSON.stringify({ labels: ["needs-triage"], pendingSync: true }), fingerprint: "c3" },
			"remote:ticket:unreadable": { kind: "file", content: "not-json", fingerprint: "c4" },
		},
	};
	const result = plan(CONFIG, snapshot, {}, triageChoices());
	assert.equal(result.blockers.length, 4);
	assert.equal(result.requiresConfirmation, false);
	assert.ok(result.blockers.every(blocker => /Affected item/.test(blocker.reason)));
});

test("new labels are created or validated in prepare and verified before mapping and item cutover", async () => {
	const created = plan(CONFIG, TRIAGE_SNAPSHOT, {}, triageChoices());
	const createLabel = created.effects.find(effect => effect.target === "remote:label:queue/triage");
	assert.equal(createLabel.phase, "prepare");
	assert.equal(createLabel.classification, "CREATE");
	const configEffect = created.effects.find(effect => effect.target === "config:triage.labels.needs_triage");
	assert.ok(configEffect.dependencies.includes(createLabel.id));

	const adapters = mockAdapters();
	const result = await apply(CONFIG, TRIAGE_SNAPSHOT, {}, triageChoices(), created.hash, created.effects, adapters);
	assert.equal(result.success, true, result.report);
	const verifyLabel = adapters.getHistory().indexOf(`verify:${createLabel.id}`);
	const applyConfig = adapters.getHistory().indexOf(`apply:${configEffect.id}`);
	assert.ok(verifyLabel >= 0 && verifyLabel < applyConfig);

	const existingSnapshot = {
		...TRIAGE_SNAPSHOT,
		entries: { ...TRIAGE_SNAPSHOT.entries, "remote:label:queue/triage": { kind: "state", fingerprint: "label-v1" } },
	};
	const existing = plan(CONFIG, existingSnapshot, {}, triageChoices());
	assert.equal(existing.effects.find(effect => effect.target === "remote:label:queue/triage").classification, "NO-OP");
});

test("old labels are removed only from affected items during cleanup after the new mapping is active", () => {
	const result = plan(CONFIG, TRIAGE_SNAPSHOT, {}, triageChoices());
	const cleanup = result.effects.filter(effect => effect.payload?.operation === "remove_old_semantic_label");
	assert.deepEqual(cleanup.map(effect => effect.target).sort(), ["local:ticket:local-1", "remote:ticket:101"]);
	assert.ok(cleanup.every(effect => effect.phase === "cleanup"));
	assert.ok(cleanup.every(effect => effect.dependencies.includes("cutover:config:triage.labels.needs_triage:set")));
});

test("domain layout requires explicit context and decision routes and reports collisions without guessing", () => {
	assert.throws(() => plan(CONFIG, DOMAIN_SNAPSHOT, {}, domainChoices([])), error => error.code === "ERR_DOMAIN_ROUTES_REQUIRED");
	assert.throws(() => plan(CONFIG, DOMAIN_SNAPSHOT, {}, domainChoices([DOMAIN_ROUTES[0]])), error => error.code === "ERR_INCOMPLETE_DOMAIN_ROUTES");

	const collisionSnapshot = {
		...DOMAIN_SNAPSHOT,
		entries: { ...DOMAIN_SNAPSHOT.entries, "CONTEXT-MAP.md": { kind: "file", content: "existing", fingerprint: "collision-v1" } },
	};
	const collision = plan(CONFIG, collisionSnapshot, {}, domainChoices(DOMAIN_ROUTES));
	assert.equal(collision.requiresConfirmation, false);
	assert.equal(collision.collisions.length, 1);
	assert.match(collision.blockers[0].reason, /collision/);
});

test("domain destinations preserve authored bytes and verify before active routing; source deletion is explicit cleanup", async () => {
	const result = plan(CONFIG, DOMAIN_SNAPSHOT, {}, domainChoices(DOMAIN_ROUTES));
	const contextCopy = result.effects.find(effect => effect.target === "CONTEXT-MAP.md" && effect.classification === "CREATE");
	const decisionCopy = result.effects.find(effect => effect.target === "contexts/auth/decisions/0001-auth.md" && effect.classification === "CREATE");
	assert.equal(contextCopy.after, DOMAIN_SNAPSHOT.entries["CONTEXT.md"].content);
	assert.equal(decisionCopy.after, DOMAIN_SNAPSHOT.entries["dev-docs/decisions/0001-auth.md"].content);
	const layout = result.effects.find(effect => effect.target === "config:domain.layout");
	assert.deepEqual(new Set(layout.dependencies), new Set([contextCopy.id, decisionCopy.id]));
	const deleteSource = result.effects.find(effect => effect.target === "CONTEXT.md" && effect.classification === "DELETE");
	assert.equal(deleteSource.phase, "cleanup");
	assert.ok(deleteSource.dependencies.includes(layout.id));
	assert.equal(result.effects.some(effect => effect.target === "dev-docs/decisions/0001-auth.md" && effect.classification === "DELETE"), false);

	const adapters = mockAdapters();
	const applied = await apply(CONFIG, DOMAIN_SNAPSHOT, {}, domainChoices(DOMAIN_ROUTES), result.hash, result.effects, adapters);
	assert.equal(applied.success, true);
	assert.ok(adapters.getHistory().indexOf(`verify:${contextCopy.id}`) < adapters.getHistory().indexOf(`apply:${layout.id}`));
	assert.ok(adapters.getHistory().indexOf(`verify:${layout.id}`) < adapters.getHistory().indexOf(`apply:${deleteSource.id}`));
});

test("move intent without deletion authorization preserves the authored source", () => {
	const routes = DOMAIN_ROUTES.map(route => route.source === "CONTEXT.md" ? { ...route, authorizeSourceDelete: false } : route);
	const result = plan(CONFIG, DOMAIN_SNAPSHOT, {}, domainChoices(routes));
	assert.ok(result.effects.some(effect => effect.target === "CONTEXT.md" && effect.classification === "PRESERVE"));
	assert.equal(result.effects.some(effect => effect.target === "CONTEXT.md" && effect.classification === "DELETE"), false);
});

test("remote drift stops before relabel mutation and retains the journal for fresh authorization", async () => {
	const result = plan(CONFIG, TRIAGE_SNAPSHOT, {}, triageChoices());
	const adapters = mockAdapters({ refetchRemoteFingerprint: async () => "drifted" });
	const applied = await apply(CONFIG, TRIAGE_SNAPSHOT, {}, triageChoices(), result.hash, result.effects, adapters);
	assert.equal(applied.success, false);
	assert.deepEqual(adapters.getApplied(), []);
	assert.ok(adapters.getJournal());
	assert.match(applied.report, /Remote drift/);
});

test("interrupted domain cutover resumes the confirmed remainder without recopying verified destinations", async () => {
	const selectedChoices = domainChoices(DOMAIN_ROUTES);
	const result = plan(CONFIG, DOMAIN_SNAPSHOT, {}, selectedChoices);
	const adapters = mockAdapters();
	const interrupted = await apply(CONFIG, DOMAIN_SNAPSHOT, {}, selectedChoices, result.hash, result.effects, adapters, { failAtPhase: "cutover" });
	assert.equal(interrupted.success, false);
	const prepared = [...adapters.getApplied()];
	const resumed = await resume(CONFIG, DOMAIN_SNAPSHOT, {}, selectedChoices, adapters);
	assert.equal(resumed.success, true);
	assert.deepEqual(adapters.getApplied().filter(id => prepared.includes(id)), prepared);
	assert.equal(new Set(adapters.getApplied()).size, adapters.getApplied().length);
});

test("aligned triage and domain routing are no-op plans requiring no confirmation", async () => {
	const triageAlignedChoices = triageChoices({
		values: { "triage.labels.needs_triage": "needs-triage" },
		triageMappings: { needs_triage: { newLabel: "needs-triage" } },
	});
	const triageAligned = plan(CONFIG, { shape: "standalone", repositoryId: "repo", entries: {} }, {}, triageAlignedChoices);
	assert.equal(triageAligned.requiresConfirmation, false);
	const domainAlignedChoices = domainChoices([], { values: { "domain.layout": "single_context" } });
	const domainAligned = plan(CONFIG, { shape: "standalone", repositoryId: "repo", entries: {} }, {}, domainAlignedChoices);
	assert.equal(domainAligned.requiresConfirmation, false);
	const adapters = mockAdapters();
	const applied = await apply(CONFIG, { shape: "standalone", repositoryId: "repo", entries: {} }, {}, domainAlignedChoices, domainAligned.hash, domainAligned.effects, adapters);
	assert.equal(applied.success, true);
	assert.deepEqual(adapters.getHistory(), []);
});
