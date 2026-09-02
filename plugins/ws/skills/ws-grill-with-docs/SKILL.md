---
name: ws-grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADRs and glossary) as we go.
disable-model-invocation: true
disableModelInvocation: true
---

Run a `/ws-grilling` session, using the `/ws-domain-modeling` skill.

Before changing the domain glossary or routing an ADR, resolve the installed ws
plugin root and request only the `domain` capability through
`skills/ws-project-bootstrap/consumer.mjs#inspectCanonicalCapability`. Read
`domain.layout` from canonical policy and follow its domain adapter. If
blocked, report the ownership line and exact blocker and stop the write;
detected repository-local legacy state is named and directed to `/ws-setup`,
never read as policy or defaulted. The interview itself may continue without
probing any tracker integration.

## Graph node

- **Tier:** user-invoked (entry)
- **Reads:** the loose idea in the conversation; canonical domain policy/adapter; the applicable context glossary and ADRs
- **Emits:** a sharpened plan held in the conversation thread; glossary updates and ADRs written at canonical domain locations as decisions land
- **Edges:**
  - then → ws-grilling (drives the interview, one question at a time)
  - then → ws-domain-modeling (runs beneath every grilling turn, keeping the glossary and ADRs current)
  - when a question needs a runnable answer → ws-prototype (bridge out and back with /handoff in a fresh session)
  - when the idea thread nears the smart zone before the spec exists → /handoff to a file and resume ws-grill-with-docs fresh against it (user-mediated: recommend the /handoff, the user re-invokes ws-grill-with-docs against the file; don't compact or clear mid-flow, and don't push on degraded)
  - when the build is multi-session → ws-to-spec (user-mediated; keep this thread unbroken until the tickets exist)
  - when the build fits one session → ws-implement (user-mediated, same context window)
  - when the questions fan out faster than they resolve / the effort is too foggy for one session → ws-wayfinder (user-mediated: chart a map, don't force a spec over unmade decisions)
- **Edge rule:** entry → worker only, never entry → entry — a continuation that lands on another entry node is a user-mediated handoff (recommend it; never auto-invoke it).
- **Handoff protocol:** decisions land in `CONTEXT.md` and `dev-docs/decisions/` and are referenced by path; the idea thread itself is state — don't compact or clear it mid-flow; if it nears the smart zone before the spec exists, /handoff to a file and resume fresh against it (DONE|{CONTEXT.md, dev-docs/decisions/...}).
- **Exit report:** if the idea thread nears the smart zone before the spec exists → /handoff to a file and resume ws-grill-with-docs fresh against it (user-mediated: recommend the /handoff); otherwise the plan is sharpened — select the single most-likely next entry: ws-to-spec for a multi-session build, ws-implement if it fits this context window; name at most one alternative — when a question still needs a runnable answer (ws-prototype), or when the questions fan out faster than they resolve (ws-wayfinder: chart a map). The user invokes the next entry; never auto-invoke it. (Format: `ws-graph-engineering`.)
