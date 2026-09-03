---
name: ws-domain-modeling
description: Build and sharpen a project's domain model. Use when the user wants to pin down domain terminology or a ubiquitous language, record an architectural decision, or when another skill needs to maintain the domain model.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline — challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `CONTEXT.md` for vocabulary is not this skill — that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## Canonical domain contract

Resolve the installed ws plugin root and request only the `domain` capability
through `skills/ws-project-bootstrap/consumer.mjs#inspectCanonicalCapability`.
Read `domain.layout` from its canonical policy and follow
`dev-docs/agents/domain.md` only as the operational adapter. If blocked, report
the ownership line and exact blocker and stop; detected repository-local
legacy state is named and directed to `/ws-setup`, never read as policy or
replaced with a layout default. Domain work probes no tracker integration.

## File structure

For canonical `domain.layout: single_context`, the repository has one context:

```
/
├── CONTEXT.md
├── dev-docs/
│   └── decisions/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

For canonical `domain.layout: multi_context`, follow the ready domain adapter and `CONTEXT-MAP.md` to the configured contexts:

```
/
├── CONTEXT-MAP.md
├── dev-docs/
│   └── decisions/                    ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── dev-docs/decisions/       ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── dev-docs/decisions/
```

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `dev-docs/decisions/` exists, create it when the first ADR is needed.

## Where decisions live

Choose the narrowest durable decision scope:

1. **Product-level** — concerns more than one repo, or the client. Run project shape detection (see `project-hub-conventions`): hub root or hub sub-repo → the hub's `dev-docs/decisions/`; standalone → this repo's root `dev-docs/decisions/`.
2. **Repo-wide/system-wide** — concerns this repo as a whole, or multiple bounded contexts inside it → this repo's root `dev-docs/decisions/`.
3. **Bounded-context-specific** — when `CONTEXT-MAP.md` maps the context to its own subtree → that context's `dev-docs/decisions/`.

Hub routing and bounded-context routing are orthogonal: a product-level ADR still lands in the hub regardless of the originating context.

The format and numbering of the chosen `dev-docs/decisions/` are in [ADR-FORMAT.md](./ADR-FORMAT.md).

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

## Graph node

- **Tier:** model-invoked (worker)
- **Reads:** canonical `domain.layout` and its operational adapter; `CONTEXT.md` (or `CONTEXT-MAP.md` plus per-context files), the applicable hub-, repo-, and bounded-context `dev-docs/decisions/` directories, the terms used live in the conversation, and the code
- **Emits:** inline `CONTEXT.md` glossary updates the moment a term resolves (glossary only — never implementation details); an ADR only when the decision is hard to reverse, surprising without context, and a real trade-off — routed to the hub, repo root, or bounded context by scope
- **Edges:**
  - then → return to whichever node invoked it (ws-grilling, ws-grill-with-docs, ws-triage, ws-improve-codebase-architecture, ws-codebase-design, ws-wayfinder, ws-implement, ws-to-spec) — this skill never continues anywhere itself
- **Handoff protocol:** updates are written directly to `CONTEXT.md` and the chosen `dev-docs/decisions/` (hub, repo root, or bounded context) as they crystallise and referenced by path — never batched up in conversation (DONE|{CONTEXT.md, <chosen-dev-docs>/decisions/NNNN-*.md}).
- **Exit report:** nested under a driver, return the `CONTEXT.md`/ADR updates as state delta and emit no route; invoked directly, report the landed glossary/ADR updates and stop — no invented driver. (Format: `ws-graph-engineering`.)
