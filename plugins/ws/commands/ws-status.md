---
allowed-tools: Bash, Read
description: Show your Jira assignments and suggest the next task to pick up
---

## Context

- Global config: !`cat ~/.claude/ws/config.yaml 2>/dev/null || echo "(missing — run /ws-init)"`
- Project config: !`cat ./.claude/ws-project.yaml 2>/dev/null || echo "(no project binding)"`
- Current branch: !`git branch --show-current 2>/dev/null || echo "(not a repo)"`

If any Context value above still shows an unexpanded shell command (an exclamation mark followed by a backtick-quoted command), your runtime does not pre-execute context commands — run each one via bash now, before proceeding.

## Your task

Show the user their current Jira workload and suggest what to pick up next.

This command is hub-independent: it reads only the Jira config and the current
git branch, never `project.yaml`, so it runs identically in a standalone repo,
a hub sub-repo, or at the hub root.

### 1. Verify setup

If `~/.claude/ws/config.yaml` is missing, abort and tell the user to run `/ws-init` first. If `jira me` fails, same — `/ws-init` walks them through jira-cli setup.

Read the project binding (if present) from `./.claude/ws-project.yaml`.

### 2. Fetch assignments

Run jira-cli. Build the JQL as a filter clause, **then** append `ORDER BY` —
the project clause goes inside the filter, before `ORDER BY` (appending it
after `ORDER BY ...` is a Jira parse error):

- Base filter: `assignee = currentUser() AND statusCategory != Done`
- If a project binding exists, add `AND project = <KEY>` to the filter, before `ORDER BY`.
- Final JQL: `<filter> ORDER BY priority DESC, updated DESC`

```bash
jira issue list -q 'assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC, updated DESC' \
  --plain --no-headers --columns KEY,TYPE,STATUS,PRIORITY,SUMMARY --paginate 0:50
# scoped to the bound project WSC, the JQL becomes:
#   assignee = currentUser() AND statusCategory != Done AND project = WSC ORDER BY priority DESC, updated DESC
```

If the plain columns prove insufficient (e.g. sprint info needed), use `--raw` and parse the JSON instead.

### 3. Render compact dashboard

Group by status:

```
━━━ Your Jira Workload — WSC ━━━

🔴 In Progress (2)
  WSC-142  feat: OTP screen for login                 ▲ High
           branch: WSC-142-otp-screen (you're here)
  WSC-138  fix: token refresh race condition          ▲ High

🟡 To Do (5)
  WSC-150  feat: dark mode toggle                     ◆ Medium
  WSC-149  chore: upgrade React Native to 0.74        ◆ Medium
  WSC-145  docs: API contract for v2 endpoints        ▽ Low
  ... (+2 more)

🔵 In Review (1)
  WSC-130  feat: biometric auth                       ▲ High

Suggested next: WSC-150 (next priority, no blockers)
  → git checkout -b WSC-150-dark-mode-toggle
```

Markers:
- 🔴 In Progress / red dot
- 🟡 To Do / yellow
- 🔵 In Review / blue
- ⏸  Blocked / pause icon
- ▲ High / Highest, ◆ Medium, ▽ Low / Lowest

If current branch matches a `^[A-Z]+-\d+` pattern, mark that ticket with `(you're here)`.

### 4. Suggestion logic

For "Suggested next":
- First "In Progress" ticket → resume that one
- Else top "To Do" by priority, excluding tickets with status "Blocked" or labels containing "blocked"
- If multiple at same priority, prefer ones in the active sprint
- Print the `git checkout -b <key>-<slugified-title>` command so the user can copy

### 5. Cache

After rendering, cache the result to `~/.cache/ws-hub/status.txt` (`mkdir -p ~/.cache/ws-hub/` first — the directory is only auto-created inside a hub) with a timestamp header so the SessionStart hook can show a stale snapshot quickly without a Jira roundtrip.

Read-only — no Jira writes.

## When you finish

In two or three sentences, summarize the user's headline workload (counts per
status) and name the single suggested next ticket with its
`git checkout -b` command, then point at the move: pick the ticket up via
`/ws-matt implement` (or `/ws-matt ask` to re-rank); if a branch is already
in flight, run `/ws-commit pr` to land it first.
