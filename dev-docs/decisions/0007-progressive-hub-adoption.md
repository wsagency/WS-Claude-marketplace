---
status: accepted
date: 2026-08-02
decision-makers: Kristijan Lukačin
---

# 0007 — Progressive hub adoption: no hub is a first-class state

## Context and Problem Statement

ADR 0006 treated the `<project>-main` hub as the normal project shape, so every
hub-aware surface implicitly assumed `project.yaml` exists. Real projects do
not start that way: they begin as a single repo, or as a few loose repos with
no hub, and only grow into a hub later when the work demands it. A command,
skill, agent, hook, rule, or template that errors, aborts, warns, or nags
merely because `project.yaml` is absent makes the small case worse than no
tooling at all — and the freshness-code review found the three staleness
detectors had already diverged on what a standalone repo's own `dev-docs/`
means, because there was no decided answer.

## Decision Drivers

- The small / single-repo case must be a first-class, permanent-until-chosen
  state — not a degraded mode waiting for a hub.
- Whatever lives in the hub's `dev-docs/` must live, with identical names and
  layout, in a standalone repo's own `dev-docs/`, so adopting a hub later is a
  move, not a rewrite.
- One procedure decides "hub root / hub sub-repo / standalone repo" — restated
  copies drift, as the freshness divergence showed.
- `/ws-hub init` must adopt an existing multi-repo directory, not only scaffold
  greenfield, because that is the moment a project actually grows into a hub.

## Considered Options

1. **Hub-optional, with repo-local mirroring of the hub layout (chosen).**
   No-hub is valid and silent; standalone repos keep a `dev-docs/` structured
   exactly like the hub's; one shared detection procedure; `/ws-hub init`
   adopts existing repos; freshness detectors count a standalone repo's own
   `dev-docs/` as the product knowledge root.
2. **Require a hub for every project.** Taxed the small case — every
   single-repo project would need a hub scaffold before any ws command works —
   and the review showed the tooling already silently no-ops on a missing
   `project.yaml` rather than guiding the user, so the requirement was
   unenforced and harmful. Rejected.
3. **A separate lightweight non-hub mode with its own layout.** Two layouts
   means adopting a hub is a rewrite (rename directories, re-file docs) rather
   than a move. Rejected.

## Decision Outcome

Chosen option: **Option 1** — hub-optional with repo-local mirroring. No-hub is
a valid, first-class, permanent-until-chosen state.

1. **No-hub is valid, permanent-until-chosen, and silent (A1).** No command,
   skill, agent, hook, rule, or template may error, abort, warn, or nag merely
   because `project.yaml` is absent. Every hub-aware surface states its
   standalone behaviour explicitly next to its hub behaviour — never leaves it
   implied.
2. **One shared detection procedure (A2).** Walk up from the working directory
   looking for `project.yaml`, stopping at the filesystem root: found in the
   working directory → **hub root**; found in an ancestor directory → **hub
   sub-repo** (that ancestor is the hub); not found → **standalone repo**.
   Documented ONCE, in the `project-hub-conventions` skill under `## Project
   shape detection`; every other surface references it by name ("project shape
   detection, see `project-hub-conventions`") instead of restating the walk.
3. **Standalone routing is repo-local, with identical structure (A3).** Whatever
   would live in the hub's `dev-docs/` (cross-repo architecture, product ADRs,
   runbooks, scoping docs) lives in the standalone repo's OWN `dev-docs/` while
   there is no hub — same directory names, same file names, same layout. The
   later lift is a move, not a rewrite. In a hub sub-repo the ADR 0006 rule is
   unchanged: product-level content goes to the hub's `dev-docs/`, repo-level
   content stays local.
4. **`/ws-hub init` adopts existing repos (A4).** Besides greenfield
   scaffolding it handles "a directory that already contains repos": detect
   sibling git repos, propose registering each with an inferred `type` (confirm
   each), and offer to lift each adopted repo's product-level `dev-docs/`
   content into the new hub knowledge root — per file, refusing to overwrite,
   using the same collision-safe machinery as the `/ws-hub update` migration.
   Adoption is always opt-in and never silent.
5. **Suggest once, never nag (A5).** A surface that notices standalone work has
   grown into multi-repo territory MAY offer `/ws-hub init` in a single line at
   a natural moment. It MUST NOT repeat the suggestion every run, and MUST NOT
   degrade its own output when declined.
6. **Freshness detectors, standalone case (A6).** With no `project.yaml`, the
   repo's own `dev-docs/` IS the product knowledge root (per A3), so it COUNTS
   for OpenWiki staleness. All three implementations agree: walk the repo's own
   `dev-docs/` plus any immediate sub-directory `dev-docs/`, excluding
   `openwiki/` and `dev-docs/tickets/`. In hub-root mode the hub's own
   `dev-docs/` is excluded (ADR 0006: authored truth is not wiki input) and only
   `type: working` repos (legacy hubs: entries with neither `type` nor `role`)
   are walked. This resolves the shell-vs-omp divergence the review found.

### Consequences

- **Good**: a single-repo project gets the full ws surface with zero hub
  ceremony; the path from one repo to a hub is `git init` + `/ws-hub init`,
  never a rewrite.
- **Good**: the standalone freshness question is now decided rather than
  divergent across the three detectors.
- **Bad (accepted)**: every hub-aware surface now carries an explicit
  standalone-behaviour clause — more prose to maintain, traded for correctness
  in the common small case.
- **Neutral**: the ADR 0006 semantics table (`type: working | input | output`,
  cardinality, knowledge flow) applies only in hub mode; a standalone repo has
  no `project.yaml` and therefore no types. `/ws-hub init`'s adopt path reuses
  the migration's collision-safe lift machinery rather than introducing a new
  one.

## Pros and Cons of the Options

### Option 1 — Hub-optional with repo-local mirroring (chosen)

- Good: the small case is first-class; standalone → hub is a move, not a
  rewrite; one detection procedure kills the drift.
- Bad: every hub-aware surface must declare its standalone behaviour.

### Option 2 — Require a hub for every project

- Good: one shape to reason about.
- Bad: taxes the small case; the review proved the requirement was already
  unenforced (tooling silently no-ops on a missing `project.yaml`).

### Option 3 — Separate lightweight non-hub mode

- Good: each mode is locally simple.
- Bad: two layouts make adoption a rewrite; drift between the two is inevitable.

## More Information

- ADR 0006 — hub repo types and migration; its semantics table applies in hub
  mode.
- `project-hub-conventions` skill — owns the single `## Project shape
  detection` procedure and the living repo-type semantics table.
- `/ws-hub init` — greenfield scaffold plus the adopt path (A4).
