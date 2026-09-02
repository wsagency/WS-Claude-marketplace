import test from "node:test";
import assert from "node:assert";
import { plan, apply, resume, acceptPartial } from "./reconfigure.mjs";

const config = {
    schema_version: 1,
    runtime: { session_discipline: "required", dangerous_git_guard: "enabled" },
};
const machine = {};

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
        now: () => 1693612800000,
        getJournal: () => journal,
        getAudit: () => audit,
        getAppliedEffects: () => appliedEffects,
        getHistory: () => history
    };
};

test("Triage semantic relabeling with phased cutover and cleanup", async (t) => {
    const snapshot = {
        shape: "standalone",
        repositoryId: "repo-1",
        entries: {
            "remote:ticket:101": { kind: "file", content: '{"labels":["bug"]}', fingerprint: "f1" }
        }
    };
    const choices = {
        domain: "tracker",
        fields: [],
        triageMappings: { "bug": { role: "defect", newLabel: "type/defect" } }
    };
    
    const planRes = plan(config, snapshot, machine, choices);
    assert.strictEqual(planRes.requiresConfirmation, true);
    
    const adapters = defaultMockAdapters();
    const applyRes = await apply(config, snapshot, machine, choices, planRes.hash, planRes.effects, adapters);
    
    assert.strictEqual(applyRes.success, true);
    assert.strictEqual(applyRes.phase, "done");
    
    // 1 for create label, 1 for update ticket, 1 for cleanup old label
    // Wait, the planTriage outputs:
    // Create (order 5)
    // Update (order 20)
    // Cleanup (order 35)
    // plus unselected fields PRESERVE, which are order 5 but don't count towards actionable.
    assert.strictEqual(adapters.getAppliedEffects(), 3);
});

test("Triage claimed-work blocking", (t) => {
    const snapshot = {
        shape: "standalone",
        entries: {
            "remote:ticket:102": { kind: "file", content: '{"labels":["bug"], "claimed": true}', fingerprint: "f2" }
        }
    };
    const choices = {
        domain: "tracker",
        fields: [],
        triageMappings: { "bug": { role: "defect", newLabel: "type/defect" } }
    };
    
    assert.throws(() => plan(config, snapshot, machine, choices), err => err.code === "ERR_BLOCKING_CONFLICT");
});

test("Domain layout explicit routing and source deletion", async (t) => {
    const snapshot = {
        shape: "standalone",
        entries: {
            "domain:source:auth": { kind: "file", fingerprint: "f3" }
        }
    };
    const choices = {
        domain: "engineering",
        fields: [],
        contextMap: { "auth": "identity" },
        authorizeSourceDelete: true
    };
    
    const planRes = plan(config, snapshot, machine, choices);
    assert.strictEqual(planRes.requiresConfirmation, true);
    
    const adapters = defaultMockAdapters();
    const applyRes = await apply(config, snapshot, machine, choices, planRes.hash, planRes.effects, adapters);
    
    assert.strictEqual(applyRes.success, true);
    assert.strictEqual(adapters.getAppliedEffects(), 2); // 1 create dest, 1 cleanup source
});

test("Domain layout collision handling", (t) => {
    const snapshot = {
        shape: "standalone",
        entries: {
            "domain:source:auth": { kind: "file", fingerprint: "f3" },
            "domain:destination:identity": { kind: "file", fingerprint: "f4" } // Collision!
        }
    };
    const choices = {
        domain: "engineering",
        fields: [],
        contextMap: { "auth": "identity" }
    };
    
    assert.throws(() => plan(config, snapshot, machine, choices), err => err.code === "ERR_BLOCKING_CONFLICT");
});

test("Domain layout aligned no-op", async (t) => {
    const snapshot = {
        shape: "standalone",
        entries: {} // No sources to move
    };
    const choices = {
        domain: "engineering",
        fields: [],
        contextMap: { "auth": "identity" }
    };
    
    const planRes = plan(config, snapshot, machine, choices);
    assert.strictEqual(planRes.requiresConfirmation, false);
});

test("Interrupted cutover and safe resume with domain routing", async (t) => {
    const snapshot = {
        shape: "standalone",
        entries: {
            "domain:source:auth": { kind: "file", fingerprint: "f3" }
        }
    };
    const choices = {
        domain: "engineering",
        fields: [],
        contextMap: { "auth": "identity" },
        authorizeSourceDelete: true
    };
    
    const planRes = plan(config, snapshot, machine, choices);
    const adapters = defaultMockAdapters();
    
    // Fail at cutover execution index 0 (which is the create effect)
    const applyRes = await apply(config, snapshot, machine, choices, planRes.hash, planRes.effects, adapters, { failAtEffectIndex: 0 });
    
    assert.strictEqual(applyRes.success, false);
    assert.strictEqual(applyRes.phase, "cutover");
    assert.strictEqual(adapters.getAppliedEffects(), 0); 
    
    // Resume without failure injection
    const resumeRes = await resume(config, snapshot, machine, choices, adapters);
    assert.strictEqual(resumeRes.success, true);
    assert.strictEqual(resumeRes.phase, "done");
    assert.strictEqual(adapters.getAppliedEffects(), 2); 
});

test("Remote drift during prepare phase", async (t) => {
    const snapshot = {
        shape: "standalone",
        entries: {
            "remote:ticket:101": { kind: "file", content: '{"labels":["bug"]}', fingerprint: "f1" }
        }
    };
    const choices = {
        domain: "tracker",
        fields: [],
        triageMappings: { "bug": { role: "defect", newLabel: "type/defect" } }
    };
    const planRes = plan(config, snapshot, machine, choices);
    const adapters = defaultMockAdapters();
    
    const applyRes = await apply(config, snapshot, machine, choices, planRes.hash, planRes.effects, adapters, { 
        driftEntries: { "remote:ticket:101": "hash456" } // Drift injection
    });
    
    assert.strictEqual(applyRes.success, false);
    assert.strictEqual(applyRes.phase, "prepare");
    assert.ok(applyRes.report.includes("Drift detected"));
});
