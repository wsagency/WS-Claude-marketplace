---
name: ws-project-bootstrap
description: Internal worker for applying a confirmed WS setup manifest covering canonical policy, engineering artifacts, trackers, migration, hubs, and safe reconfiguration. Use only behind /ws-setup.
---

# WS Project Bootstrap

Apply only the project-owned effects in the complete manifest confirmed by `/ws-setup`. This is an internal worker node: it never discovers a second scope, asks a question, changes a choice, invokes an entry node, or adds an effect that is absent from the authorized plan.

## Inputs

The caller supplies:

- the resolved standalone, hub-root, or hub-sub-repository scope and read-only discovery snapshot;
- strict validated, fully materialized v1 policy for every selected repository;
- the complete categorized cross-worker manifest;
- current machine capability results and fake or real external adapters selected by the caller;
- the exact manifest hash authorized by the user's single final confirmation;
- optional deterministic failure/drift injection only in tests.

Repository policy is defined solely by `.wsagency/config.yaml` and [the packaged v1 JSON Schema](./references/project-config.schema.json). Never copy secrets, Jira site or identity data, tokens, user names, home paths, detected runtime installations, or Git-origin identity into it.

## Deterministic contracts

Use the modules in this directory rather than reproducing policy:

- `config.mjs` — strict parse, validation, serialization, and independent readiness derivation;
- `transaction.mjs` — core discovery, ordered manifest, fingerprint authorization, apply, read-back, and no-op behavior;
- `hub-transaction.mjs` — hub registry preflight, materialized child policy, sequential repository boundary, and recovery outcomes;
- `migration.mjs`, `migration-engineering.mjs`, `migration-docs-runtime.mjs`, and `migration-jira.mjs` — precedence-aware, lossless pre-5 conversion and read-back-gated repository-local cleanup;
- `trackers.mjs` — Local, GitHub, GitLab, Jira, and Local/Jira adapter/readiness planning;
- `sync.mjs` and `backfill-jira.mjs` — all-ticket Local/Jira synchronization, deterministic correlation, durable mapping persistence, conflict handling, and safe retry;
- `reconfigure.mjs`, `tracker-ownership.mjs`, and `routing.mjs` — minimal policy changes, explicit ownership/data disposition, semantic triage/domain routing, journaling, resume, and partial acceptance.

The public command composes this worker's effects with the docs worker before confirmation. Treat its authorized subset as immutable.

## Apply contract

Before writing:

1. resolve the supplied root without following an unplanned path or symlink;
2. re-discover repository identity, Git HEAD/status, every selected target, managed range, machine prerequisite, and required remote fingerprint;
3. rebuild the worker subset and reject authorization if the target set, payload, dependency closure, or fingerprint differs;
4. reject all unresolved `BLOCKING_CONFLICT` effects before the first write.

Then execute `CREATE` and `UPDATE` effects in manifest order. Read each result back and verify exact bytes or external identity before continuing. Stop at the first failure without rollback and return exact completed and pending effects. A later ordinary setup run rediscovers actual state and applies only missing effects.

At a hub root, run machine-global prerequisites once, then the hub and each selected locally present `type: working` repository sequentially in registry order. Revalidate a repository immediately before its first write. A failure leaves that repository's unverified effects and every later repository pending. Never touch registered input/output repositories, absent worktrees, unselected children, or hub-owned product artifacts during a sub-repository invocation. Hub values fill only missing initial child choices and are materialized; they are never runtime inheritance.

Apply core setup before optional documentation bootstrap. Shared context-file effects are composed once by the public orchestrator: canonical `AGENTS.md` owns the managed instructions and `CLAUDE.md` remains a thin `@AGENTS.md` import. Preserve authored bytes outside exact known ranges. Fat/conflicting contexts, unknown generated variants, malformed legacy content, unsupported custom trackers, and dirty overlap on planned ranges block rather than merge heuristically.

## Tracker and migration rules

Write the operational adapter selected by canonical tracker/Jira policy. Local is the new-repository default; GitHub/GitLab require matching origins and provider capabilities; Jira requires a valid canonical binding and current jira-cli capability; Local/Jira uses Local as owner plus `jira.sync: all_local_tickets`. An unavailable selected integration blocks tracker readiness only, not unrelated capabilities.

For Local/Jira backfill, audit every existing open and done ticket before confirmation. Each external create uses a deterministic correlation token, then persists and verifies the returned Jira key locally before another create. Preserve tickets, comments, claims, shares, mappings, and history. An outage leaves durable pending intent; a retry must not create a duplicate.

Migration applies canonical values first, explicit resolutions second, agreeing repository-local values third, explicitly confirmed machine hints fourth, new choices fifth, and packaged defaults last. Preserve customized operational prose and authored state. Delete an exact repository-local legacy source only as a final authorized effect after canonical semantic read-back and every applicable engineering, context, runtime, docs, Jira, mapping, and fingerprint readiness gate succeeds. Never modify a user-global source.

## Reconfigure contract

Reconfiguration requires a strict-valid current v1 policy. Scope repository, domain, and concrete fields explicitly and preserve everything unselected. Show dependency closure. The shared secret-free journal records prepare, cutover, and cleanup effects plus local, machine, and remote fingerprints. Stop at first failure without rollback; resume only the confirmed remainder. A reviewed strict-valid partial state may be accepted only when its readiness gates pass, and the durable audit record must exist before deleting the transient journal.

Tracker ownership changes require an explicit disposition for every source store. Never automatically delete, close, move, reassign, or strip source work. Preserve source links, list semantic loss, use deterministic correlation tokens, re-fetch remote version/update/mapped-field hashes immediately before mutation, and record returned identities before dependents. Claimed work, pending synchronization, and unresolved same-field conflicts block only the affected migration.

Triage changes map semantic roles and prepare/verify new labels before switching. Domain-layout changes require explicit context and decision routing with collision resolution; never infer bounded-context meaning. Runtime disablement never weakens shared machine protection and cleans only an exact authorized repository-owned duplicate.

## Owned effects

This worker may own only effects already present in its authorized manifest for:

- `.wsagency/config.yaml`;
- tracker stores and generated tracker operational adapter;
- semantic triage and domain routing guidance;
- managed shared-context ranges and thin Claude import;
- repository-owned runtime policy artifacts;
- Local/Jira mapping and backfill state;
- the shared reconfiguration journal and durable audit;
- exact verified repository-local legacy cleanup.

Documentation-specific artifacts remain owned by `ws-docs-bootstrap`.

## Return

Return only a state delta:

```text
DONE|<repository-root>/.wsagency/config.yaml
```

Include verified paths, remote identities, completed/preserved/skipped/no-op/pending effects, and independent `config`, `engineering`, `tracker`, and `runtime` readiness. On a conflict or stale authorization return `DONE|BLOCKED|<exact reason>`. Render no user-facing route.

Every generated artifact and report is English.

## Graph node

- **Tier:** model-invoked worker
- **Reads:** confirmed project-owned manifest subset and hash, read-only repository/hub discovery, materialized canonical policy, active-machine capability snapshot, packaged schema/templates, and supplied external adapters
- **Emits:** verified canonical policy, engineering/tracker/runtime state, migration or reconfiguration state, exact operation outcomes, and capability readiness
- **Edges:** then → return the verified state delta to `/ws-setup`
- **Edge rule:** return to the caller; never invoke an entry node or schedule another worker
- **Handoff protocol:** `DONE|<repository-root>/.wsagency/config.yaml`; `DONE|BLOCKED|<reason>` on conflict or stale authorization
- **Exit report:** nested worker — return only the state delta and render no user-facing route. (Format: `ws-graph-engineering`.)
