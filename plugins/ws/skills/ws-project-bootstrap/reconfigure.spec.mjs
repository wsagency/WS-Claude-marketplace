import test from "node:test";
import assert from "node:assert";
import { plan, apply, resume, acceptPartial } from "./reconfigure.mjs";

test("Reconfigure schema validations", (t) => {
    const snapshot = { shape: "standalone", isRepository: true, entries: {} };
    const machine = {};
    const choices = { domain: "runtime", fields: ["sessionDiscipline"] };

    assert.throws(() => plan(null, snapshot, machine, choices), err => err.code === "ERR_MISSING_CONFIG");
    assert.throws(() => plan({ schema: "legacy" }, snapshot, machine, choices), err => err.code === "ERR_LEGACY_CONFIG");
    assert.throws(() => plan({ schema: "standard", version: "0.9.0" }, snapshot, machine, choices), err => err.code === "ERR_OLDER_SCHEMA");
    assert.throws(() => plan({ schema: "standard", version: "2.0.0" }, snapshot, machine, choices), err => err.code === "ERR_FUTURE_SCHEMA");
});

test("Reconfigure scoping", (t) => {
    const config = { schema: "standard", version: "1.0.0" };
    const machine = {};
    const choices = { domain: "runtime", fields: ["sessionDiscipline"] };

    // standalone targets current
    const resStandalone = plan(config, { shape: "standalone", repositoryId: "repo-1" }, machine, choices);
    assert.ok(resStandalone);

    // hub_root requires selection
    assert.throws(() => plan(config, { shape: "hub_root" }, machine, choices), err => err.code === "ERR_MISSING_REPO_SELECTION");
    
    // hub_root with selection passes
    const resHub = plan(config, { shape: "hub_root" }, machine, { ...choices, repositories: ["repo-1"] });
    assert.ok(resHub);
});

test("Field selection and preservation", (t) => {
    const config = { schema: "standard", version: "1.0.0", fieldA: 1, fieldB: 2 };
    const snapshot = { shape: "standalone" };
    const machine = {};
    const choices = { domain: "runtime", fields: ["fieldA"] };

    const result = plan(config, snapshot, machine, choices);
    const effects = result.effects;
    
    const updateEffect = effects.find(e => e.target === "config:fieldA");
    assert.strictEqual(updateEffect.classification, "UPDATE");

    const preserveEffect = effects.find(e => e.target === "config:fieldB");
    assert.strictEqual(preserveEffect.classification, "PRESERVE");
});

test("Dependency closure and cancellation", (t) => {
    const config = { schema: "standard", version: "1.0.0" };
    const snapshot = { shape: "standalone" };
    const machine = {};
    
    // dangerousGitGuard triggers sessionDiscipline dependency
    const choices = { domain: "runtime", fields: ["dangerousGitGuard"] };
    const result = plan(config, snapshot, machine, choices);
    assert.ok(result.dependencyClosure.includes("sessionDiscipline"));
    assert.ok(result.requiresConfirmation);
    
    const choicesCancel = { domain: "runtime", fields: ["dangerousGitGuard"], cancelDependent: true };
    assert.throws(() => plan(config, snapshot, machine, choicesCancel), err => err.code === "ERR_DEPENDENT_CANCELLED");
});

test("Shared protection", (t) => {
    const config = { schema: "standard", version: "1.0.0" };
    const snapshot = { shape: "standalone" };
    
    // disabling dangerousGitGuard when shared
    const choices1 = { domain: "runtime", fields: ["dangerousGitGuard"], values: { dangerousGitGuard: false } };
    const machine1 = { sharedGuardsOwnedBy: ["repoA", "repoB"] };
    const result1 = plan(config, snapshot, machine1, choices1);
    const effect1 = result1.effects.find(e => e.target === "machine:sharedGuard");
    assert.strictEqual(effect1.classification, "PRESERVE");

    // disabling when not shared
    const machine2 = { sharedGuardsOwnedBy: ["repoA"] };
    const result2 = plan(config, snapshot, machine2, choices1);
    const effect2 = result2.effects.find(e => e.target === "machine:sharedGuard");
    assert.strictEqual(effect2.classification, "UPDATE");
});

test("Aligned reconfiguration (no-op)", async (t) => {
    const config = { schema: "standard", version: "1.0.0" };
    const snapshot = { shape: "standalone" };
    const machine = {};
    const choices = { domain: "runtime", fields: [] }; // no fields selected
    
    const result = plan(config, snapshot, machine, choices);
    assert.strictEqual(result.requiresConfirmation, false);
    
    const applyRes = await apply(result.hash, result.effects, {});
    assert.strictEqual(applyRes.phase, "done");
    assert.strictEqual(applyRes.report, "Aligned reconfiguration completed with no changes.");
});

test("Execution, failure without rollback, resume, accept partial", async (t) => {
    const config = { schema: "standard", version: "1.0.0", fieldA: 1 };
    const snapshot = { shape: "standalone" };
    const choices = { domain: "runtime", fields: ["fieldA"] };
    const planRes = plan(config, snapshot, {}, choices);
    
    let journal = null;
    let audit = null;
    let appliedEffects = 0;
    const adapters = {
        writeJournal: async (hash, state) => { journal = { hash, state }; },
        readJournal: async () => journal,
        removeJournal: async () => { journal = null; },
        writeAudit: async (rec) => { audit = rec; },
        applyEffect: async () => { appliedEffects++; }
    };
    
    // Fail at cutover
    const applyRes = await apply(planRes.hash, planRes.effects, adapters, { failAtPhase: "cutover" });
    assert.strictEqual(applyRes.success, false);
    assert.strictEqual(applyRes.phase, "cutover");
    assert.ok(journal); // journal persisted
    assert.strictEqual(journal.state.phase, "cutover");
    
    // Resume to failure again
    const resumeRes1 = await resume(adapters, { failAtPhase: "cleanup" });
    assert.strictEqual(resumeRes1.success, false);
    assert.strictEqual(resumeRes1.phase, "cleanup");
    
    // Accept partial
    const acceptRes = await acceptPartial(adapters);
    assert.strictEqual(acceptRes.success, true);
    assert.ok(audit); // audit written
    assert.strictEqual(audit.acceptedPartial, true);
    assert.strictEqual(journal, null); // journal removed
    
    // Fresh apply successfully
    const applySuccess = await apply(planRes.hash, planRes.effects, adapters);
    assert.strictEqual(applySuccess.success, true);
    assert.strictEqual(applySuccess.phase, "done");
});
