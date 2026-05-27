---
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, mcp__plugin_atlassian_atlassian__authenticate, mcp__plugin_atlassian_atlassian__complete_authentication, mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources, mcp__plugin_atlassian_atlassian__atlassianUserInfo, mcp__plugin_atlassian_atlassian__getVisibleJiraProjects
description: Bootstrap WS marketplace — connect Jira via OAuth and configure per-project Jira binding
---

## Context

- Current directory: !`pwd`
- Existing global config: !`[ -f ~/.claude/ws/config.yaml ] && cat ~/.claude/ws/config.yaml || echo "(none)"`
- Existing project config: !`[ -f ./.claude/ws-project.yaml ] && cat ./.claude/ws-project.yaml || echo "(none)"`
- In a git repo: !`git rev-parse --is-inside-work-tree 2>/dev/null || echo no`

## Your task

Bootstrap the WS marketplace for this user and (if in a project folder) bind the current project to a Jira project.

### 1. Global setup — `~/.claude/ws/config.yaml`

If the global config doesn't exist yet OR Atlassian auth is missing:

1. Invoke `mcp__plugin_atlassian_atlassian__authenticate` to start the OAuth flow. The user will be redirected to authorize. Wait for them to confirm.
2. Call `mcp__plugin_atlassian_atlassian__complete_authentication` to finalize.
3. Call `mcp__plugin_atlassian_atlassian__atlassianUserInfo` to fetch the user's `account_id`, display name, and email.
4. Call `mcp__plugin_atlassian_atlassian__getAccessibleAtlassianResources` to list available Atlassian sites; if more than one, ask the user to pick the WS site via AskUserQuestion.

Write `~/.claude/ws/config.yaml`:

```yaml
atlassian:
  site: <selected-site>.atlassian.net
  cloud_id: <cloud-id-from-resources>
  account_id: <from-userinfo>
  display_name: <from-userinfo>
defaults:
  jira_actions: ask          # ask | always | never
  pr_transition: in-review   # transition triggered after /ws-commit-push-pr
  commit_format: cc-suffix   # cc-suffix | cc-prefix
ui:
  session_start_dashboard: true
```

(`mkdir -p ~/.claude/ws/` first.)

### 2. Per-project setup — `<project>/.claude/ws-project.yaml`

If currently in a git repo, ask the user (AskUserQuestion) whether to bind this project to a Jira project.

If yes:

1. Call `mcp__plugin_atlassian_atlassian__getVisibleJiraProjects` (filter by the chosen `cloud_id`); offer the list via AskUserQuestion.
2. Optionally ask for a board id (skippable) and default issue type (Task / Story / Bug).
3. Write `./.claude/ws-project.yaml`:

```yaml
jira:
  project: WSC
  cloud_id: <cloud-id>
  board: 42                  # optional
  default_issue_type: Task
changelog:
  auto_update: true                                   # update CHANGELOG.md on /ws-commit-push-pr
  path: CHANGELOG.md
  skip_types: [docs, chore, test, style, build, ci]   # CC types that produce no changelog entry
hooks:
  session_start_dashboard: true   # overrides global default
```

Ask the user (AskUserQuestion) whether to enable changelog auto-update and, if they want to narrow the skip set (e.g. only `style, build, ci` so docs/chore/test also get logged), adjust `skip_types` accordingly.

(`mkdir -p ./.claude/` first.)

If `.gitignore` exists in the repo, ensure `.claude/ws-project.yaml` is NOT in it (it should be checked in so the whole team shares the binding). Don't modify other gitignore entries.

### 3. Report back

Compact summary:

```
WS marketplace configured
  user: Kristijan Lukačin <kristijan@ws.agency>
  site: wsagency.atlassian.net
  project: WSC (binding: ./)
Next steps:
  /ws-status     — show your Jira assignments
  /ws-commit     — Jira-aware commit
```

### Constraints

- Never write tokens or secrets to `~/.claude/ws/config.yaml`. Authentication state lives in the Atlassian MCP server itself; this config only stores the account_id and site, which are not sensitive.
- If OAuth fails or the user cancels, abort cleanly and tell them to retry.
- If the user already has a valid config, ask whether to reconfigure or just bind a new project.
