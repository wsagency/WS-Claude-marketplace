---
name: ws-graph-engineering
description: Graph-engineering methodology behind the ws-matt skill set — the node/edge/state contract, dynamic fan-out and fan-in, the file-handoff protocol, and per-harness execution notes (Claude Code, omp, Codex). Use when asked about "graph engineering", an "agent graph" or "skill graph", "fan-out" of workers, or how to "orchestrate subagents" across the ws-matt nodes.
---

# Graph Engineering

The ws plugin treats its ws-matt vendored skills plus this one as a **graph**: skills are
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
   (`reviewer`, `researcher`, `tdd-runner`).
3. **Synthesize** — the orchestrator merges returns per the reducers, reads only the
   artifact paths it needs, and produces the final output.

`ws-code-review` fanning out `reviewer` workers is the archetype;
[[ws-implement]] uses the same shape by default for two or more independent,
disjoint-file `tdd-runner` cycles, skipping it only when delegation would cost
more than the work.

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

**Exit report — and who renders one.** "Telling the user" has a shape, and a node
renders one **only when it is directly invoked** — the run starts at it. A nested
worker (invoked under another node) returns only a state delta to its caller and
renders no user-facing report. A directly invoked node ending its own run tells the
user, in two or three sentences, what landed and where it went, then at runtime one
most likely declared route plus at most one alternative — each a concrete entry point
from the node's own declared edges, named the way each is actually invoked: a command
slash-prefixed (`/ws-<command>`), a skill bare (`ws-skill-name`). Never a bullet dump,
never "let me know how you'd like to proceed". A return-only node — one with no
outward edge its run owns — reports the outcome and stops; it does not invent a next
entry or a driver to hand off to. The recommendation is the entry → entry handoff
above, made concrete — it points at the next entry; it never auto-invokes it. Each
vendored skill carries its own routing in one `**Exit report:**` bullet at the end of
its `## Graph node` section (ADR 0008).

## Backend precedence

> Every work unit has exactly ONE scheduling owner. Schedulers may nest only
> by subdivision: Herdr can own top-level lanes and `task` can own disjoint
> sub-slices inside one lane, but neither may schedule the same unit twice.

**Substantial lane** — the unit that justifies Herdr outer — is decidable at
runtime with no user input: an independent, long-lived unit of work scoped to
its own repo or subsystem, that will run for many turns and does not share a
working tree with its peers. Herdr outer is the default only at 2+ such lanes.
Contrast this with short disjoint units — one review axis, one research
question, one TDD seam — which are batched `task` work, not lanes.

| # | Owner | Use when | Never |
|---|---|---|---|
| 1 | Leaf | Your tool inventory lacks `task` / `Agent`, or you are any shipped WS worker agent under `plugins/ws/agents/`. | Spawn; drive Herdr; inject a magic keyword; render an exit report. |
| 2 | User-selected backend | The current user turn explicitly selects an available backend: Herdr, standalone `orchestrate` / `workflowz`, or `/vibe`. | Treat a keyword buried inside a lane prompt, ticket, or quoted text as user-selected. |
| 3 | Herdr director (outer) | `HERDR_ENV=1`, your prompt is not stamped `WS-HERDR-LANE`, and the work is 2+ substantial lanes. Under WS policy the user need not name Herdr again. | Duplicate lanes already owned by a live fleet, or run parallel edits in shared-cwd panes. |
| 4 | Herdr lane → batched `task` (inner) | Your prompt carries `WS-HERDR-LANE`; your lane itself contains 2+ independent sub-slices worth delegating. | Drive Herdr, resubmit your lane or a sibling lane, or assign the same sub-slice twice. |
| 5 | Batched same-session `task` | No outer lane owns the work and it still decomposes: one `{ context, tasks[] }` call with per-item `agent` / `outputSchema` and optional `effort` when the active schema exposes it. | Serialize genuinely independent items, or let a leaf worker spawn. |
| 6 | Sequential | Nothing above matched, or delegation would cost more than doing the work. | Spawn at all. |

**Herdr director/lane protocol.** `HERDR_ENV=1` does NOT identify a leaf —
every pane carries it, the director included, and no harness bit distinguishes
them. When row 3 fires, explicitly load the vendored `herdr` skill before any
Herdr CLI call. The binding WS policy is the authorization for that explicit
load; the upstream skill's frontmatter remains the guard against unrelated
implicit self-selection. The director stamps every top-level prompt
`WS-HERDR-LANE: <stable-lane-id>`. A stamped lane never drives Herdr; it may
use one inner batched `task` call for non-overlapping sub-slices that it alone
owns. Task workers are leaves. Shared-cwd panes are coordination-only; parallel
edits require `herdr worktree`.

**Leaf status is a guarantee, not an honour system.** WS worker agents declare
no `spawns`, so omp does not give them `task`; the harness also caps recursion
with `task.maxRecursionDepth` (default 2) and blocks self-spawn with
`PI_BLOCKED_AGENT`. Claude Code follows the same leaf contract by design.

### Worker roles and effort
`effort` is an optional per-call task-item field (`lo|med|hi`), NOT an
agent-definition key. omp 17.1.6+ exposes it only when
`task.enableEffort: true` (default false); when it is absent from the active
tool schema, omit it and let the selected role/model use its configured
reasoning level.

| Agent | Role | Effort | Why |
|---|---|---|---|
| reviewer | @slow | hi | deepest judgement on a diff slice |
| hub-architect | @plan | hi | cross-repo architecture synthesis |
| architecture-documenter | @plan | med | structured doc from a known template |
| researcher | @task | med | one sourced question, scoped legwork |
| tdd-runner | @task | med | one red-green cycle per seam |
| adr-writer | @task | med | one decision, structured output |
| diataxis-writer | @task | med | one doc quadrant, disciplined |
| release-notes-writer | @task | med | changelog → prose synthesis |
| api-documenter | @task | lo | signature extraction, light prose |
| changelog-analyzer | @smol | lo | classify commits into sections |
| contributing-generator | @smol | lo | scaffold from repo conventions |
| public-api-watcher | @smol | lo | diff an export surface |
| arch-watcher | @smol | lo | flag commit signals |
| docs-doctor | @tiny | lo | pure classification of doc state |

## Per-harness execution

**Claude Code** — the model orchestrates by following edges; workers spawn via
the Task tool. For hot fan-outs, compiling the shape into a dynamic workflow
is a documented option, not shipped in v1 — interpreted execution is the
default.

**omp** — plugin skills, commands, and agents ingest natively, and the harness
carries graph primitives directly (verified against omp docs, 2026-07):

- **Fan-out**: the `task` tool is batched — `{ context, tasks[] }` spawns one
  subagent per item with shared context injected; per-item `agent`,
  `outputSchema`, and optional `effort` (`lo|med|hi`, exposed only when
  `task.enableEffort: true`) give schema-validated JSON fan-in (exactly this
  skill's Send + reducer semantics). Concurrency is a session-scoped
  semaphore (`task.maxConcurrency`, default 32); recursion is bounded by
  `task.maxRecursionDepth` (default 2 — the `task` tool is hidden at or beyond
  the limit and stripped from children at max depth; it is only auto-added to
  a child when its agent declares `spawns`). `isolated: true` appears in the
  wire schema only when `task.isolation.mode != none` (default `none`): it
  needs a git repo, merges as a patch or a branch `omp/task/<id>`, and the
  isolated agent is NOT revivable.
- **Handoff/liveness**: finished agents go `idle`, then park after
  `task.agentIdleTtlMs` (default ~7 minutes); `hub` messaging revives a parked
  agent. Read outputs at `agent://<id>` and transcripts at `history://<id>` —
  the state-passing channel between nodes beyond `DONE|{path}`.
- **Magic keywords**: a standalone `orchestrate` in the prompt activates omp's
  multi-agent orchestration contract; `workflowz` builds a deterministic
  multi-subagent workflow over `task`. When (or whether) to invoke either is
  decided by `## Backend precedence` above — that section is the chooser.
  Ordering comes from the data, not intuition: follow the **dependency
  frontier** of `Blocked by:` edges in `dev-docs/tickets/open/` —
  no-open-blockers run in parallel, the rest wait for their blockers to reach
  `done/`.
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
