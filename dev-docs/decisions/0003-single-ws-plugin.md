---
status: accepted
date: 2026-07-27
decision-makers: Kristijan Lukačin
---

# 0003 — Merge the four plugins into a single `ws` plugin

## Context and Problem Statement

The marketplace shipped four plugins (docs-agent, ws-commit-commands, ws-matt,
ws-project-hub) that form one product: the ws-matt graph produces tickets, the
commit flow closes them, the docs suite records them, and the hub ties
multi-repo projects together. ADR 0002 already forced all four to share one
version (lockstep), the team installs all four, and cross-plugin references
(ws-implement → the PR flow, /ws-docs → hub-architect) were internal edges
dressed up as plugin boundaries. Fifteen commands and doubled canonical names
(`ws-matt:ws-matt-reviewer`) added surface without adding separation.

## Considered Options

1. **One plugin `ws`, consolidated surface** — merge everything; 7 commands
   (/ws-help, /ws-matt, /ws-docs, /ws-hub, /ws-commit, /ws-status, /ws-init);
   verbs replace command families (/ws-hub <verb>, /ws-commit [pr|clean]);
   agents lose the double prefix (ws:reviewer).
2. **Merge only** — one plugin, keep the 15 commands (two breaking migrations
   over time instead of one).
3. **Keep four plugins** — consolidate commands within existing boundaries.

## Decision Outcome

Option 1, released as v4.0.0. One breaking cut, one team migration:
uninstall the four plugins, install `ws`. Old→new command map lives in the
CHANGELOG 4.0.0 entry.

### Consequences

- Good: one install/update in both harnesses; one version field; canonical
  names `ws:<agent>`; `/ws` autocomplete shows the whole suite; cross-part
  references are plain internal links.
- Bad: no selective install; extracting a part later (e.g. open-sourcing
  ws-matt) requires a split — git history is preserved (`git mv`), so a
  future split remains feasible.
- ADR 0002 (lockstep versioning) still stands and is now trivially satisfied
  with a single plugin; it applies again the moment a second plugin is added.
