---
allowed-tools: Bash, Read, Glob
description: Short guide to the WS system — what to use when, and where to start
---

## Your task

Print a SHORT orientation guide to the WS system. First run project shape
detection (see the **project-hub-conventions** skill, "Project shape detection"
— walk up from the working directory for a `project.yaml`) to learn whether you
are at a hub root, inside a hub sub-repo, or standalone, then adapt the guide to
what exists (`dev-docs/`, `.omp/`, `project.yaml`, `openwiki/`). Keep it under
one screen. Base shape:

```
WS system — quick guide
──────────────────────────────────────────────
START HERE
  /ws-matt              graph status + suggested entry point
  /ws-matt ask          router: "what should I pick up?"
  /ws-init              optional — only if you use Jira: bind the project (ws-commit/status use it)
  Typical flow: idea → /ws-matt grill → (spec → tickets) → implement

DAILY WORK
  /ws-matt implement    execute one ticket (tdd → review)
  /ws-commit pr         commit + changelog + PR + Jira (end of every branch)
  /ws-status            your Jira assignments
  Tickets live in dev-docs/tickets/open/ (done/ is archive)

DOCUMENTATION (writes itself as you work)
  Decisions → ADR in dev-docs/decisions/ (lightweight default; born in grill)
  /ws-docs              status of all docs artifacts
  openwiki/quickstart.md  ← READ BEFORE exploring code (hub root; ../openwiki/ from a sub-repo)

HUB (optional — multi-repo only)
  ./invoke-ai.sh        launcher with agent picker (claude/omp)
  /ws-hub status        git overview across all repos
  /ws-hub doctor        pull everything + readiness check
  /ws-hub update        migrate hub conventions to the latest version
  /ws-hub add --scan    register another repo into this hub
  /ws-hub intake        process a client delivery into hub knowledge
  /ws-hub docs          cross-repo docs + wiki refresh

omp KEYWORDS (just write the word in your prompt)
  orchestrate = multi-agent run    workflowz = batch over N items
  ultrathink = max reasoning for one hard problem

Multi-repo? /ws-hub init in the parent directory creates a hub and adopts existing repos.

First skill to learn: /ws-matt grill — everything else follows.
Details: docs/how-to/ in the marketplace (omp-setup, use-with-omp).
```

Omit sections that don't apply (no hub → skip HUB; already in a hub root or
sub-repo → skip the Multi-repo line; no openwiki → skip that line; not on omp
→ skip keywords). Do not write anything — display only.
