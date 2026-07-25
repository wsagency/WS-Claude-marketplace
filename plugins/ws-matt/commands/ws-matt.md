---
allowed-tools: Bash, Read, Write, Glob, AskUserQuestion, Task
description: Entry point for the ws-matt skill graph — graph status, entry-node routing, and per-project setup
argument-hint: "[ask | implement | spec | tickets | triage | grill | architecture | wayfinder | setup] [input...]"
---

## Your task

Single entry to the ws-matt graph — Matt Pocock's engineering skills, vendored and
interlinked per the **ws-graph-engineering** methodology. Dispatch on:

$ARGUMENTS

### No arguments — graph status

1. List the nodes by tier:
   - **Entry (user-invoked):** ws-ask-matt, ws-implement, ws-to-spec, ws-to-tickets,
     ws-triage, ws-grill-with-docs, ws-improve-codebase-architecture, ws-wayfinder,
     ws-setup-matt-pocock-skills
   - **Worker (model-invoked):** ws-tdd, ws-code-review, ws-research, ws-prototype,
     ws-diagnosing-bugs, ws-domain-modeling, ws-codebase-design,
     ws-resolving-merge-conflicts, ws-grilling
   - **Foundation:** ws-graph-engineering (the node/edge/state contract)
   - **Worker agents:** ws-matt-reviewer, ws-matt-researcher, ws-matt-tdd-runner —
     fanned out via the Task tool (omp: its task agent)
2. Render this mini-map; the full graph with every edge is the plugin's
   `docs/graph.md`:

   ```mermaid
   flowchart LR
     U([user]) --> R[ws-ask-matt]
     R --> E[8 more entry nodes]
     E --> W[9 worker skills]
     W -. fan-out .-> A[[3 worker agents]]
   ```

3. Suggest one entry node from the conversation so far (mid-bug → `triage`, spec in
   hand → `implement`, vague idea → `spec`, backlog to cut → `tickets`). If nothing
   suggests itself, ask via AskUserQuestion (or a plain chat question when that tool
   is unavailable) which entry fits.

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

### `/ws-matt setup` — per-project bootstrap

1. Load the **ws-setup-matt-pocock-skills** skill and run its content.
2. Check for omp: run `ls -d .omp` at the project root. If `.omp/` exists — or the
   user says they use omp (ask when unsure) — install the edge-discipline rule:
   - `mkdir -p .omp/rules`
   - copy `${CLAUDE_PLUGIN_ROOT}/rules/omp-edge-discipline.md` (if
     CLAUDE_PLUGIN_ROOT is unset — e.g. in omp — use the plugin's install
     directory: the plugin root containing this command file) to
     `.omp/rules/omp-edge-discipline.md`
   - If `.omp/rules/omp-edge-discipline.md` already exists, confirm before
     overwriting.
3. Report what was installed and where.

### Graph discipline (all verbs)

Entry nodes may invoke worker nodes, **never another entry node**. Workers return
state deltas and hand large artifacts back by path (`DONE|{path}`). The
ws-graph-engineering skill is the contract — consult it before orchestrating any
fan-out.
