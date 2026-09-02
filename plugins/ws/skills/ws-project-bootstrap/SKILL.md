---
name: ws-project-bootstrap
description: Internal worker for applying a confirmed WS core setup manifest — canonical project config, tracker, triage, domain, context, and runtime-policy artifacts. Use only behind /ws-setup.
---

# WS Project Bootstrap

Apply the confirmed core manifest produced by `/ws-setup`. This is a worker node: it never discovers a second scope, asks a question, changes user choices, invokes an entry node, or writes an effect that is absent from the authorized plan.

## Contract

The caller supplies:

- the standalone repository root and read-only discovery snapshot;
- resolved `recommended_local` choices;
- the complete categorized plan from `transaction.mjs`;
- the plan hash authorized by the user's one final confirmation.

Run the transaction helper from this skill directory:

```text
node transaction.mjs apply --root <repository-root> --machine <runtime-snapshot-json> --profile recommended_local --authorization <confirmed-plan-hash>
```

The helper re-discovers the repository before writing. A changed target set, payload, or fingerprint invalidates authorization and stops before all writes. It applies `CREATE` and `UPDATE` entries in manifest order, reads each result back, verifies it before continuing, derives capability readiness from actual state, and returns the final report. It performs no rollback; a failure leaves only already verified entries for a later missing-only rerun.

## Owned artifacts

The confirmed Local core manifest may create or update only:

- `.wsagency/config.yaml`, using [the packaged v1 JSON Schema](./references/project-config.schema.json) as the syntax contract;
- `dev-docs/tickets/open/` and `dev-docs/tickets/done/`;
- `dev-docs/agents/issue-tracker.md`, `triage-labels.md`, and `domain.md` from this skill's managed templates;
- root `CONTEXT.md` when no authored context exists;
- the marked `## Agent skills` range in canonical `AGENTS.md` and a thin `CLAUDE.md` import.

The configuration contains team policy only. Never write secrets, Jira site or identity data, user names, home paths, detected runtime installation state, or git-origin identity into it. Existing authored bytes outside known managed ranges are preserved; ambiguous or unmanaged collisions are blocking conflicts.

## Return

Return only the state delta: `DONE|<repository-root>/.wsagency/config.yaml`, the verified paths, derived readiness, and the helper's concise final report. When blocked, return `DONE|BLOCKED|<reason>` without an exit route.

**Artifact language.** Every generated artifact and report is English regardless of the conversation language.

## Reconfigure contract

The `reconfigure.mjs` module provides intentional policy-change transactions over a strict-valid canonical v1 configuration.

Contract exports:
- `plan(config, snapshot, machine, choices)`: validates the canonical object, scopes repositories, maps every selected field to an exact change and every unselected field or artifact to `PRESERVE`, surfaces dependency closure, and returns the authorization hash;
- `apply(config, snapshot, machine, choices, planHash, effects, adapters, injection?)`: rejects stale authorization or an active journal, then executes prepare, cutover, and cleanup with fingerprint revalidation and no rollback;
- `resume(config, snapshot, machine, choices, adapters, injection?)`: resumes the confirmed remainder from the secret-free journal;
- `acceptPartial(config, snapshot, machine, choices, adapters)`: records a reviewed valid partial state in the durable audit before removing the transient journal.

## Graph node

- **Tier:** model-invoked worker
- **Reads:** the caller's confirmed core manifest and hash, read-only repository discovery, resolved Local choices, active-runtime capability snapshot, packaged schema and templates
- **Emits:** verified canonical config, Local tracker directories and adapter, triage/domain/context guidance, managed shared-context range, thin Claude import, derived readiness, and an ordered operation record
- **Edges:** then → return the verified state delta to `/ws-setup`
- **Edge rule:** worker returns to its caller; it never invokes an entry node or schedules another worker
- **Handoff protocol:** `DONE|<repository-root>/.wsagency/config.yaml` with verified paths and readiness; `DONE|BLOCKED|<reason>` on conflict or stale authorization
- **Exit report:** nested worker — return only the state delta and render no user-facing route. (Format: `ws-graph-engineering`.)
