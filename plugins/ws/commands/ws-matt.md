---
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
description: Entry point for the ws-matt skill graph — graph status, entry-node routing, and per-project setup
argument-hint: "[ask | implement | spec | tickets | triage | grill | architecture | wayfinder | setup] [input...]"
---

## Your task

Single entry to the ws-matt graph — Matt Pocock's engineering skills, vendored and
interlinked per the **ws-graph-engineering** methodology. Dispatch on:

$ARGUMENTS

This command is hub-independent: graph status and entry routing never read
`project.yaml`, so they run identically in a standalone repo, a hub sub-repo,
or at the hub root. The `setup` verb is the exception — it detects project
shape (walks up for `project.yaml` to tell a hub sub-repo from a standalone
repo) so it places ADRs in the right `dev-docs/decisions/`.

### No arguments — graph status

1. List the nodes by tier:
   - **Entry (user-invoked):** ws-ask-matt, ws-implement, ws-to-spec, ws-to-tickets,
     ws-triage, ws-grill-with-docs, ws-improve-codebase-architecture, ws-wayfinder,
     ws-setup-matt-pocock-skills
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
    R -. user-mediated .-> E[8 more entry nodes]
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
| setup | ws-setup-matt-pocock-skills (see below) |

Everything after the entry word is the skill's input. Unknown entry → show this
table plus the graph status.

### `/ws-matt setup` — per-project bootstrap

1. Load the **ws-setup-matt-pocock-skills** skill and run its content.
2. Check for omp: run `ls -d .omp` at the project root. If `.omp/` exists — or the
   user says they use omp (ask when unsure) — install **the WS session policy**
   (the rule file carries its edge-discipline clauses — entry→worker topology,
   state-delta workers, `DONE|{path}` handoffs, layer ownership and the
   English-artifact rule):
   - `mkdir -p .omp/rules`
   - copy `${CLAUDE_PLUGIN_ROOT}/rules/omp-edge-discipline.md` (if
     CLAUDE_PLUGIN_ROOT is unset — e.g. in omp — use the plugin's install
     directory: the plugin root containing this command file) to
     `.omp/rules/omp-edge-discipline.md`
   - If `.omp/rules/omp-edge-discipline.md` already exists, confirm before
     overwriting.
3. Report that the WS session policy was installed and where.

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