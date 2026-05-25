---
allowed-tools: Bash, Read, AskUserQuestion, mcp__plugin_atlassian_atlassian__getJiraIssue, mcp__plugin_atlassian_atlassian__addCommentToJiraIssue, mcp__plugin_atlassian_atlassian__getTransitionsForJiraIssue, mcp__plugin_atlassian_atlassian__transitionJiraIssue
description: Create a Jira-aware git commit (Conventional Commits + ticket suffix, optional smart-commit worklog and transition)
---

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status`
- Diff (staged + unstaged): !`git diff HEAD`
- Recent commits: !`git log --oneline -10`
- Global config: !`cat ~/.claude/ws/config.yaml 2>/dev/null || echo "(none)"`
- Project config: !`cat ./.claude/ws-project.yaml 2>/dev/null || echo "(none)"`
- Time since branch diverged from main: !`base=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null); if [ -n "$base" ]; then first=$(git log --format=%ct --reverse "$base..HEAD" 2>/dev/null | head -1); if [ -z "$first" ]; then first=$(date +%s); fi; secs=$(( $(date +%s) - first )); printf '%dh %dm\n' $((secs/3600)) $(((secs%3600)/60)); else echo "(no merge-base)"; fi`
- Time since last commit on this branch: !`last=$(git log -1 --format=%ct HEAD 2>/dev/null); if [ -n "$last" ]; then secs=$(( $(date +%s) - last )); printf '%dh %dm\n' $((secs/3600)) $(((secs%3600)/60)); else echo "(no commits)"; fi`

## Your task

Create a single git commit with a Jira-aware message. Steps below.

### 1. Detect Jira ticket

Parse current branch name. If it starts with a Jira key pattern `^([A-Z]+-\d+)`, extract that key as `TICKET`.

If no key in branch:
- Read default project from `~/.claude/ws/config.yaml` and project binding from `./.claude/ws-project.yaml`
- Ask the user (AskUserQuestion):
  - **Use ticket**: enter a ticket key (e.g. `WSC-150`) — most common
  - **No ticket**: proceed without Jira linking (plain Conventional Commits)
  - **Cancel**: abort

### 2. If a ticket is in play

Fetch the ticket via `mcp__plugin_atlassian_atlassian__getJiraIssue` (cloud_id from config, issueIdOrKey=`TICKET`). Read its `summary` and `status.name`. Use the summary as additional context for the commit message body if useful.

### 3. Compose Conventional Commits message

Analyze the staged + unstaged diff. Build a CC message:

```
<type>(<scope>): <imperative description> (TICKET)

- bullet of what changed
- another bullet

Refs: TICKET
```

Rules:
- `type`: feat, fix, refactor, chore, docs, test, perf, style, build, ci
- `scope`: short module/file/feature scope
- Subject ≤ 72 chars including the ` (TICKET)` suffix
- Body bullets — only if multiple distinct changes; for single-line changes, skip body
- `Refs: TICKET` trailer at end (git-trailers convention)

If no ticket, drop the ` (TICKET)` suffix and `Refs:` trailer.

### 4. Smart Commit additions (only if ticket present)

Read `defaults.jira_actions` from `~/.claude/ws/config.yaml`:
- `never` → skip this step
- `always` → add worklog with elapsed time (no prompt)
- `ask` (default) → ask the user

If asking, present (AskUserQuestion) the user with the **measured elapsed time** as the default:

> Time spent on this branch (since first commit): `Xh Ym`. Add as Jira worklog?
> - **Log this time** (default, editable)
> - **Edit time** (prompt for adjusted value)
> - **Skip worklog**

Then ask about transition:

> Current status: `<status>`. Transition?
> - Show transitions available via `getTransitionsForJiraIssue` and offer relevant ones (typical: To Do → In Progress, In Progress → In Review, In Review → Done)
> - **No transition**

If worklog or transition chosen, append a Smart Commit trailer as the LAST line of the commit body:

```
<TICKET> #time <Xh Ym>[ #<transition-with-hyphens>]
```

Examples:
- `WSC-150 #time 2h 30m` (worklog only)
- `WSC-150 #time 2h 30m #in-progress` (worklog + transition)
- `WSC-150 #in-review` (transition only)

The Smart Commit line must:
- Be a single line
- Have the ticket key first, then `#commands`
- Use hyphens in multi-word transitions (e.g. `#start-progress`, `#in-review`)

### 5. Preview and confirm

Show the user the full commit message. Ask: confirm / edit / cancel.

### 6. Stage and commit

- Stage relevant files (specific paths, NOT `git add -A`/`.` to avoid accidentally including secrets)
- Run `git commit` with the composed message via HEREDOC

### 7. Optional: explicit comment on the Jira issue

If `defaults.jira_actions` includes commenting and the user opted in, after the commit succeeds:
- Run `git log -1 --format='%H %s'` to get the new commit SHA + subject
- Call `mcp__plugin_atlassian_atlassian__addCommentToJiraIssue` with text: `Committed <SHA>: <subject>`

(This is redundant when the dev connector is wired up — JIRA will auto-link via the issue key in the subject. Only do this if explicitly enabled in config.)

### 8. Report

One-line summary:
```
✓ Committed abc1234: feat(auth): add OTP screen (WSC-142)
  worklog: 2h 30m logged   transition: → In Progress
```

### Constraints

- Use `git commit -m "$(cat <<'EOF' … EOF)"` HEREDOC for multi-line messages
- Co-Authored-By footer: `Co-Authored-By: WS Agency AI suite <ai@ws.agency>`
- Don't include sensitive files (`.env`, credentials, tokens) — warn instead
- All tool calls for the commit happen in a single response after user confirmation
