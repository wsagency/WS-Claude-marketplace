---
allowed-tools: Read, Glob
description: Short guide to the WS system — what to use when, and where to start
---

## Your task

Print a SHORT orientation guide to the WS stack (adapt to what exists in the
current project — check for `dev-docs/`, `.omp/`, a hub `project.yaml`,
`openwiki/`). Keep it under one screen. Base shape:

```
WS system — quick guide
──────────────────────────────────────────────
START HERE
  /ws-matt              graph status + suggested entry point
  /ws-matt ask          router: "what should I pick up?"
  Typical flow: idea → /ws-matt grill → (spec → tickets) → implement

DAILY WORK
  /ws-matt implement    execute one ticket (tdd → review)
  /ws-commit pr         commit + changelog + PR + Jira (end of every branch)
  /ws-status            your Jira assignments
  Tickets live in dev-docs/tickets/open/ (done/ is archive)

DOCUMENTATION (writes itself as you work)
  Decisions → ADR in dev-docs/decisions/ (lightweight default; born in grill)
  /ws-docs              status of all docs artifacts
  openwiki/quickstart.md  ← READ BEFORE exploring code (hub)

HUB (multi-repo projects)
  ./invoke-ai.sh        launcher with agent picker (claude/omp)
  /ws-hub status        git overview across all repos
  /ws-hub doctor        pull everything + readiness check
  /ws-hub docs          cross-repo docs + wiki refresh

omp KEYWORDS (just write the word in your prompt)
  orchestrate = multi-agent run    workflowz = batch over N items
  ultrathink = max reasoning for one hard problem

First skill to learn: /ws-matt grill — everything else follows.
Details: docs/how-to/ in the marketplace (omp-setup, use-with-omp).
```

Omit sections that don't apply (no hub → skip HUB; no openwiki → skip that
line; not on omp → skip keywords). Do not write anything — display only.
