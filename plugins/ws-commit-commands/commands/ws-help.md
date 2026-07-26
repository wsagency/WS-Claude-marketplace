---
allowed-tools: Read, Glob
description: Short guide to the WS system — what to use when, and where to start
---

## Your task

Print a SHORT orientation guide to the WS stack (adapt to what exists in the
current project — check for `dev-docs/`, `.omp/`, a hub `project.yaml`,
`openwiki/`). Keep it under one screen. Base shape:

```
WS sustav — brzi vodič
──────────────────────────────────────────────
POČNI OVDJE
  /ws-matt              graf status + prijedlog ulaza
  /ws-matt ask          router: "što da uzmem?"
  Tipičan tok: ideja → /ws-matt grill → (spec → tickets) → implement

DNEVNI RAD
  /ws-matt implement    izvrši jedan ticket (tdd → review)
  /ws-commit-push-pr    commit + changelog + PR + Jira (kraj svake grane)
  /ws-status            tvoji Jira zadaci
  Ticketi žive u dev-docs/tickets/open/ (done/ je arhiva)

DOKUMENTACIJA (piše se sama uz rad)
  Odluke → ADR u dev-docs/decisions/ (lagani default; nastaju kroz grill)
  /ws-docs              status svih docs artefakata
  openwiki/quickstart.md  ← ČITAJ PRIJE istraživanja koda (hub)

HUB (multi-repo projekti)
  ./invoke-ai.sh        launcher s izborom agenta (claude/omp)
  /ws-hub-status        git pregled svih repoa
  /ws-hub-docs          cross-repo docs + wiki refresh

omp KEYWORDI (samo napiši riječ u promptu)
  orchestrate = multi-agent run    workflowz = batch nad N stavki
  ultrathink = maksimalni reasoning za tvrd problem

Prvi skill za naučiti: /ws-matt grill — sve ostalo dolazi samo.
Detalji: docs/how-to/ u marketplaceu (omp-setup, use-with-omp).
```

Omit sections that don't apply (no hub → skip HUB; no openwiki → skip that
line; not on omp → skip keywords). Do not write anything — display only.
