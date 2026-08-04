---
description: Hub OpenWiki freshness discipline — refresh after dev-docs changes
alwaysApply: true
---

# OpenWiki freshness (hub convention)

If this repo has no `openwiki/` directory, this rule is inert — do nothing.
Otherwise, this repo maintains an OpenWiki (`openwiki/`) as the derived
knowledge index. Refresh is AI-driven — there is no CI doing it for you:

- If this session changed dev-docs the wiki actually ingests, refresh the
  wiki before wrapping up:
  `openwiki --update "Refresh; re-scan sub-repos: <list>"`. **What counts as
  wiki input is mode-dependent** (see below); in particular, in a project hub
  the hub's OWN `dev-docs/` — `scoping/**` intake docs and other hub-internal
  synthesis output — is authored truth, not OpenWiki input (ADR 0006), so a
  session that edits only those does NOT warrant a refresh.
  - **Hub mode** (`project.yaml` present): walk only `type: working` repos
    (legacy hubs: entries with neither `type` nor `role` read as working).
    `type: input` repos are raw deliveries and `type: output` repos (including
    any entry carrying `purpose:`) are derived artifacts — neither is wiki
    input, per ADR 0006; the authoritative list is in `openwiki/INSTRUCTIONS.md`.
    The hub's OWN `dev-docs/` is authored truth — architecture, product ADRs,
    runbooks, and `scoping/**` intake docs alike — and likewise stays out of
    the wiki.
  - **Standalone mode** (no `project.yaml` — ADR 0007): the repo's OWN
    `dev-docs/` IS the product knowledge root and counts, as does each
    immediate sub-directory's `dev-docs/`.
  - In **both modes** the freshness hooks exclude `openwiki/` and any
    `dev-docs/tickets/` subtree — `tickets/` is working state, not knowledge
    (a tickets-only session does not warrant a refresh).
- Before starting major cross-repo work, check staleness:
  `openwiki/.last-update.json` vs recent dev-docs activity — refresh first if
  stale.
- Never hand-edit generated wiki pages; when the wiki disagrees with dev-docs,
  dev-docs wins and the wiki gets regenerated.
