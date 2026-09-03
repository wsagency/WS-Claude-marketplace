import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createReconfigureFilesystemAdapters, ReconfigureError } from "./reconfigure.mjs";

const roots = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function journalState(overrides = {}) {
	return {
		schemaVersion: 3,
		planHash: "test-hash",
		choicesHash: "choices-hash",
		scope: ["repository"],
		domains: ["tracker"],
		phase: "prepare",
		status: "in_progress",
		...overrides,
	};
}

test("filesystem adapters create .wsagency and persist valid journal", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "ws-"));
	roots.push(root);
	const adapters = createReconfigureFilesystemAdapters(root, {
		applyEffect: async () => {},
		verifyEffect: async () => true,
	});

	const state = journalState();
	await adapters.writeJournal("test-hash", state);

	const journalPath = path.join(root, ".wsagency/reconfigure-state.yaml");
	const content = await readFile(journalPath, "utf8");
	assert.ok(content.includes('"hash": "test-hash"'));

	const read = await adapters.readJournal();
	assert.deepEqual(read, { hash: "test-hash", state });
});

test("readJournal gracefully returns null for ENOENT", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "ws-"));
	roots.push(root);
	const adapters = createReconfigureFilesystemAdapters(root, {
		applyEffect: async () => {},
		verifyEffect: async () => true,
	});

	const read = await adapters.readJournal();
	assert.equal(read, null);
});

test("readJournal throws ReconfigureError for malformed content", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "ws-"));
	roots.push(root);
	await mkdir(path.join(root, ".wsagency"));
	await writeFile(path.join(root, ".wsagency/reconfigure-state.yaml"), "{ invalid JSON");

	const adapters = createReconfigureFilesystemAdapters(root, {
		applyEffect: async () => {},
		verifyEffect: async () => true,
	});

	await assert.rejects(adapters.readJournal(), err => errorIs(err, "ERR_MALFORMED_JOURNAL"));
});

test("readJournal throws ReconfigureError for integrity mismatch", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "ws-"));
	roots.push(root);
	await mkdir(path.join(root, ".wsagency"));
	const invalidState = JSON.stringify({
		hash: "test-hash",
		state: journalState({ planHash: "wrong-hash" }),
	});
	await writeFile(path.join(root, ".wsagency/reconfigure-state.yaml"), invalidState);

	const adapters = createReconfigureFilesystemAdapters(root, {
		applyEffect: async () => {},
		verifyEffect: async () => true,
	});

	await assert.rejects(adapters.readJournal(), err => errorIs(err, "ERR_JOURNAL_INTEGRITY"));
});

test("writeJournal rejects mismatched authorization before creating a file", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "ws-"));
	roots.push(root);
	const adapters = createReconfigureFilesystemAdapters(root, {
		applyEffect: async () => {},
		verifyEffect: async () => true,
	});

	await assert.rejects(
		adapters.writeJournal("different-hash", journalState()),
		error => errorIs(error, "ERR_JOURNAL_INTEGRITY"),
	);
	await assert.rejects(readFile(path.join(root, ".wsagency/reconfigure-state.yaml")), { code: "ENOENT" });
});

test("operational adapters cannot override durable journal methods", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "ws-"));
	roots.push(root);
	let overrideCalled = false;
	const adapters = createReconfigureFilesystemAdapters(root, {
		applyEffect: async () => {},
		verifyEffect: async () => true,
		writeJournal: async () => {
			overrideCalled = true;
		},
	});

	await adapters.writeJournal("test-hash", journalState());
	assert.equal(overrideCalled, false);
	assert.equal((await adapters.readJournal()).hash, "test-hash");
});

function errorIs(err, code) {
	return err instanceof ReconfigureError && err.code === code;
}
