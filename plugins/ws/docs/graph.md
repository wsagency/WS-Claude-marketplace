# ws-matt skill graph

The full 19-node graph of the ws plugin's ws-matt skill set: 18 skills vendored from Matt
Pocock's skills repo — 17 engineering skills + the grilling productivity skill —
plus the foundational `ws-graph-engineering` skill that
carries the node/edge/state contract every node follows. Each node's precise
contract (reads, emits, edges, handoff protocol) lives in the `## Graph node`
section at the end of its SKILL.md; this page is the map.

```mermaid
graph TD
  GE["ws-graph-engineering"]

  subgraph ENTRY["User-invoked entry nodes"]
    ASK["ws-ask-matt (router)"]
    GRILL["ws-grill-with-docs"]
    TOSPEC["ws-to-spec"]
    TOTICKETS["ws-to-tickets"]
    IMPL["ws-implement"]
    TRIAGE["ws-triage"]
    WAY["ws-wayfinder"]
    ICA["ws-improve-codebase-architecture"]
    SETUP["ws-setup-matt-pocock-skills"]
  end

  subgraph WORKER["Model-invoked worker nodes"]
    TDD["ws-tdd"]
    CR["ws-code-review"]
    PROTO["ws-prototype"]
    RESEARCH["ws-research"]
    DIAG["ws-diagnosing-bugs"]
    DM["ws-domain-modeling"]
    CBD["ws-codebase-design"]
    MERGE["ws-resolving-merge-conflicts"]
    GRILLING["ws-grilling"]
  end

  GE -. "node/edge/state contract" .-> ENTRY
  GE -. "node/edge/state contract" .-> WORKER

  ASK -. "idea + codebase" .-> GRILL
  ASK -. "multi-session build" .-> TOSPEC
  ASK -. "split a plan" .-> TOTICKETS
  ASK -. "ticket ready" .-> IMPL
  ASK -. "issues piling up" .-> TRIAGE
  ASK -. "huge foggy effort" .-> WAY
  ASK -. "codebase upkeep" .-> ICA
  ASK -. "first run in repo" .-> SETUP
  ASK -. "single discipline" .-> WORKER

  GRILL -->|"drives the interview"| GRILLING
  TRIAGE -->|"grill into shape"| GRILLING
  WAY -->|"HITL grilling tickets"| GRILLING
  GRILLING -->|"decisions land as they are made"| DM
  GRILL -->|"glossary + ADRs inline"| DM
  GRILL -. "runnable answer needed" .-> PROTO
  GRILL -. "multi-session" .-> TOSPEC
  GRILL -. "fits one session" .-> IMPL

  TOSPEC -. "published spec" .-> TOTICKETS
  TOSPEC -. "ADR-worthy decision" .-> DM
  TOTICKETS -. "per frontier ticket" .-> IMPL

  IMPL -->|"at agreed seams"| TDD
  IMPL -->|"before commit"| CR
  IMPL -. "decision the spec didn't cover" .-> DM
  TDD -->|"refactor stage"| CR
  TDD -. "vocabulary" .-> CBD

  TRIAGE -->|"grill raw requests"| DM
  TRIAGE -. "ready-for-agent issues" .-> IMPL

  ICA -->|"design vocabulary"| CBD
  ICA -->|"grilling loop"| GRILLING
  ICA -->|"inline updates"| DM
  ICA -. "picked candidate = new idea" .-> GRILL

  DIAG -. "no seam to lock bug down" .-> ICA

  WAY -->|"fan-out: research tickets"| RESEARCH
  WAY -->|"prototype tickets"| PROTO
  WAY -->|"grilling tickets"| DM
  WAY -. "map clear: hand off" .-> TOSPEC
  RESEARCH -. "findings file" .-> GRILL

  SETUP -. "config" .-> TRIAGE
  SETUP -. "config" .-> TOSPEC
  SETUP -. "config" .-> TOTICKETS
  SETUP -. "config" .-> WAY
  SETUP -. "config" .-> CR
```

## Legend

- **Solid arrow** — deterministic in-session continuation (`then →`) or a
  fan-out the node performs itself.
- **Dotted arrow** — conditional (`when ... →`), user-mediated handoff, or a
  data/config edge (state written by one node and read by another).
- **Entry tier** (user-invoked): reachable only when the user types them —
  `disable-model-invocation: true` plus `disableModelInvocation: true` in
  frontmatter, `policy.allow_implicit_invocation: false` for Codex.
- **Worker tier** (model-invoked): rich trigger descriptions so the model can
  reach for them.
- **Edge rule:** entry → worker only, never entry → entry. Every dotted edge
  that lands on an entry node (including all router edges from `ws-ask-matt`)
  is a user-mediated handoff: the source node recommends the next entry node,
  the user invokes it.
- **Agent fan-outs** are listed in each node's `## Graph node` section but not
  drawn as graph nodes: `ws-code-review` spawns parallel `reviewer`
  agents (one per axis), `ws-research` runs as a background agent, and
  `ws-improve-codebase-architecture` / `ws-codebase-design` spawn exploration
  and design-it-twice sub-agents.
- `ws-graph-engineering` is foundational: it defines the contract (node = read
  state → emit a state delta; deterministic/conditional edges; fan-out/fan-in;
  file-handoff protocol) that every node above follows.
