---
status: accepted
date: 2026-05-29
decision-makers: WS Agency engineering team
consulted: Claude (via brainstorming skill, two rounds)
informed: All WS Agency developers using docs-agent
---

# Adopt dual-track docs convention with `/ws-docs` unified entry

## Context and Problem Statement

Documentation in our projects mixes two distinct audiences: external consumers (plugin users, end users, library clients) and internal contributors (maintainers, plugin authors). A single `docs/` folder serves neither well — public-facing tutorials sit next to internal architecture notes, and a published docs site would have to either include everything (leaking maintenance detail) or hand-curate what to expose.

Additionally, docs-agent v2.0.0 ships 11 separate slash commands for the various Diátaxis quadrants and artifacts (`/docs`, `/docs-tutorial`, `/docs-howto`, `/docs-reference`, `/docs-explanation`, `/adr`, `/architecture`, `/contributing`, `/changelog`, `/changelog-entry`, `/release-notes`). Most users will never remember the granular set, and the artifacts often need to be kept in sync after code changes anyway.

How do we structure documentation so that (a) the user-facing track can be published cleanly to a static site, (b) the internal track stays useful for contributors, and (c) the docs-agent plugin offers a single discoverable entry that handles common drift automatically?

## Considered Options

- **Option 1**: Keep single `docs/` folder, add front-matter or naming convention to distinguish audience
- **Option 2**: Adopt dual-track convention (`docs/` + `dev-docs/`) and keep all 11 specialized commands
- **Option 3**: Adopt dual-track convention AND consolidate the 11 commands into a single `/ws-docs <verb>` with discovery default, automatic maintenance via CLAUDE.md instructions + opt-in hooks

## Decision Outcome

Chosen option: **Option 3** — dual-track convention plus `/ws-docs` unified entry.

Rationale:
- Two physical folders make the audience boundary obvious and let VitePress (or any static site generator) point at `docs/` directly with zero filtering
- A unified entry point reduces cognitive load: a contributor running `/ws-docs` sees what's missing or stale and is offered concrete next verbs
- Automatic maintenance (CLAUDE.md instructions + opt-in PreToolUse/Stop hooks) closes the drift gap without requiring developers to remember to update the changelog or write an ADR for every architectural change

### Consequences

- **Good**: Public documentation is publishable as a static site without curation; contributor docs stay rich without leaking; one slash command instead of 11
- **Good**: Hooks are opt-in per project via `.claude/docs-config.yaml` — projects that don't use the convention are unaffected
- **Good**: Background subagent dispatch for heavy verbs keeps the main session clean
- **Neutral**: docs-agent v3.0.0 is a breaking change — old commands are removed, no back-compat aliases (per explicit team decision to keep the namespace clean)
- **Bad**: Existing v2.x projects need a manual `/ws-docs init` to get the docs-config.yaml and CLAUDE.md additions

### Confirmation

Confirmed by:
- Shipping docs-agent v2.1.0 introducing the dual-track convention (PR 1)
- Shipping docs-agent v3.0.0 consolidating commands and adding hooks (PR 2)
- Migrating the marketplace itself to follow the convention as a dogfood test (PR 3, this ADR)

## Pros and Cons of the Options

### Option 1 — Single folder + front-matter

- Good: Minimal restructuring
- Bad: Audience filtering at publish time is fragile; missed front-matter fields produce mixed output
- Bad: Doesn't reduce slash command surface

### Option 2 — Dual-track + 11 commands

- Good: Clear audience separation
- Bad: Cognitive load of 11 commands persists; users still forget to update the changelog manually

### Option 3 — Dual-track + /ws-docs (chosen)

- Good: Both audience separation and namespace simplification
- Good: Automation via hooks ensures the common drift case (changelog out of sync) is caught
- Bad: Breaking change for existing v2.x users (mitigated by clear migration table in UPGRADE-NOTES)

## More Information

- Brainstorming sessions and spec: `dev-docs/superpowers/specs/2026-05-29-dual-track-docs-design.md`, `dev-docs/superpowers/specs/2026-05-29-ws-docs-unified.md`
- Implementation plans: `dev-docs/superpowers/plans/2026-05-29-dual-track-docs-pr1.md`, `dev-docs/superpowers/plans/2026-05-29-ws-docs-unified-pr2.md`
- The `dual-track-docs` skill (in docs-agent plugin) is the canonical convention reference
