---
name: ws-graph-engineering
description: Graph-engineering methodology behind the ws-matt skill set — the node/edge/state contract, dynamic fan-out and fan-in, the file-handoff protocol, and per-harness execution notes (Claude Code, omp, Codex). Use when asked about "graph engineering", an "agent graph" or "skill graph", "fan-out" of workers, or how to "orchestrate subagents" across the ws-matt nodes.
---

# Graph Engineering

The ws-matt plugin treats its vendored skills plus this one as a **graph**: skills are
nodes, their cross-references are edges, and the conversation plus the scratch
directory form the shared state. The model is the runtime — it walks the edges. This
skill is the contract every node follows.

## The node contract

A node (a skill invocation, or a worker agent run) does exactly one thing:

> **Read shared state → do its work → return a state delta.**

- Shared state = the conversation so far, files in the repo, and artifacts under the
  scratch directory.
- A state delta = new artifacts written, decisions recorded, a structured return.
- A node **never mutates** state another node owns — it only adds. If a node needs an
  upstream artifact changed, it routes back to the node that owns it (a goto); it
  does not edit the artifact in place.

## Edge types

| Edge | Form | Meaning |
|---|---|---|
| Deterministic | `then → ws-<node>` | Always taken next. |
| Conditional | `when <condition> → ws-<node>` | Taken only when the condition holds. |
| Dynamic fan-out | `fan-out: for each <item> spawn <agent>` | N workers decided at runtime from state (Send-style) — one worker per item, all in parallel. |

Every vendored skill declares its edges in a trailing `## Graph node` section. Follow
the declared edges; do not invent edges mid-run.

## Fan-in: declared merge rules

When parallel workers return, their deltas merge into shared state by **declared
reducers** — each state key states how concurrent updates combine:

- Default: **overwrite** (last write wins) — fine for keys only one worker touches.
- List keys (e.g. review `findings[]`) declare **append**: every worker's items are
  concatenated, then deduplicated by the synthesizer.
- Never let two workers write the same overwrite-key; partition the work so each
  worker owns disjoint state (one diff slice, one question, one seam).

## Handoff = state update + goto

Passing control is not narration. A handoff is: (1) write your state delta, then
(2) name the next node. Nothing else travels — the next node reads state itself.

## Reference shape: classify → parallel workers → synthesize

The canonical ws-matt workflow:

1. **Classify** — an entry node reads the request and partitions it into independent
   units (diff slices to review, questions to answer, seams to test).
2. **Parallel workers** — dynamic fan-out: one worker agent per unit
   (`ws-matt-reviewer`, `ws-matt-researcher`, `ws-matt-tdd-runner`).
3. **Synthesize** — the orchestrator merges returns per the reducers, reads only the
   artifact paths it needs, and produces the final output.

`ws-code-review` fanning out `ws-matt-reviewer` workers is the archetype;
[[ws-implement]] can optionally fan out `ws-matt-tdd-runner` workers per agreed
seam, using the same shape.

## File-handoff protocol

Workers keep the orchestrator's context small:

- Write any large output (full review write-up, research notes, test transcript) as a
  file in the **scratch directory** — the directory the orchestrator names in the
  worker's prompt (fall back to the harness scratchpad dir, else a `ws-matt/` subdir
  of the system temp dir).
- Return exactly `DONE|{path}` plus a summary of at most a few lines and the
  structured fields the worker's `output` schema declares.
- **Never paste large artifacts into the conversation.** The orchestrator reads the
  paths it needs, when it needs them — most paths are only ever opened by the
  synthesizer.

## Two-tier topology (the edge rule)

The graph has two tiers:

- **Entry nodes** (user-invoked orchestrators): [[ws-ask-matt]] (the router),
  [[ws-implement]], [[ws-to-spec]], [[ws-to-tickets]], [[ws-triage]],
  [[ws-grill-with-docs]], [[ws-improve-codebase-architecture]], [[ws-wayfinder]],
  [[ws-setup-matt-pocock-skills]].
- **Worker nodes** (model-invoked disciplines): ws-tdd, ws-code-review, ws-research,
  ws-prototype, ws-diagnosing-bugs, ws-domain-modeling, ws-codebase-design,
  ws-resolving-merge-conflicts, ws-grilling — plus the three worker agents.

**The rule: an entry node may invoke worker nodes, never another entry node.**
Entry → entry chaining stacks orchestrators, doubles context, and loses the state
contract. When an entry node's output should feed another entry node (e.g.
[[ws-to-spec]] then [[ws-to-tickets]]), it ends its run and tells the user which
entry to invoke next — the handoff travels through state (the spec file), not through
a nested invocation.

## Per-harness execution

**Claude Code** — the model orchestrates by following edges; workers spawn via the
Task tool. Subagents cannot nest: fan-out is one level deep (orchestrator → workers,
never worker → worker). For hot fan-outs, compiling the shape into a dynamic
workflow is a documented option, not shipped in v1 — interpreted execution is the
default.

**omp** — plugin skills, commands, and agents ingest natively, and the harness
carries graph primitives directly (verified against omp docs, 2026-07):

- **Fan-out**: the `task` tool is batched — `{ context, tasks[] }` spawns one
  subagent per item with shared context injected; per-item `agent`, `effort`,
  and `outputSchema` give schema-validated JSON fan-in (exactly this skill's
  Send + reducer semantics). `isolated: true` runs a worker in a cloned
  workspace returning patches — safe parallel edits.
- **Handoff/liveness**: finished agents park and stay addressable — message
  them via the `hub` tool (`send`/`wait`), read outputs at `agent://<id>` and
  transcripts at `history://<id>`; that is the state-passing channel between
  nodes beyond `DONE|{path}`.
- **Magic keywords**: a standalone `orchestrate` in the prompt activates omp's
  multi-agent orchestration contract; `workflowz` builds a deterministic
  multi-subagent workflow over `task` — use them when driving multi-node
  ws-matt runs.
- **/vibe** turns the session into a director of persistent fast/good worker
  tiers — matches this skill's classify → workers → synthesize shape.
- Task agents also support `spawns` chains and `autoloadSkills` (workers
  auto-load their paired discipline skill). Edge discipline is reinforced by
  the installed `omp-edge-discipline` rule — `/ws-matt setup` copies it into
  the project's `.omp/rules/`.

**Codex** — skills follow the Agent Skills SKILL.md standard; the model orchestrates
exactly as in Claude Code, minus Task-based workers (run workers inline, still
honoring the file-handoff protocol).

## Coexistence

In WS projects the ws-matt discipline skills are **authoritative** for TDD
(`ws-tdd`), code review (`ws-code-review`), and research (`ws-research`) flows —
when the superpowers plugin is also installed, route those activities through the
ws-matt nodes. The superpowers process skills (brainstorming, systematic
debugging, and the like) remain complementary for activities the ws-matt graph
does not cover.
