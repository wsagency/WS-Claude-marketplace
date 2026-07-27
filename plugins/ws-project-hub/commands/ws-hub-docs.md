---
allowed-tools: Task, Read, Bash(git log:*)
description: Generate cross-repo architecture, contracts, and deployment docs via the hub-architect agent
---

## Your task

After the cross-repo docs are generated: if `<hub>/openwiki/` exists, offer to
refresh the hub knowledge wiki. Refresh MUST use an explicit prompt (sub-repo
commits are invisible to hub git, so plain `--update` would skip as "no
changes"): build the sub-repo list from `project.yaml` and run
`openwiki --update "Refresh the wiki; re-scan these sub-repos for changes: <name>, <name>, ..."`.
Report what OpenWiki changed (it prints its own summary) and remind that the
`<!-- OPENWIKI:START/END -->` context-file blocks are tool-managed. Refresh is
AI-driven by convention (no CI): also offer it proactively when the wiki is
stale before major cross-repo work (`openwiki/.last-update.json` vs recent
sub-repo commits), and after any significant dev-docs change — not only after
doc-generation runs.

Produce or refresh the hub's cross-repo documentation by dispatching the `hub-architect` agent.

1. Read `./project.yaml` with the Read tool. If it's missing, abort with a hint to run `/ws-hub-init` first.

2. Spawn the `hub-architect` agent via the Task tool (omp: its task agent), running from the hub directory. Its job is defined in its own prompt: analyze every accessible sub-repo registered in `project.yaml` and produce/refresh the cross-repo docs — `architecture.md`, plus `contracts.md` (only if shared contracts exist) and `deployment.md` (only if deployment files are found). Pass along any focus the user asked for (e.g. "just refresh deployment").

3. Relay the agent's report to the user: files written, key cross-repo findings, and anything flagged for human attention.

Docs placement note: outputs go to the `role: docs` repo's `dev-docs/` when `project.yaml` registers one, otherwise to the hub's `dev-docs/` (never a hub `docs/` — hubs must not have one).

Scope note: this command produces the cross-repo SYNTHESIS layer only. Per-repo docs maintenance across the whole hub (status, catchup, repair — one subagent per sub-repo) is `/ws-docs` invoked at the hub root (hub sweep).
