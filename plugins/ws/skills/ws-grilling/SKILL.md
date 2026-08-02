---
name: ws-grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview me relentlessly about every aspect of this until we reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a *fact* can be found by exploring the environment (filesystem, tools, etc.), look it up rather than asking me. The *decisions*, though, are mine — put each one to me and wait for my answer.

Do not act on it until I confirm we have reached a shared understanding.

## Graph node

- **Tier:** model-invoked (worker)
- **Reads:** the plan, decision, or idea under discussion; environment facts it can look up itself
- **Emits:** resolved decisions recorded one at a time; a shared-understanding confirmation before any action
- **Edges:**
  - then → ws-domain-modeling (runs alongside every grilling session, keeping glossary/ADRs current)
  - invoked by: ws-grill-with-docs, ws-triage (step 4), ws-improve-codebase-architecture (grilling loop), ws-wayfinder (HITL grilling tickets)
- **Handoff protocol:** decisions land in the project docs (CONTEXT.md/ADRs) as they are made; no large artifacts — the conversation is the work.
- **Exit report:** nested under a driver, return the resolved decisions (captured in `CONTEXT.md`/ADRs) as state delta and emit no route; invoked directly, report the grilling verdict and stop — no invented driver. (Format: `ws-graph-engineering`.)

> Vendored from upstream `skills/productivity/grilling` as a runtime dependency of the engineering set (see `plugins/ws/UPSTREAM.md`).
