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
