---
allowed-tools: Bash, Read, mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql, mcp__plugin_atlassian_atlassian__atlassianUserInfo
description: Show your Jira assignments and suggest the next task to pick up
---

## Context

- Global config: !`cat ~/.claude/ws/config.yaml 2>/dev/null || echo "(missing — run /ws-init)"`
- Project config: !`cat ./.claude/ws-project.yaml 2>/dev/null || echo "(no project binding)"`
- Current branch: !`git branch --show-current 2>/dev/null || echo "(not a repo)"`

## Your task

Show the user their current Jira workload and suggest what to pick up next.

### 1. Verify setup

If `~/.claude/ws/config.yaml` is missing, abort and tell the user to run `/ws-init` first.

Read `account_id`, `cloud_id`, and (if present) the project binding from `./.claude/ws-project.yaml`.

### 2. Fetch assignments

Run `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` with:

```
assignee = currentUser() AND statusCategory != Done
ORDER BY priority DESC, updated DESC
```

If a project binding exists, scope it: `AND project = <KEY>`.

Request fields: `summary, status, priority, issuetype, sprint, updated, parent`.

Limit to 50.

### 3. Render compact dashboard

Group by status category:

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

If current branch matches a `WSC-\d+` pattern, mark that ticket with `(you're here)`.

### 4. Suggestion logic

For "Suggested next":
- First "In Progress" ticket → resume that one
- Else top "To Do" by priority, excluding tickets with status "Blocked" or labels containing "blocked"
- If multiple at same priority, prefer ones in the active sprint
- Print the `git checkout -b <key>-<slugified-title>` command so the user can copy

### 5. Cache

After rendering, cache the result to `~/.cache/ws-hub/status.txt` with a timestamp header so the SessionStart hook can show a stale snapshot quickly without an MCP roundtrip.

Read-only — no Jira writes.
