---
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
description: Entry point for the ws-matt skill graph — graph status and entry-node routing
argument-hint: "[ask | implement | spec | tickets | triage | grill | architecture | wayfinder] [input...]"
---

## Your task

Single entry to the ws-matt graph — Matt Pocock's engineering skills, vendored and
interlinked per the **ws-graph-engineering** methodology. Dispatch on:

$ARGUMENTS

This command is hub-independent: graph status and entry routing never read
`project.yaml`, so they run identically in a standalone repo, a hub sub-repo,
or at the hub root. Project setup is a separate public surface owned only by
`/ws-setup`.

### No arguments — graph status

1. List the nodes by tier:
   - **Entry (user-invoked):** ws-ask-matt, ws-implement, ws-to-spec, ws-to-tickets,
     ws-triage, ws-grill-with-docs, ws-improve-codebase-architecture, ws-wayfinder
   - **Worker (model-invoked):** ws-tdd, ws-code-review, ws-research, ws-prototype,
     ws-diagnosing-bugs, ws-domain-modeling, ws-codebase-design,
     ws-resolving-merge-conflicts, ws-grilling
   - **Foundation:** ws-graph-engineering (the node/edge/state contract)
   - **Worker agents:** ws-reviewer, researcher, tdd-runner —
     fanned out via the Task tool (omp: its task agent)
2. Render this mini-map; the full graph with every edge is the plugin's
   `docs/graph.md`:

   ```mermaid
   flowchart LR
     U([user]) --> R[ws-ask-matt]
    R -. user-mediated .-> E[7 more entry nodes]
     E --> W[9 worker skills]
    W --> A[[3 worker agents]]
   ```

3. Suggest one entry node from the conversation so far (something broken →
   `triage` (or invoke the `ws-diagnosing-bugs` worker skill directly), vague idea → `grill`,
   sharpened multi-session thread → `spec`, spec in hand → `implement`,
   backlog to cut → `tickets`). If nothing suggests itself, ask via
   AskUserQuestion (or a plain chat question when that tool is unavailable)
   which entry fits.

### `/ws-matt <entry>` — route into the graph

Map the first word, load the matching skill, and follow it exactly. This is
equivalent to invoking the skill directly — the command just makes it discoverable.

| Argument | Skill |
|---|---|
| ask | ws-ask-matt |
| implement | ws-implement |
| spec | ws-to-spec |
| tickets | ws-to-tickets |
| triage | ws-triage |
| grill | ws-grill-with-docs |
| architecture | ws-improve-codebase-architecture |
| wayfinder | ws-wayfinder |

Everything after the entry word is the skill's input. Unknown entry → show this
table plus the graph status.

### Session policy (all verbs)

Entry nodes may invoke worker nodes, **never another entry node**. Workers return
state deltas and hand large artifacts back by path (`DONE|{path}`).

Every artifact the suite generates — specs, tickets, ADRs, `CONTEXT.md`, changelog
entries, commit and PR bodies, review findings, research notes, generated docs and
HTML — is English regardless of the conversation language.

Each work unit has one scheduling owner. With `HERDR_ENV=1`, a prompt **not**
stamped `WS-HERDR-LANE`, and 2+ substantial lanes, Herdr partitions the outer
lanes and the user need not name it again — explicitly load the vendored
`herdr` skill before any Herdr CLI call. A stamped lane never drives Herdr; it
may batch `task` workers over its own disjoint inner slices, but no layer
resubmits the same unit. Outside Herdr, never attempt a `herdr` command.
Prefer the specialized agent type. When the active `task` schema exposes
`effort`, use `hi` for review and architecture synthesis, `med` for
implementation and research, and `lo` for mechanical checks.

The `omp-edge-discipline` rule is the binding form and the ws-graph-engineering
skill carries the full backend-precedence and role/effort tables — consult it
before orchestrating any fan-out.

## When you finish

In two or three sentences, tell the user what you did — rendered the graph map
and suggested an entry (no args), or routed into a skill (`/ws-matt <entry>`)
that runs to its own exit report — then name the next move: for status, run the
suggested `/ws-matt <entry>` (often `/ws-matt ask` or `/ws-matt implement`);
for a routed entry, follow the skill it loaded.