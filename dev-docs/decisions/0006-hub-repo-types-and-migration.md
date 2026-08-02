---
status: accepted
date: 2026-07-27
decision-makers: Kristijan Lukačin
---

# 0006 — Hub repo types (working/input/output), product synthesis at the hub, and hub migration via /ws-hub update

## Context and Problem Statement

Until now a hub classified repos only by absence/presence of two output roles
(`role: docs`, `role: explained`). Three structural problems emerged in
practice:

1. **The docs repo was both output and input.** It held the user track
   (`docs/` → Outline, a pure output) AND the product-level internal track
   (`dev-docs/`: cross-repo architecture written by hub-architect, product
   ADRs, client materials). OpenWiki and hub-architect excluded it as an
   output, while `/ws-hub explained` read it as an input — the same repo was
   simultaneously a derived artifact and a source of truth.
2. **Product synthesis had no stable home.** hub-architect wrote cross-repo
   docs into the docs repo's `dev-docs/` when one was registered, falling
   back to the hub's `dev-docs/` only when none was — so creating a docs repo
   silently relocated the product's internal knowledge base away from the
   hub, where OpenWiki already lives.
3. **No eligibility vocabulary and no migration path.** Design/asset/client
   repos could not be excluded from `/ws-docs` sweeps or wiki coverage except
   by not registering them; client deliveries had no first-class home; and
   hubs created before a convention change had no way to upgrade (the plugin
   is already used on live projects).

## Considered Options

1. **Three explicit repo types + hub-as-knowledge-root (chosen).** Every
   `project.yaml` entry carries `type: working | input | output`; outputs add
   `purpose: docs | explained | …` (open vocabulary, max ONE per purpose the
   tooling targets). Product-level internal docs (architecture synthesis,
   product ADRs, runbooks) ALWAYS live in `<hub>/dev-docs/` next to
   `openwiki/`. Client deliveries live in dedicated `type: input` repos
   (`<project>-client`, `<project>-design`, …) with the dated-folder
   convention. A `project.conventions: N` marker plus a `/ws-hub update` verb
   migrates existing hubs version-by-version; `/ws-hub intake` drives the
   input→knowledge pipeline (scoping docs in the hub's `dev-docs/scoping/`).
2. Keep roles, move only the synthesis target — smaller diff, but the
   docs repo stays a mixed input/output and eligibility stays unexpressible;
   rejected as a half-measure.
3. New repo-level config file per hub (`.claude/hub-config.yaml`) — splits
   registry truth across two files; rejected, `project.yaml` remains the
   single registry.

## Decision Outcome

Option 1. Semantics per type:

| type | `/ws-docs` sweep | OpenWiki coverage | hub-architect analysis | cardinality |
|---|---|---|---|---|
| `working` (default) | yes | yes | yes | unlimited |
| `input` | no | no | no† | unlimited |
| `output` | no | no | no | unlimited, max 1 per known purpose |

† `input` → hub-architect analysis is "no" with one exception: hub-architect
  MAY reference an input repo's consumed assets in `contracts.md` (design
  tokens, shared types, and similar) when a working repo consumes them — see
  the `hub-architect` agent; inputs are never analyzed as systems. The living
  semantics table lives in the `project-hub-conventions` skill (vendored into
  every hub); this copy records the table as accepted on 2026-07-27.

- Knowledge flow is one-directional: `input` → processed into hub `dev-docs/`
  (scoping docs, ADRs, specs) → `working` repos build it → `output` repos
  (`docs` → Outline, `explained` → ws-artefacts) derive from hub `dev-docs/`
  + `openwiki/` + working repos. Nothing consumes an output as a source.
- OpenWiki does NOT index input repos (decision: Kristijan, 2026-07-27) —
  the wiki maps as-built state; raw deliveries would mix "requested" with
  "built". Processed truth lands in hub `dev-docs/` beside the wiki.
- All staleness detection (Claude Stop hook, omp per-project hook template,
  omp extension `wiki-freshness.ts`, the `/ws-hub doctor` knowledge-freshness
  check, the
  `openwiki-freshness` TTSR rule) walks `type: working` repos only, parsed
  from `project.yaml` — output/input repos never raise the stale-wiki banner.
- The docs repo shrinks to the user track (`docs/` + README + writing rules);
  its own repo-level `dev-docs/` (maintaining the docs repo itself) remains
  legitimate per dual-track, but product content is never scaffolded there.
- Back-compat: `role: docs` ≡ `type: output, purpose: docs`; `role:
  explained` ≡ `type: output, purpose: explained`; no role ≡ `type: working`.
  `/ws-hub update` performs the rename and the physical moves.

### Consequences

- **Breaking convention change** for existing hubs: init previously scaffolded
  product `dev-docs/` inside the docs repo. v1→v2 migration in `/ws-hub
  update` renames fields, scaffolds hub `dev-docs/`, moves product dev-docs
  out of the docs repo, and offers to create/move client materials into an
  input repo — interactively, never guessing.
- Client materials leave the hub's git (they previously would have landed in
  hub `dev-docs/`): per-repo git access control now governs who sees client
  deliveries, consistent with the hub's access-control model.
- `ws-setup-matt-pocock-skills` detection simplifies: product ADRs go to the
  hub's `dev-docs/decisions/` whenever a parent `project.yaml` exists — the
  "does the hub have a docs repo" condition disappears.
- Every future convention change MUST ship a migration row in the `/ws-hub
  update` table and bump the conventions version.
