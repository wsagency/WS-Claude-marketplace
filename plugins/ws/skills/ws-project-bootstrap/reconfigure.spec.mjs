import test from "node:test";
import assert from "node:assert";
import { plan, apply, resume, acceptPartial } from "./reconfigure.mjs";

const NOW_FIXTURE = 1693612800000;
const defaultMockAdapters = () => {
    let journal = null;
    let audit = null;
    let appliedEffects = 0;
    const history = [];
    return {
        writeJournal: async (hash, state) => { journal = { hash, state }; history.push("writeJournal"); },
        readJournal: async () => journal,
        removeJournal: async () => { journal = null; history.push("removeJournal"); },
        writeAudit: async (rec) => { audit = rec; history.push("writeAudit"); },
        applyEffect: async () => { appliedEffects++; history.push("applyEffect"); },
        now: () => NOW_FIXTURE,
        getJournal: () => journal,
        getAudit: () => audit,
        getAppliedEffects: () => appliedEffects,
        getHistory: () => history
    };
};

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

    const resStandalone = plan(config, { shape: "standalone", repositoryId: "repo-1" }, machine, choices);
    assert.ok(resStandalone);

    assert.throws(() => plan(config, { shape: "hub_root" }, machine, choices), err => err.code === "ERR_MISSING_REPO_SELECTION");
    
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
    
    const choices1 = { domain: "runtime", fields: ["dangerousGitGuard"], values: { dangerousGitGuard: false } };
    const machine1 = { sharedGuardsOwnedBy: ["repoA", "repoB"] };
    const result1 = plan(config, snapshot, machine1, choices1);
    const effect1 = result1.effects.find(e => e.target === "machine:sharedGuard");
    assert.strictEqual(effect1.classification, "PRESERVE");

    const machine2 = { sharedGuardsOwnedBy: ["repoA"] };
    const result2 = plan(config, snapshot, machine2, choices1);
    const effect2 = result2.effects.find(e => e.target === "machine:sharedGuard");
    assert.strictEqual(effect2.classification, "UPDATE");
});

test("Aligned reconfiguration (no-op)", async (t) => {
    const config = { schema: "standard", version: "1.0.0" };
    const snapshot = { shape: "standalone", repositoryId: "repo-noop" };
    const machine = {};
    const choices = { domain: "runtime", fields: [] }; 
    
    const result = plan(config, snapshot, machine, choices);
    assert.strictEqual(result.requiresConfirmation, false);
    
    const applyRes = await apply(config, snapshot, machine, choices, result.hash, result.effects, defaultMockAdapters());
    assert.strictEqual(applyRes.phase, "done");
    assert.strictEqual(applyRes.ownershipReport["repo-noop"], "aligned");
});

test("Drift injection and prepare phase interruption", async (t) => {
    const config = { schema: "standard", version: "1.0.0", fieldA: 1 };
    const snapshot = { shape: "standalone", entries: { "config:fieldA": { fingerprint: "hash123" } } };
    const machine = {};
    const choices = { domain: "runtime", fields: ["fieldA"] };
    const planRes = plan(config, snapshot, machine, choices);
    const adapters = defaultMockAdapters();
    
    const applyRes = await apply(config, snapshot, machine, choices, planRes.hash, planRes.effects, adapters, { 
        driftEntries: { "config:fieldA": "hash456" }
    });
    
    assert.strictEqual(applyRes.success, false);
    assert.strictEqual(applyRes.phase, "prepare");
    assert.ok(applyRes.report.includes("Drift detected"));
    assert.strictEqual(adapters.getAppliedEffects(), 0);
});

test("Cutover execution, failure without rollback, resume, accept partial, audit ordering, and ownership report", async (t) => {
    const config = { schema: "standard", version: "1.0.0", fieldA: 1, fieldB: 2 };
    const snapshot = { shape: "standalone", repositoryId: "repo-1", entries: {} };
    const machine = {};
    const choices = { domain: "runtime", fields: ["fieldA", "fieldB"] };
    
    const planRes = plan(config, snapshot, machine, choices);
    const adapters = defaultMockAdapters();
    
    const applyRes = await apply(config, snapshot, machine, choices, planRes.hash, planRes.effects, adapters, { failAtEffectIndex: 1 });
    
    assert.strictEqual(applyRes.success, false);
    assert.strictEqual(applyRes.phase, "cutover");
    assert.strictEqual(adapters.getAppliedEffects(), 1); 
    
    const journal = adapters.getJournal();
    assert.ok(journal);
    assert.strictEqual(journal.state.completedEffects, 1);
    
    assert.ok(!journal.state.effects.some(e => e.diff !== "redacted" && e.diff !== "unchanged" && e.diff !== "removed"));
    
    const resumeRes = await resume(config, snapshot, machine, choices, adapters, { failAtPhase: "cleanup" });
    assert.strictEqual(resumeRes.success, false);
    assert.strictEqual(resumeRes.phase, "cleanup");
    assert.strictEqual(adapters.getAppliedEffects(), 2); 
    
    const acceptRes = await acceptPartial(config, snapshot, machine, choices, adapters);
    assert.strictEqual(acceptRes.success, true);
    
    const audit = adapters.getAudit();
    assert.ok(audit);
    assert.strictEqual(audit.acceptedPartial, true);
    assert.strictEqual(audit.timestamp, NOW_FIXTURE); 
    
    const history = adapters.getHistory();
    const auditIdx = history.indexOf("writeAudit");
    const removeIdx = history.indexOf("removeJournal");
    assert.ok(auditIdx !== -1 && removeIdx !== -1);
    assert.ok(auditIdx < removeIdx, "Audit must be written before journal is removed");
    
    assert.strictEqual(adapters.getJournal(), null); 
    assert.strictEqual(acceptRes.ownershipReport["repo-1"], "partial");
});

test("acceptPartial eligibility check", async (t) => {
    const config = { schema: "standard", version: "1.0.0", fieldA: 1 };
    const snapshot = { shape: "standalone", entries: {} };
    const machine = {};
    const choices = { domain: "runtime", fields: ["fieldA"] };
    const adapters = defaultMockAdapters();
    const planRes = plan(config, snapshot, machine, choices);
    
    await apply(config, snapshot, machine, choices, planRes.hash, planRes.effects, adapters, { failAtPhase: "prepare" });
    
    await assert.rejects(
        () => acceptPartial(config, snapshot, machine, choices, adapters), 
        err => err.code === "ERR_NOT_ELIGIBLE_PARTIAL"
    );
});

test("Fully successful cutover execution", async (t) => {
    const config = { schema: "standard", version: "1.0.0", fieldA: 1, fieldB: 2 };
    const snapshot = { shape: "standalone", repositoryId: "repo-happy", entries: {} };
    const machine = {};
    const choices = { domain: "runtime", fields: ["fieldA", "fieldB"] };
    
    const planRes = plan(config, snapshot, machine, choices);
    const adapters = defaultMockAdapters();
    
    const applyRes = await apply(config, snapshot, machine, choices, planRes.hash, planRes.effects, adapters);
    
    assert.strictEqual(applyRes.success, true);
    assert.strictEqual(applyRes.phase, "done");
    assert.strictEqual(adapters.getAppliedEffects(), 2); 
    
    // Audit must be written
    const audit = adapters.getAudit();
    assert.ok(audit);
    assert.strictEqual(audit.completed, 2);
    assert.strictEqual(audit.timestamp, NOW_FIXTURE); 
    
    // Journal must be removed
    assert.strictEqual(adapters.getJournal(), null); 
    
    // Ownership report must be "owned"
    assert.strictEqual(applyRes.ownershipReport["repo-happy"], "owned");
});
