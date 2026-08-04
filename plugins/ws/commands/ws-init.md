---
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
description: Bootstrap the WS suite for this user — verify jira-cli setup and bind the current project to a Jira project
---

## Context

- Current directory: !`pwd`
- jira-cli installed: !`command -v jira || echo "(not installed)"`
- jira-cli authenticated: !`jira me 2>/dev/null || echo "(not authenticated)"`
- Existing global config: !`[ -f ~/.claude/ws/config.yaml ] && cat ~/.claude/ws/config.yaml || echo "(none)"`
- Existing project config: !`[ -f ./.claude/ws-project.yaml ] && cat ./.claude/ws-project.yaml || echo "(none)"`
- In a git repo: !`git rev-parse --is-inside-work-tree 2>/dev/null || echo no`

If any Context value above still shows an unexpanded shell command (an exclamation mark followed by a backtick-quoted command), your runtime does not pre-execute context commands — run each one via bash now, before proceeding.

## Your task

Bootstrap the WS marketplace for this user and (if in a project folder) bind the current project to a Jira project. Jira access goes through [jira-cli](https://github.com/ankitpokhrel/jira-cli) — this command verifies the setup but never drives `jira init` itself (it's an interactive TUI).

This command is hub-independent: it never reads `project.yaml`, so it runs
identically whether the repo is standalone or part of a hub.

### 1. jira-cli readiness

Check the context above:

1. **Binary missing** → print the setup steps and abort:
   ```
   brew install ankitpokhrel/jira-cli/jira-cli
   ```
2. **`jira me` failed** → guide the user, then abort (they re-run `/ws-init` after):
   - Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens
   - `export JIRA_API_TOKEN=<token>` (add to shell profile)
   - Run `jira init` — choose **Cloud**, enter the WS site URL, pick the default project
3. **`jira me` succeeded** → proceed.

### 2. Global setup — `~/.claude/ws/config.yaml`

If the global config is missing OR still has the old MCP shape (`cloud_id` / `account_id` keys), (re)write it:

- Derive `site` from the jira-cli config (`~/.config/.jira/.config.yml`, `server:` field) — strip the scheme, e.g. `wsagency.atlassian.net`.

```yaml
jira:
  site: <site-host>
defaults:
  jira_actions: ask          # ask | always | never
  pr_transition: in-review   # transition triggered after /ws-commit pr
  smart_commit_trailer: true # include the #time/#transition trailer in commit messages
  commit_comment: false      # post the commit message as a Jira comment after /ws-commit (off by default)
ui:
  session_start_dashboard: true
```

(`mkdir -p ~/.claude/ws/` first.)

### 3. Per-project setup — `<project>/.claude/ws-project.yaml`

If currently in a git repo, ask the user (AskUserQuestion (or a plain chat question when that tool is unavailable)) whether to bind this project to a Jira project.

If yes:

1. Run `jira project list` and offer the results via AskUserQuestion.
2. Optionally ask for a board id (skippable) and default issue type (Task / Story / Bug).
3. **If `./.claude/ws-project.yaml` already exists** (a re-run — e.g. binding a different project, or returning after step 1 walked you through jira-cli auth): read it and carry the existing `changelog:` and `hooks:` values forward verbatim, updating **only** the `jira:` block (`project`, `board`, `default_issue_type`). Show a diff before writing so the user sees exactly what changed. Never overwrite a team's narrowed `skip_types`, chosen `board`, or disabled dashboard on a re-run.
4. **Otherwise** (first binding), write `./.claude/ws-project.yaml`:

```yaml
jira:
  project: WSC
  board: 42                  # optional
  default_issue_type: Task
changelog:
  auto_update: true                                   # update CHANGELOG.md on /ws-commit pr
  path: CHANGELOG.md
  skip_types: [docs, chore, test, style, build, ci]   # CC types that produce no changelog entry
hooks:
  session_start_dashboard: true   # overrides global default
```

On a first binding, ask the user (AskUserQuestion) whether to enable changelog auto-update and, if they want to narrow the skip set (e.g. only `style, build, ci` so docs/chore/test also get logged), adjust `skip_types` accordingly. On a re-run, skip this prompt — those settings carry forward unless the user asks to revisit them.

(`mkdir -p ./.claude/` first.)

If `.gitignore` exists in the repo, ensure `.claude/ws-project.yaml` is NOT in it (it should be checked in so the whole team shares the binding). Don't modify other gitignore entries.

### 4. Report back

Compact summary:

```
WS marketplace configured
  user: <from jira me>
  site: wsagency.atlassian.net
  project: WSC (binding: ./)
Next steps:
  /ws-status     — show your Jira assignments
  /ws-commit     — Jira-aware commit
```

### Constraints

- Never write tokens or secrets to `~/.claude/ws/config.yaml`. Auth lives entirely in jira-cli (`JIRA_API_TOKEN` + its own config); our config stores only the site host, which is not sensitive.
- If jira-cli setup is incomplete, abort cleanly with the exact steps — no partial config writes.
- If the user already has a valid config, ask whether to reconfigure or just bind a new project.

## When you finish

In two or three sentences, state that the WS suite is configured — Jira user,
site, and the project binding, with the config paths — then point at the next
move: run `/ws-docs init` to scaffold this repo's dual-track docs, then
`/ws-status` to verify the dashboard renders your assignments.
