---
allowed-tools: Bash, Read, Write, Edit
description: Show the configured tracker workload and suggest the next ready task
---

## Context

- Canonical policy: !`cat ./.wsagency/config.yaml 2>/dev/null || echo "(missing)"`
- Current branch: !`git branch --show-current 2>/dev/null || echo "(not a repo)"`

If a Context command was not expanded, run it now. Do not read
`~/.claude/ws/config.yaml`, `.claude/ws-project.yaml`, or any other legacy
configuration as a fallback.

## Your task

Show the current workload from the tracker owned by `.wsagency/config.yaml` and
suggest one ready item.

### 1. Request tracker readiness

Resolve the installed ws plugin root, import
`skills/ws-project-bootstrap/consumer.mjs`, and call
`inspectCanonicalCapability({ root, capability: "tracker", snapshot })`.
Build `snapshot` only for the selected tracker after first validating the
canonical `config` capability:

- Local: inspect the local ticket store. Check Jira capability only when
  `jira.sync` is `all_local_tickets`, and include pending/conflict counts from
  the local mapping metadata.
- GitHub: include the git origin and the result of the `gh` capability check.
- GitLab: include the git origin and the result of the `glab` capability check.
- Jira: include only the `jira-cli` authentication/project capability.

Request `dashboard` separately only when deciding whether to refresh the
SessionStart cache. Dashboard readiness never blocks the tracker workload.
Read its `ui.session_start_dashboard` value exactly; do not assume it is on.

Never probe an unrelated integration. If readiness is false, print its blocker
verbatim. This names any detected repository-local legacy source and directs
the user to `/ws-setup`; stop without reading legacy policy or guessing a
tracker. Report the returned canonical ownership line even when blocked.

The returned config is policy; `dev-docs/agents/issue-tracker.md` is its
operational adapter. The adapter never overrides config values.

### 2. Synchronize the Local/Jira boundary

When Local is primary and `jira.sync` is `all_local_tickets`, load the local
ticket mapping and pending metadata and call
`runCanonicalSynchronizedTrackerOperation` from the same module with
`operation: null` before reading the queue. Persist the returned mapping and
pending state. Use the real jira-cli adapter. Show the exact pending remote
writes and confirm immediately before retrying them.

- Retry pending synchronization first.
- A Jira outage leaves the Local read available and preserves pending work;
  display the readiness warning.
- An unresolved same-field conflict stops before overwrite. Show both values
  and offer exactly Local, Jira, or manual merge; rerun with the chosen
  `conflictChoices`.
- Never send claims, session shares, map pointers, agent state, or other
  local-only metadata to Jira.

### 3. Fetch the configured queue

Follow the operational adapter and use only the selected backend:

- Local: read `dev-docs/tickets/open/*.md`. A ticket is ready when every item
  named by `Blocked by:` is present under `dev-docs/tickets/done/`. Use the
  canonical `triage.labels` values when grouping status.
- GitHub: use `gh issue list` against the origin identity returned by readiness.
- GitLab: use `glab issue list` against the origin identity returned by
  readiness.
- Jira: query `assignee = currentUser() AND statusCategory != Done AND project
  = <jira.project> ORDER BY priority DESC, updated DESC`. Keep the project
  clause before `ORDER BY`.

This command is read-only except for retrying and durably recording configured
Local/Jira synchronization.

### 4. Render and suggest

Start with:

```text
Tracker owner: .wsagency/config.yaml
Primary tracker: <local | github | gitlab | jira>
Tracker readiness: <ready | degraded | blocked>
Session dashboard: <disabled | ready | blocked: reason>
```

Then group items by the canonical triage roles, show compact counts, mark the
current branch's matching ticket, and name one suggestion:

1. Resume an in-progress, unblocked item.
2. Otherwise choose the highest-priority ready item.
3. Break ties by oldest updated time.

For Local, suggest the ticket path. For a remote tracker, suggest its issue key
or URL. Refresh `~/.cache/ws-hub/status.txt` only when the separately requested
dashboard capability is ready and enabled; otherwise skip the cache and report
why. This cache is presentation state only and is never a policy source.

## When you finish

In two or three sentences, state the primary tracker, readiness or precise
capability blocker, headline counts, and the single suggested next item. Route
a ready item to `/ws-matt implement`; if the current branch is already in
flight, route to `/ws-commit pr`.
