---
description: Hub OpenWiki freshness discipline — refresh after dev-docs changes
alwaysApply: true
---

# OpenWiki freshness (hub convention)

This hub maintains an OpenWiki (`<hub>/openwiki/`) as the derived knowledge
index. Refresh is AI-driven — there is no CI doing it for you:

- If this session changed anything under a `dev-docs/` tree of a
  `type: working` repo (ADRs, runbooks) or completed a major cross-repo
  change, refresh the wiki before wrapping up:
  `openwiki --update "Refresh; re-scan sub-repos: <list>"` — working repos
  only (`type: input` repos are raw deliveries and `type: output` repos are
  derived artifacts — neither is wiki input, per ADR 0006; the authoritative
  list is in `openwiki/INSTRUCTIONS.md`). The hub's own `dev-docs/` is
  authored truth and likewise stays out of the wiki.
- Before starting major cross-repo work, check staleness:
  `openwiki/.last-update.json` vs recent sub-repo activity — refresh first if
  stale.
- Never hand-edit generated wiki pages; when the wiki disagrees with dev-docs,
  dev-docs wins and the wiki gets regenerated.
