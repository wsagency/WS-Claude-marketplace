---
allowed-tools: Task, Read, Bash(git log:*)
description: Generate cross-repo architecture, contracts, and deployment docs via the hub-architect agent
---

## Your task

Produce or refresh the hub's cross-repo documentation by dispatching the `hub-architect` agent.

1. Read `./project.yaml` with the Read tool. If it's missing, abort with a hint to run `/ws-hub-init` first.

2. Spawn the `hub-architect` agent via the Task tool, running from the hub directory. Its job is defined in its own prompt: analyze every accessible sub-repo registered in `project.yaml` and produce/refresh the cross-repo docs — `architecture.md`, plus `contracts.md` (only if shared contracts exist) and `deployment.md` (only if deployment files are found). Pass along any focus the user asked for (e.g. "just refresh deployment").

3. Relay the agent's report to the user: files written, key cross-repo findings, and anything flagged for human attention.

Docs placement note: at v0.2.0 docs land where the agent targets them today (a registered docs sub-repo when one is present and accessible, otherwise the cross-repo notes section of the hub's `CLAUDE.md`). Dedicated docs-repo targeting via `role: docs` in `project.yaml` arrives in v0.3.0.
