---
description: Hub OpenWiki freshness discipline — refresh after dev-docs changes
alwaysApply: true
---

# OpenWiki freshness (hub convention)

This repo maintains an OpenWiki (`openwiki/`) as the derived knowledge
index. Refresh is AI-driven — there is no CI doing it for you:

- If this session changed anything under a `dev-docs/` tree that the wiki
  indexes (ADRs, runbooks, scoping docs), refresh the wiki before wrapping up:
  `openwiki --update "Refresh; re-scan sub-repos: <list>"`.
  - **Hub mode** (`project.yaml` present): walk only `type: working` repos
    (legacy hubs: entries with neither `type` nor `role` read as working).
    `type: input` repos are raw deliveries and `type: output` repos (including
    any entry carrying `purpose:`) are derived artifacts — neither is wiki
    input, per ADR 0006; the authoritative list is in `openwiki/INSTRUCTIONS.md`.
    The hub's OWN `dev-docs/` is authored truth and likewise stays out of the
    wiki.
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
