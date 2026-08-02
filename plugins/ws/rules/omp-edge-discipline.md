---
description: Edge discipline for the ws-matt skill graph — two-tier topology, state-delta workers, file handoffs, small orchestrator context
alwaysApply: true
---

# ws-matt edge discipline

When executing any ws-matt graph node (ws-ask-matt, ws-implement, ws-to-spec,
ws-to-tickets, ws-triage, ws-grill-with-docs, ws-improve-codebase-architecture,
ws-wayfinder, ws-setup-matt-pocock-skills) or spawning the worker agents
(`reviewer`, `researcher`, `tdd-runner`):

- **Never chain entry → entry.** An entry (user-invoked) node may invoke worker
  (model-invoked) nodes and worker agents only. When an entry node's output should
  feed another entry node, end the run and tell the user which entry to invoke next
  — the handoff travels through state (files), never through a nested invocation.
- **Exit report — the shape of that telling.** Only a directly invoked node renders
  one. A nested worker (invoked under another node) returns only a state delta to its
  caller — no user-facing report. A node invoked directly tells the user, in two or
  three sentences, what landed and where it went, then at runtime one most likely
  declared route plus at most one alternative — each a concrete entry point from the
  node's own declared edges, named the way each is actually invoked: a command
  slash-prefixed (`/ws-<command>`), a skill bare (`ws-skill-name`). Never a bullet dump,
  never "let me know how you'd like to proceed". A return-only node reports the outcome
  and stops — it does not invent a next entry or a driver. This is the entry → entry
  handoff above, made concrete: it recommends the next entry; it never auto-invokes it
  (ADR 0008). Per-node routing lives in each skill's `## Graph node` section; the format
  is stated once in `ws-graph-engineering`.
- **Workers return state deltas.** A worker reads shared state and returns only what
  it adds (findings, sources, cycle result). It never mutates artifacts owned by
  other nodes. Worker AGENTS are leaves — they never spawn further workers; worker
  skills may fan out agents.
- **File-handoff protocol.** Workers write large outputs to the scratch directory
  named in their prompt and return `DONE|{path}` plus a summary of at most a few
  lines. Never paste large artifacts into the conversation.
- **Keep the orchestrator context small.** Read returned paths only when synthesis
  needs them; partition work into disjoint slices so parallel returns merge cleanly
  (list keys append, disjoint keys overwrite).
- **Durable outcomes are recorded in authored docs (dev-docs).** A session that
  changed decisions or architecture without recording them (ADR in
  `dev-docs/decisions/`, `CONTEXT.md`) is incomplete.
