---
name: ws-grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADRs and glossary) as we go.
disable-model-invocation: true
disableModelInvocation: true
---

Run a `/ws-grilling` session, using the `/ws-domain-modeling` skill.

## Graph node

- **Tier:** user-invoked (entry)
- **Reads:** the loose idea in the conversation; `CONTEXT.md`; ADRs in the area being discussed
- **Emits:** a sharpened plan held in the conversation thread; `CONTEXT.md` glossary updates and ADRs written inline as decisions land (the paper trail)
- **Edges:**
  - then → ws-grilling (drives the interview, one question at a time)
  - then → ws-domain-modeling (runs beneath every grilling turn, keeping the glossary and ADRs current)
  - when a question needs a runnable answer → ws-prototype (bridge out and back with /handoff in a fresh session)
  - when the build is multi-session → ws-to-spec (user-mediated; keep this thread unbroken until the tickets exist)
  - when the build fits one session → ws-implement (user-mediated, same context window)
- **Edge rule:** entry → worker only, never entry → entry — a continuation that lands on another entry node is a user-mediated handoff (recommend it; never auto-invoke it).
- **Handoff protocol:** decisions land in `CONTEXT.md` and `dev-docs/decisions/` and are referenced by path; the idea thread itself is state — don't compact or clear it mid-flow (DONE|{CONTEXT.md, dev-docs/decisions/...}).
- **Exit report:** the plan is sharpened and the build spans sessions → `/ws-to-spec`; it fits one session → `/ws-implement`; a question still needs a runnable answer → `/ws-prototype`. (Format: `ws-graph-engineering`.)
