# Design — ws-matt: Matt Pocock's engineering skills as a graph-engineered skill set

**Date:** 2026-07-24
**Status:** Approved, implementation in progress
**Scope:** new plugin `ws-matt`; marketplace registration; lockstep release 3.5.0

## Problem / goal

Package Matt Pocock's 17 engineering skills (mattpocock/skills, MIT © 2026) as an
installable WS plugin, deeply interlinked using the graph-engineering approach (the
LangGraph-style node/edge/state contract, viral as "graph engineering" since mid-July
2026 and endorsed by LangChain), working in Claude Code, Codex, and omp — with the omp
harness as the execution focus.

Grounding (deep-research run wf_171606b2-a61, 23 claims verified 3-0):
- Graph contract: node = read shared state → return a state delta; edges deterministic /
  conditional; dynamic fan-out (Send-style) spawns N workers from runtime state; fan-in
  merges via declared reducers; handoff = state update + goto. Reference shape:
  classify → parallel workers → synthesize.
- Matt's set is already a two-tier graph: user-invoked orchestrators (ask-matt router,
  implement, to-spec, to-tickets, triage, grill-with-docs,
  improve-codebase-architecture, wayfinder, setup-matt-pocock-skills) and model-invoked
  disciplines (tdd, code-review, research, prototype, diagnosing-bugs, domain-modeling,
  codebase-design, resolving-merge-conflicts), with the edge rule "user-invoked may
  invoke model-invoked, never another user-invoked".
- Refuted (design constraints): hooks-only orchestration does not work (0-3); the exact
  cross-harness "manual-only" frontmatter is unverified — mirror whatever mechanism
  upstream uses per harness, verified at implementation time.
- omp execution layer comes from our own 2026-07-22 source-level omp research (not web
  claims): task agents with `spawns`, `output` JSON-schema, `autoloadSkills`; plugin
  `agents/` dirs are read by omp; skills honor `disableModelInvocation`; rules support
  `alwaysApply`; Claude-compatible plugin/marketplace ingestion.

## Decisions

| Question | Decision |
|---|---|
| Vendoring | **Vendor + adapt** (MIT permits; LICENSE retained verbatim; `UPSTREAM.md` records source commit, the rename map, and the manual sync procedure — upstream is actively maintained and will drift) |
| Naming | **`ws-` prefix on every skill**: `ws-ask-matt`, `ws-implement`, `ws-tdd`, `ws-code-review`, … All internal cross-references between skills are rewritten to the ws- names (part of adaptation; the rename map in UPSTREAM.md makes future syncs diffable) |
| Graph formalization | Every vendored SKILL.md gains a trailing `## Graph node` section (format below); a new foundational skill `ws-graph-engineering` carries the methodology; `docs/graph.md` in the plugin renders the whole 18-node graph as mermaid (Outline-safe) |
| Execution | Interpreted-first (the model orchestrates by following edges); worker agents for the heavy fan-out nodes; file-handoff protocol for state where the harness lacks structured returns; JSON-schema output where it does. No hooks-only engine (refuted). Claude Code dynamic-workflow "compilation" of hot paths is a documented option, not shipped in v1 |
| Version | Lockstep **3.5.0**, cut + tagged per ADR 0002 |

## Plugin layout

```
plugins/ws-matt/
├── .claude-plugin/plugin.json
├── LICENSE                    ← upstream MIT text, verbatim (condition of the license)
├── UPSTREAM.md                ← source repo+commit, rename map (17 rows), sync procedure
├── docs/graph.md              ← mermaid graph of all nodes+edges (Outline-safe markdown)
├── commands/ws-matt.md        ← single entry: routing + graph status (below)
├── agents/
│   ├── ws-matt-reviewer.md    ← fan-out code review worker (omp: spawns/output schema)
│   ├── ws-matt-researcher.md  ← research worker
│   └── ws-matt-tdd-runner.md  ← red-green-refactor executor
├── rules/omp-edge-discipline.md  ← TEMPLATE (installed into a project's .omp/rules/ by
│                                    /ws-matt setup — omp does not document plugin-root
│                                    rules discovery, so we install rather than assume)
└── skills/
    ├── ws-graph-engineering/SKILL.md   ← NEW: node/edge/state contract, fan-out/
    │                                     synthesize template, file-handoff protocol,
    │                                     per-harness execution notes (Claude/Codex/omp)
    ├── ws-ask-matt/ … ws-wayfinder/    ← 9 user-invoked (entry nodes)
    └── ws-tdd/ … ws-resolving-merge-conflicts/  ← 8 model-invoked (worker nodes)
```

## The `## Graph node` section (appended to every vendored skill)

```markdown
## Graph node

- **Tier:** user-invoked (entry) | model-invoked (worker)
- **Reads:** <state this node consumes — files, ticket refs, prior node outputs>
- **Emits:** <state delta — artifacts written, decisions recorded>
- **Edges:**
  - then → ws-<next> (deterministic continuation)
  - when <condition> → ws-<target> (conditional)
  - fan-out: for each <item> spawn <agent> (schema: <what it returns>)
- **Handoff protocol:** write outputs to the scratch/state location and reference by
  path; do not paste large artifacts into conversation (DONE|{path} convention).
```

Content per skill is derived from what the skill actually does (e.g. `ws-implement`:
edges `then → ws-tdd` at agreed seams, `then → ws-code-review` before commit;
`ws-to-tickets`: emits tickets each declaring blocking edges — those ARE graph edges as
data; `ws-ask-matt`: router with `when` edges to every user-invoked node;
`ws-code-review`: fan-out to `ws-matt-reviewer` agents). The edge rule is stated in
`ws-graph-engineering` and repeated in each entry node: entry → worker only, never
entry → entry.

## /ws-matt command (single entry)

- No args → graph status: which nodes exist, mermaid mini-map, suggested entry node.
- `/ws-matt <entry>` (e.g. `/ws-matt implement`, `/ws-matt ask`) → loads the matching
  ws- skill and follows it; equivalent to invoking the skill directly, but discoverable.
- `/ws-matt setup` → per-project bootstrap: runs the `ws-setup-matt-pocock-skills`
  content AND (when an `.omp/` dir exists or the user wants omp) installs
  `rules/omp-edge-discipline.md` into `.omp/rules/`.
- Carries the standard context-fallback note only if it has a Context block; neutral
  AskUserQuestion/Task phrasing per the 3.4.0 convention.

## Per-harness execution

- **Claude Code:** skills auto-load by description; worker agents spawn via Task; the
  ws-graph-engineering skill documents (does not ship) the dynamic-workflow compile
  path for hot fan-outs.
- **omp (focus):** plugin skills/commands/agents ingest via omp's Claude-compatible
  providers. Worker agents carry omp frontmatter extras (`spawns` chains for
  reviewer → synthesizer, `output` JSON-schema for structured fan-in, `autoloadSkills`
  pointing at the paired ws- skill). Entry-node discipline enforced via the installed
  `alwaysApply` rule. Manual-only pinning uses the mechanism upstream uses, plus omp's
  `disableModelInvocation` where applicable — verified against each harness's current
  docs during implementation (refuted-claim caution).
- **Codex:** skills follow the Agent Skills SKILL.md standard (upstream's own
  cross-harness channel); no Codex-specific extras in v1.

## Marketplace + docs surface

- Register `ws-matt` in marketplace.json (category development; tags: skills,
  graph-engineering, matt-pocock, tdd, code-review; version 3.5.0 lockstep).
- README: plugin table row + a short section (attribution to Matt Pocock, MIT).
- `docs/reference/commands.md`: /ws-matt entry + skills table (18 rows).
- `docs/how-to/use-with-omp.md`: ws-matt note (agents' spawns/output, rule install).
- CHANGELOG (+ mirror): Added entries; attribution line.
- Cut **[3.5.0]**, tag, push (ADR 0002).

## Verification

- 18 skill dirs under plugins/ws-matt/skills/, every SKILL.md has exactly one
  `## Graph node` section; no upstream skill name remains unreferenced in the rename
  map; no cross-reference to a non-ws name (grep for `/tdd`, `/code-review`,
  `/ask-matt` etc. inside plugins/ws-matt/ returns only the rename map and LICENSE).
- LICENSE is byte-identical to upstream's MIT text; UPSTREAM.md records the vendored
  commit SHA.
- marketplace.json valid; all versions 3.5.0; tag v3.5.0.
- `docs/graph.md` passes `outline-sync.py lint` (Outline-safe).
- Repo-wide: README/reference/how-to mention ws-matt; CHANGELOG mirrored.

## Out of scope (v2 candidates)

- Shipping compiled Claude dynamic workflows; omp TypeScript hook enforcing edges at
  tool_call time; automated upstream sync tooling; productivity-category skills.
