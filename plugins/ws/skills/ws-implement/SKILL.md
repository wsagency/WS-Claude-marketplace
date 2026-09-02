---
name: ws-implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
disableModelInvocation: true
---

Implement the work described by the user in the spec or tickets.

For a tracked ticket, resolve the installed ws plugin root and request only the
`tracker` capability through
`skills/ws-project-bootstrap/consumer.mjs#inspectCanonicalCapability`. Read
tracker and Jira choices from its validated canonical config, then follow the
returned operational adapter. If blocked, report the ownership line and exact
blocker and stop the tracker operation; detected repository-local legacy state
must be named and directed to `/ws-setup`, never read as a fallback. A direct
spec/path implementation does not probe tracker integrations.

At tracked-ticket close-out, use the same capability again. When Local is
primary with `all_local_tickets` Jira sync, perform the status/move operation
through `runCanonicalSynchronizedTrackerOperation`, persist returned mappings
and pending work, and stop before overwrite on a same-field conflict. A Jira
outage records pending sync but does not block the completed Local move. Never
sync claims, session shares, map pointers, or agent state.

Use /ws-tdd where possible, at pre-agreed seams.

When two or more red-green cycles are independent and own disjoint files, fan out one `tdd-runner` per cycle — this is the default, not an option. Each item must name the seam and acceptance criterion its cycle owns: the worker treats the named seam as already confirmed and never asks the user, so a wave dispatched without per-item seams bounces back un-tested. Waves repeat: each worker owns exactly one cycle, so synthesize after every wave, re-evaluate the remaining acceptance criteria, and dispatch the next wave until every seam is complete (the classify → parallel workers → synthesize shape from ws-graph-engineering). Cycles that depend on each other or touch the same files stay sequential via `/ws-tdd`. Skip the fan-out when it would be wasteful — a single cycle, cycles too small to pay for a worker, or seams still entangled — and drive them yourself one at a time.

omp: one batched `task` call — `{ context, tasks: [...] }`, shared context in `context`, one item per cycle carrying `agent: tdd-runner`, the seam and acceptance criterion it owns, and, when the active schema exposes it, `effort: med`. Claude Code: one Task call per cycle, all issued in a single message.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

If an implementation decision crystallises mid-build that the spec didn't cover — hard to reverse, surprising without context, a real trade-off — record it via the `/ws-domain-modeling` skill before committing; it chooses the hub, repo-root, or bounded-context `dev-docs/decisions/` by scope.

Commit your work to the current branch first. Commits follow the WS conventions — Conventional Commits with the ticket reference (`/ws-commit` when available).

Then review it: use `/ws-code-review` with the branch's merge-base against `main` as the fixed point, and address the findings in a follow-up commit before `/ws-commit pr`. When the branch is complete, the PR flow is `/ws-commit pr`, which also handles the CHANGELOG entry and the Jira transition when the project is bound — do NOT hand-write changelog entries in this skill; the PR-time entry is canonical.

**Artifact language.** Everything this node writes — code comments, commit messages, and any cycle transcript a `tdd-runner` files — is English, whatever language the conversation is in. Source code identifiers follow the project's existing conventions.

## Graph node

- **Tier:** user-invoked (entry)
- **Reads:** the spec or ticket being built (through the named canonical tracker capability, or directly from a passed path), the pre-agreed test seams, `CONTEXT.md`, and ADRs
- **Emits:** the working implementation committed to the current branch; typecheck and full test suite green; review findings addressed in a follow-up commit before `/ws-commit pr`
- **Edges:**
  - then → ws-tdd at the pre-agreed seams (worker: one red-green vertical slice at a time)
  - fan-out (default): one `tdd-runner` per independent, disjoint-file red-green cycle, synthesize after each wave, and repeat until every seam's acceptance criteria are complete — run dependent or overlapping cycles sequentially via the ws-tdd edge above; skip the fan-out when it would be wasteful (a single cycle, cycles too small to pay for a worker, entangled seams)
  - then → ws-code-review after the first commit (worker: two-axis Standards + Spec review of the diff, fixed point = the branch's merge-base against `main`; address findings before `/ws-commit pr`)
  - when a decision the spec didn't cover crystallises → ws-domain-modeling (ADR routed to hub, repo root, or bounded context by scope)
  - then → /ws-commit pr at branch completion (WS command: Conventional Commit + ticket reference, CHANGELOG entry, push, PR, Jira transition when bound)
- **Edge rule:** entry → worker only, never entry → entry — a continuation that lands on another entry node is a user-mediated handoff (recommend it; never auto-invoke it).
- **Handoff protocol:** the work lands as commits on the current branch; close a tracked ticket through its canonical operational adapter — Local moves `dev-docs/tickets/open/<slug>.md` to `done/` once the result is coded and durable knowledge has landed, with configured Local/Jira synchronization at the operation boundary — and reference it by id (DONE|{branch@commit}).
- **Exit report:** implementation green (internal TDD + review clean) → `/ws-commit pr`; a mid-build decision the spec didn't cover → `ws-domain-modeling`. (Format: `ws-graph-engineering`.)
