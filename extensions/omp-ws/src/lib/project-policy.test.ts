import { test } from "bun:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadRepositoryPolicyFromRoot, repositoryPolicyProblem } from "./project-policy";

test("project-policy reconfiguration domain handling", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "ws-test-"));
	try {
		await fs.mkdir(path.join(root, ".wsagency"));
		await fs.writeFile(path.join(root, ".wsagency/config.yaml"), "schema_version: 1\n");

		const state = {
			schemaVersion: 3,
			planHash: "plan-hash",
			choicesHash: "choices-hash",
			scope: ["repository"],
			domains: ["tracker"],
			phase: "prepare",
			status: "in_progress",
		};
		await fs.writeFile(
			path.join(root, ".wsagency/reconfigure-state.yaml"),
			JSON.stringify({ hash: state.planHash, state }),
		);
		const stateTracker = await loadRepositoryPolicyFromRoot(root);
		assert.deepEqual(stateTracker.reconfiguringDomains, ["tracker"]);

		// Block ws_ticket/dashboard (tracker required)
		assert.ok(repositoryPolicyProblem(stateTracker, "ws_ticket", ["tracker"])?.includes("Active reconfiguration"));
		assert.ok(repositoryPolicyProblem(stateTracker, "ws_dashboard", ["tracker"])?.includes("Active reconfiguration"));

		// Does not block changelog/guard (documentation/runtime required)
		assert.equal(repositoryPolicyProblem(stateTracker, "ws_changelog", ["documentation"]), undefined);
		assert.equal(repositoryPolicyProblem(stateTracker, "ws_guard", ["runtime"]), undefined);

		// Malformed journal blocks all
		await fs.writeFile(path.join(root, ".wsagency/reconfigure-state.yaml"), "invalid");
		const stateMalformed = await loadRepositoryPolicyFromRoot(root);
		assert.deepEqual(stateMalformed.reconfiguringDomains, ["all"]);
		assert.ok(repositoryPolicyProblem(stateMalformed, "ws_ticket", ["tracker"])?.includes("Active reconfiguration"));
		assert.ok(repositoryPolicyProblem(stateMalformed, "ws_changelog", ["documentation"])?.includes("Active reconfiguration"));

		assert.ok(repositoryPolicyProblem(stateTracker, "unspecified-helper")?.includes("Active reconfiguration"));

	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
