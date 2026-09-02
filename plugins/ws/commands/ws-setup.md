---
allowed-tools: Bash, Read, AskUserQuestion
argument-hint: "[reconfigure]"
description: Configure, migrate, repair, or intentionally reconfigure WS project policy through one verified transaction
---

# WS Setup

`/ws-setup` is the only public WS project-setup entry point. It configures a new repository, migrates every supported pre-5 setup, repairs missing managed state, or recognizes an aligned repository without prompting. `/ws-setup reconfigure` is the only mode that may intentionally change choices in an already valid canonical policy.

The command owns the complete transaction: discovery, unresolved choices, validation, planning, one confirmation, ordered worker dispatch, read-back verification, and reporting. `ws-project-bootstrap` and `ws-docs-bootstrap` are internal workers. They receive one already-confirmed manifest, never ask another question, and return state deltas to this command.

## Invocation

Accept either no argument or exactly `reconfigure`. Reject every other argument without writing.

Resolve the installed plugin root containing this command. Its deterministic contracts are under:

```text
<plugin-root>/skills/ws-project-bootstrap/
  config.mjs
  transaction.mjs
  hub-transaction.mjs
  migration.mjs
  reconfigure.mjs
  trackers.mjs
  sync.mjs
  tracker-ownership.mjs
  routing.mjs
<plugin-root>/skills/ws-docs-bootstrap/
  transaction.mjs
  reconfigure.mjs
```

Marketplace source is authoritative. Do not reproduce schemas, templates, default values, migration tables, readiness rules, or transaction logic in this command.

## Invariants

- Discover, collect choices, validate, and plan without writing or performing an external mutation.
- Read committed policy only from `.wsagency/config.yaml`. Repository-local legacy configuration is migration input, never a runtime fallback. User-global or package settings may prove a machine capability or suggest an explicitly confirmed choice; they never become repository policy implicitly.
- Store no secret, Jira site or identity, token, user name, home path, detected installation state, or origin identity in canonical configuration.
- Classify every local, machine, worker, and external effect as `CREATE`, `UPDATE`, `PRESERVE`, `SKIP`, `NO-OP`, or `BLOCKING_CONFLICT`. Show exact before/after content and a precise diff for every existing managed file or range that changes.
- Ask exactly one final confirmation after the complete cross-worker manifest is stable. The confirmation authorizes only that manifest hash. Re-discover and revalidate fingerprints immediately before the first write in each target; changed scope, payload, or fingerprint invalidates authorization.
- Execute effects in manifest order, read every result back, and stop at the first failure without rollback. Report verified completed work and the exact pending remainder. An ordinary rerun rediscovers actual state and safely applies only missing work.
- An aligned ordinary run asks no questions, obtains no confirmation, invokes no worker, writes nothing, and ends with `No changes required`.

## Ordinary setup

### 1. Discover the complete scope

Resolve the current directory and repository boundary without writing. Detect exactly one shape:

- **standalone** — target the current repository;
- **hub sub-repository** — target only the current repository and name hub-owned product artifacts as untouched;
- **hub root** — inspect the hub plus registered, locally present `type: working` repositories in registry order; display `input`, `output`, and absent working repositories as explicitly excluded;
- **outside Git** — offer to create a repository or stop. Creation requires a syntactically valid, provider-consistent origin before planning; never run `git init` during discovery.

At a hub root, validate `project.yaml`, normalized paths, type/purpose constraints, independent worktrees, origins, dirty overlaps, canonical/legacy state, and planned files/ranges for every selected target before confirmation. Hub policy proposes values only for missing child choices. Materialize each selected child's complete policy; never implement runtime inheritance and never overwrite a valid child choice. Do not clone, initialize, or write into input/output repositories or missing product-output repositories.

Build the active-machine snapshot from capabilities actually delivered by this session: active harness, session discipline, dangerous-git protection, provider CLIs, jira-cli authentication/project access, and documentation publishing dependencies. Missing optional capabilities remove or visibly skip their choices; they do not block unrelated Local, documentation, or engineering work. A selected required capability becomes a specific blocker.

Discover canonical policy, every recognized repository-local pre-5 source, generated engineering adapters, context files, runtime markers, documentation policy, Local tickets and mappings, and applicable machine hints. Discovery is read-only.

### 2. Resolve existing state before defaults

Apply this precedence independently to each field:

1. strict-valid installed-schema canonical value;
2. explicit conflict resolution made in this run;
3. agreeing repository-local legacy values;
4. explicitly confirmed machine hint;
5. new choice;
6. packaged default.

A valid canonical configuration wins and is not reopened by ordinary setup. An older installed schema enters migration. A future schema blocks and directs the user to update WS. Malformed canonical state, unknown legacy fields, ambiguous prose, contradictory values, unsupported custom trackers, conflicting context, and unsafe managed ranges block before every write. Preserve the exact source and explain the resolution required.

Migrate known Jira initializer, tracker adapter, pull-request, triage-label, domain-layout, context, documentation, changelog, dashboard, commit, and runtime semantics through `migration.mjs`. Preserve authored prose, docs, changelog history, decisions, Local tickets, comments, claims, shares, mappings, and open/done state. Repository-local legacy configuration may be a final delete effect only after canonical semantic read-back and all applicable engineering, tracker, Jira, documentation, context, runtime, mapping, and fingerprint readiness gates pass. Never modify user-global state during cleanup.

### 3. Ask only unresolved choices

Collect unresolved choices in dependency order and in as few grouped questions as the harness supports:

1. repository creation and origin, only outside Git;
2. hub targets, only at a hub root (hub alone is the reconfiguration default, but ordinary setup covers the hub and all present working repositories);
3. primary tracker: Local Markdown by default, or GitHub, GitLab, or Jira when the matching repository and machine capabilities are available;
4. Local/Jira all-ticket synchronization, Jira project, board, default issue type, pull-request intake, Jira commit actions, and Jira dashboard only when applicable;
5. semantic triage labels and single- versus multi-context domain routing;
6. optional documentation bootstrap, user/dev tracks, audience, scope, ADR routing, changelog path/cadence/skip types;
7. repository runtime requirements.

Never ask a value settled by valid current state. Never silently select an unavailable integration. Jira authentication and site/identity remain jira-cli-owned. Discovery and planning may verify access but must not create or update a Jira issue.

### 4. Validate and render one manifest

Strict-validate every materialized v1 configuration with `config.mjs`, validate cross-field dependencies, then compose:

1. machine-global prerequisites once;
2. hub core, when applicable;
3. each selected working repository's core in registry order;
4. Local/Jira backfill or tracker-boundary operations with deterministic correlation tokens and durable returned-key persistence;
5. optional documentation bootstrap after all selected core setup is verified;
6. verified legacy cleanup last.

The project worker owns canonical policy, tracker adapter/store, triage, domain, shared context ranges, and runtime-policy artifacts. The docs worker owns missing-only documentation artifacts and returns canonical/context fragments for the orchestrator to compose; it never regenerates authored documents. Shared-file effects appear once in the manifest.

For Local/Jira synchronization, audit all open and done tickets before confirmation. List every unmapped ticket and proposed Jira issue. Persist and verify each returned Jira key before attempting the next create. Pending sync or same-field conflict blocks only the affected tracker operation, not unrelated work.

Show the complete scope, exclusions, categorized effects, exact diffs, external side effects, readiness prerequisites, plan hash, and the explicit statement `No files have changed`. Any blocker ends the run without confirmation.

### 5. Confirm once, apply, and verify

If the plan writes or performs an external mutation, ask exactly:

> Apply every change and external operation in this complete plan?

Offer **Apply plan** and **Cancel**. Cancel leaves all state unchanged. On Apply, pass the confirmed hash and manifest to the internal workers. Re-discover before apply, perform sequential writes with first-failure stop, and never add an unplanned effect.

At a hub root, revalidate each worktree immediately before its first write. A drifted repository and every later repository remain pending. Finish all selected core repositories before the docs sweep. A docs failure cannot hide already verified core readiness.

Derive and report `config`, `engineering`, `tracker`, `documentation`, and `runtime` readiness independently from actual post-write state and current machine capabilities. Include completed, preserved, skipped, no-op, blocked, and pending effects and every verified path or returned remote identity.

## Reconfigure

`/ws-setup reconfigure` requires a strict-valid installed-schema canonical baseline. Missing, malformed, legacy, or older state must complete ordinary setup first; a future schema requires a WS package update.

Select scope before domain. Standalone and hub-sub-repository invocations target only the current repository. A hub root defaults to the hub alone and requires explicit selection for each child. `all` means every domain in the selected repositories, never every repository.

Then select one or more domains—tracker/Jira, documentation/changelog, runtime—and concrete fields. Preserve every unselected field, artifact, and managed range explicitly. Compute and display the smallest valid dependency closure; require the user to accept dependent choices, retain a compatible binding, or cancel rather than silently disabling or defaulting anything.

Use the shared `reconfigure.mjs` journal contract: fingerprint the local, machine, and remote prerequisites; render prepare, cutover, and cleanup phases; obtain the same single manifest confirmation; write a secret-free journal; stop at the first failure without rollback; and allow the confirmed remainder to resume. A reviewed strict-valid partial state may be accepted only when readiness permits. Write the durable audit record before removing the transient journal.

Additional domain rules:

- **Tracker/Jira:** require an explicit preserve-as-history, copy-selected, copy-open, copy-all, or cancel disposition for every existing store. Never delete, close, move, reassign, or strip source work. List semantic loss and source links. Re-fetch remote identity/version/mapped-field hashes before mutation and record returned identities before dependents. Resolve claimed work, pending sync, and same-field conflicts first.
- **Triage/domain:** migrate labels by semantic role, create or validate new labels before cutover, and remove old labels only from affected items after verification. A layout change requires an explicit context/decision routing manifest and collision decisions; never infer bounded-context meaning. Delete a source only when explicitly authorized and after destination/reference verification.
- **Documentation/changelog:** policy-only changes touch only canonical policy and dependent managed references. Enablement invokes the shared missing-only docs bootstrap. Disablement preserves all documents and authored directories. Path or track changes show copy/move intent and collisions and verify destinations and active references before any authorized source cleanup.
- **Runtime:** disabling a repository requirement never removes stronger shared machine protection. Clean up only an exact authorized repository-owned duplicate after replacement verification.

An aligned reconfiguration is prompt-free and writes nothing.

## Completion report

In two or three sentences, state the verified scope and operation (configured, migrated, repaired, reconfigured, resumed, or already aligned), name `.wsagency/config.yaml` and any written or preserved primary artifacts, and report each readiness capability. End an aligned run with `No changes required`; otherwise stop after the verified report because setup is a return-only command.

All generated artifacts and reports are English.
