---
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
description: "Jira-aware git flow: commit (default), pr (commit + changelog + push + PR via tea), clean (prune [gone] branches and worktrees)"
argument-hint: "[pr | clean]"
---

# /ws-commit — Jira-aware Git Flow

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status`
- Diff (staged + unstaged): !`git diff HEAD`
- Recent commits: !`git log --oneline -10`
- Global config: !`cat ~/.claude/ws/config.yaml 2>/dev/null || echo "(none)"`
- Project config: !`cat ./.claude/ws-project.yaml 2>/dev/null || echo "(none)"`
- Time since branch diverged from main: !`base=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null); if [ -n "$base" ]; then first=$(git log --format=%ct --reverse "$base..HEAD" 2>/dev/null | head -1); if [ -z "$first" ]; then first=$(date +%s); fi; secs=$(( $(date +%s) - first )); printf '%dh %dm\n' $((secs/3600)) $(((secs%3600)/60)); else echo "(no merge-base)"; fi`
- Time since last commit on this branch: !`last=$(git log -1 --format=%ct HEAD 2>/dev/null); if [ -n "$last" ]; then secs=$(( $(date +%s) - last )); printf '%dh %dm\n' $((secs/3600)) $(((secs%3600)/60)); else echo "(no commits)"; fi`

If any Context value above still shows an unexpanded shell command (an exclamation mark followed by a backtick-quoted command), your runtime does not pre-execute context commands — run each one via bash now, before proceeding.

## Routing

The verb is `$1`:

- **empty** → the **commit flow** below (single Jira-aware commit — the historic default)
- **`pr`** → the **PR flow** (commit + CHANGELOG + push + PR + ticket transition)
- **`clean`** → the **clean flow** (prune `[gone]` branches and their worktrees)
- anything else → print usage `/ws-commit [pr | clean]` and stop

This command is hub-independent: it reads only the Jira config and the current
git repo, never `project.yaml`, so it runs identically in a standalone repo
or a hub sub-repo.

## Commit flow (no verb)

Create a single git commit with a Jira-aware message. Steps below.

### 1. Detect Jira ticket

Parse current branch name. If it starts with a Jira key pattern `^([A-Z]+-\d+)`, extract that key as `TICKET`.

If no key in branch:
- Read default project from `~/.claude/ws/config.yaml` and project binding from `./.claude/ws-project.yaml`
- Ask the user (AskUserQuestion (or a plain chat question when that tool is unavailable)):
  - **Use ticket**: enter a ticket key (e.g. `WSC-150`) — most common
  - **No ticket**: proceed without Jira linking (plain Conventional Commits)
  - **Cancel**: abort

### 2. If a ticket is in play

Fetch the ticket via `jira issue view TICKET --raw` (JSON; fall back to `--plain` if `--raw` is unavailable). Read its `summary` and `status.name`. Use the summary as additional context for the commit message body if useful. If the key doesn't exist, surface the CLI error and let the user re-enter.

### 3. Compose Conventional Commits message

Analyze the staged + unstaged diff. Build a CC message. This is the **single definitive layout** — every other step (in both flows) refers back to it:

```
<type>(<scope>): <imperative description> (TICKET)

- bullet of what changed
- another bullet

<TICKET> #time <Xh Ym> #<transition>

Refs: TICKET
Co-Authored-By: WS Agency AI suite <ai@ws.agency>
```

Top to bottom: subject → blank line → body bullets → blank line → Smart Commit line (only when step 4 produces one) → blank line → trailer block (`Refs: TICKET`, then `Co-Authored-By: WS Agency AI suite <ai@ws.agency>`). When an optional part is omitted, its preceding blank line goes with it.

Rules:
- `type`: feat, fix, refactor, chore, docs, test, perf, style, build, ci
- `scope`: short module/file/feature scope
- Subject ≤ 72 chars including the ` (TICKET)` suffix
- Body bullets — only if multiple distinct changes; for single-line changes, skip body
- The trailer block always closes the message (git-trailers convention): `Refs:` only when a ticket is in play; `Co-Authored-By` always

If no ticket, drop the ` (TICKET)` suffix, the Smart Commit line, and the `Refs:` trailer (the `Co-Authored-By` trailer stays).

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
> - Offer the typical next states (To Do → In Progress, In Progress → In Review, In Review → Done) — `jira issue move` accepts the target state name and lists valid states if it doesn't match
> - **No transition**

The chosen actions are performed with **explicit jira-cli calls after the commit succeeds** (step 6a) — the CLI call is the source of truth, not the message trailer.

Additionally, if `defaults.smart_commit_trailer` is `true` (default) in `~/.claude/ws/config.yaml`, include the Smart Commit line at its slot in the step 3 layout (after the body bullets, before the trailer block) — a human-readable record that also works if a Jira dev-connector is ever wired up:

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

⚠️ Double-apply guard: if the repo's Jira has an active dev-connector that ingests Smart Commits, the user should set `smart_commit_trailer: false` — otherwise worklogs/transitions would be applied by both the CLI call and the connector.

### 5. Preview and confirm

Show the user the full commit message. Ask: confirm / edit / cancel.

### 6. Stage and commit

- Stage relevant files (specific paths, NOT `git add -A`/`.` to avoid accidentally including secrets)
- Run `git commit` with the composed message via HEREDOC

### 6a. Apply Jira actions (after the commit succeeds)

Perform the actions chosen in step 4 via jira-cli — one call each, in this order:

- worklog → `jira issue worklog add TICKET "<Xh Ym>" --no-input`
- transition → `jira issue move TICKET "<target state>"`
- optional comment (only when `defaults.commit_comment: true` in `~/.claude/ws/config.yaml` — off by default): `git log -1 --format='%H %s'`, then `jira issue comment add TICKET "Committed <SHA>: <subject>" --no-input`

If a jira-cli call fails, report it and continue — the commit stands; the user can retry the Jira action separately.

### 7. Report

One-line summary:
```
✓ Committed abc1234: feat(auth): add OTP screen (WSC-142)
  worklog: 2h 30m logged   transition: → In Progress
```

### Commit-flow constraints

- Use `git commit -m "$(cat <<'EOF' … EOF)"` HEREDOC for multi-line messages
- The message follows the step 3 layout exactly — `Co-Authored-By: WS Agency AI suite <ai@ws.agency>` is the final trailer line
- Don't include sensitive files (`.env`, credentials, tokens) — warn instead
- All tool calls for the commit happen in a single response after user confirmation

## PR flow (verb = pr)

End-to-end Jira-aware flow: commit → push → open PR → optionally transition the ticket.

### 1. Branch setup

If on `main` / `master`, ask the user for a branch name. If they have a Jira ticket in mind, suggest `<TICKET-KEY>-<slugified-title>` (e.g. `WSC-150-dark-mode-toggle`). Create the branch (`git checkout -b ...`).

### 2. Compose commit

Run the same compose logic as the **commit flow** above (steps 1-4):
- Detect ticket from branch name (now guaranteed if step 1 created one)
- Compose Conventional Commits message with `(TICKET)` suffix
- Optionally add Smart Commit `#time` worklog (ask user, default = elapsed time since branch diverged from main)
- Skip transition here — that happens at PR creation instead (typical workflow: PR open = In Review)

Do NOT commit yet — the changelog update (step 3) goes into the same commit.

### 3. Update CHANGELOG.md

This is the step that distinguishes the PR flow from a plain commit. Changelog updates happen at PR time, consolidating the branch's work.

Read changelog config from `./.claude/ws-project.yaml`:

```yaml
changelog:
  auto_update: true                                   # default true; false = skip this step
  path: CHANGELOG.md
  skip_types: [docs, chore, test, style, build, ci]   # per-project override of the default skip set
```

If `auto_update` is false, skip to step 4.

The `keep-a-changelog` skill auto-loads on the word "CHANGELOG" — follow its formatting rules.

**3a. Determine entries to add.** Two cases:

- **Working tree dirty** (pending changes in this run): one entry for the commit you're about to make. Classify from the CC `type`.
- **Working tree clean** (branch already has commits from prior commit-flow runs): analyze `git log <base>..HEAD --format='%s'` (base = merge-base with main/master). One entry per functional commit. De-duplicate.

**3b. Skip non-functional types.** For each commit/change, map the CC `type`:

| CC type | Changelog section |
|---------|-------------------|
| `feat` | Added |
| `fix` | Fixed |
| `perf`, `refactor`, `revert` | Changed |
| `feat!` / `BREAKING CHANGE` | Changed (prefix entry with `**BREAKING:** `) |
| security fix | Security |

Types in `skip_types` (default `docs, chore, test, style, build, ci`) produce no changelog entry. If every change is skippable, skip the whole step.

**3c. Auto-create if missing.** If `CHANGELOG.md` (or the configured `path`) doesn't exist, create it with the Keep a Changelog header:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
```

**3d. Add entries** to the `[Unreleased]` section, under the correct subsection (create subsections as needed, in order: Added → Changed → Deprecated → Removed → Fixed → Security). Entry text: imperative, capitalized, no trailing period, with the ticket key appended, e.g.:

```markdown
### Added
- Add OTP screen for login (WSC-142)
```

### 4. Commit (code + changelog together)

Stage the relevant code files AND `CHANGELOG.md`, then commit with the message composed in step 2. Single commit — the changelog update rides along.

If the working tree was clean in step 3 (changelog-only change), commit just `CHANGELOG.md` with message `docs(changelog): summarize <TICKET> for release`.

### 4a. Apply Jira actions (after the commit succeeds)

Mirrors the commit flow's step 6a. If the user opted into a worklog in step 2, apply it now via jira-cli:

- worklog → `jira issue worklog add <TICKET> "<Xh Ym>" --no-input`

The transition is NOT applied here — it happens in step 7, after the PR is opened. If the jira-cli call fails, report it and continue — the commit stands; the user can retry the worklog separately.

### 5. Push

`git push -u origin <branch>` (set upstream on first push).

### 6. Open PR via `tea`

Build PR title: `<commit-subject>` (which already includes ` (TICKET)`), e.g.:

```
feat(auth): add OTP screen (WSC-142)
```

PR description includes Jira link section:

```bash
tea pr create --title "feat(auth): add OTP screen (WSC-142)" --description "$(cat <<'EOF'
## Summary
- Validates 6-digit OTP code
- Handles 30s resend timeout

## Jira
[WSC-142](https://wsagency.atlassian.net/browse/WSC-142) — feat: OTP screen for login

## Test plan
- [ ] Manual OTP entry happy path
- [ ] Expired code rejection
- [ ] Resend after timeout

🤖 Generated with WS Agency AI suite
EOF
)" --base main
```

The PR body always ends with the `🤖 Generated with WS Agency AI suite` footer. The commit itself already carries the `Co-Authored-By: WS Agency AI suite <ai@ws.agency>` trailer per the commit flow's layout — do not repeat it in the PR body.

Construct the Jira link from `site` in `~/.claude/ws/config.yaml`. If no ticket, omit the Jira section.

### 7. Transition the ticket (if applicable)

If a ticket exists and `defaults.pr_transition` is set in global config (default: `in-review`):
- Ask the user (AskUserQuestion (or a plain chat question when that tool is unavailable)):
  - **Transition to <target>** (e.g. In Review) — recommended
  - **Skip transition**
- If confirmed, run `jira issue move <TICKET> "<target state>"` (jira-cli lists valid states if the name doesn't match). If the call fails, report it — the PR stands; the user can transition manually.

### 8. Report

```
✓ Committed abc1234: feat(auth): add OTP screen (WSC-142)
  worklog: 2h 30m logged (skipped if the user declined in step 2)
✓ CHANGELOG.md: +1 entry under Added
✓ Pushed to origin/WSC-142-otp-screen
✓ PR opened: https://gitea.ws.agency/wsagency/acme-app/pulls/231
✓ WSC-142 → In Review
```

### PR-flow constraints

- Do all bash steps in a single response after the user confirms the commit message and PR description
- Don't push to main directly; if user is on main and refuses to branch, abort
- If `tea` isn't installed, fall back to printing instructions for opening the PR manually
- Don't transition without explicit user confirmation

## Clean flow (verb = clean)

Clean up all git branches marked as `[gone]` (branches that have been deleted on the remote but still exist locally):

1. Inspect the current state: run `git branch -vv` and `git worktree list`.
2. Fetch and prune remote tracking branches: `git fetch --prune`.
3. Re-run `git branch -vv` and identify the branches marked `: gone]` from the output yourself.
4. For each gone branch:
   - Check if it has an associated worktree and remove it first: `git worktree remove <path>`
   - Then delete the branch: `git branch -D <branch-name>`
5. Report what was cleaned up.

Do not delete the current branch. Switch to main/master first if the current branch is marked as gone. Use only git commands in this flow — no other shell operations are needed.

## When you finish

In two or three sentences, state what the verb did — committed, pushed + opened
a PR, or pruned branches — and where it landed, then point at the next move:
after a plain commit, run `/ws-commit pr` to push and open the PR (and write
the changelog); or `/ws-status` to see what to pick up next.