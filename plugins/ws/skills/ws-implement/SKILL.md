---
name: ws-implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
disableModelInvocation: true
---

Implement the work described by the user in the spec or tickets.

Use /ws-tdd where possible, at pre-agreed seams.

When red-green cycles are independent and own disjoint files, you may fan out one `tdd-runner` worker per cycle in parallel, then synthesize the results (the classify → parallel workers → synthesize shape from ws-graph-engineering). Each worker owns exactly one cycle, so re-evaluate the remaining acceptance criteria after every wave and dispatch further waves until every seam is complete. Keep cycles sequential when one depends on another's output or would touch the same files. Fan-out is optional: driving the seams yourself through `/ws-tdd` one cycle at a time is always correct.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /ws-code-review to review the work.

If an implementation decision crystallises mid-build that the spec didn't cover — hard to reverse, surprising without context, a real trade-off — record it via the `/ws-domain-modeling` skill before committing; it chooses the hub, repo-root, or bounded-context `dev-docs/decisions/` by scope.

Commit your work to the current branch. Commits follow the WS conventions — Conventional Commits with the ticket reference (`/ws-commit` when available). When the branch is complete, the PR flow is `/ws-commit pr`, which also handles the CHANGELOG entry and the Jira transition when the project is bound — do NOT hand-write changelog entries in this skill; the PR-time entry is canonical.

## Graph node

- **Tier:** user-invoked (entry)
- **Reads:** the spec or ticket being built (tracker issue or `dev-docs/tickets/open/` file), the pre-agreed test seams, `CONTEXT.md`, ADRs
- **Emits:** the working implementation committed to the current branch; typecheck and full test suite green; review findings addressed before the commit
- **Edges:**
  - then → ws-tdd at the pre-agreed seams (worker: one red-green vertical slice at a time)
  - fan-out: spawn one `tdd-runner` per independent, disjoint-file red-green cycle, synthesize after each wave, and repeat until every seam's acceptance criteria are complete — run dependent or overlapping cycles sequentially via the ws-tdd edge above
  - then → ws-code-review before committing (worker: two-axis Standards + Spec review of the diff)
  - when a decision the spec didn't cover crystallises → ws-domain-modeling (ADR routed to hub, repo root, or bounded context by scope)
  - then → /ws-commit pr at branch completion (WS command: Conventional Commit + ticket reference, CHANGELOG entry, push, PR, Jira transition when bound)
- **Edge rule:** entry → worker only, never entry → entry — a continuation that lands on another entry node is a user-mediated handoff (recommend it; never auto-invoke it).
- **Handoff protocol:** the work lands as commits on the current branch; close out on the driving ticket and reference it by id (DONE|{branch@commit}).
- **Exit report:** implementation green (internal TDD + review clean) → `/ws-commit pr`; a mid-build decision the spec didn't cover → `ws-domain-modeling`. (Format: `ws-graph-engineering`.)
