---
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, mcp__plugin_atlassian_atlassian__getJiraIssue, mcp__plugin_atlassian_atlassian__getTransitionsForJiraIssue, mcp__plugin_atlassian_atlassian__transitionJiraIssue
description: Commit (Jira-aware), update CHANGELOG, push, and open a PR with the Jira ticket linked
---

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status`
- Diff: !`git diff HEAD`
- Project config: !`cat ./.claude/ws-project.yaml 2>/dev/null || echo "(none)"`

## Your task

End-to-end Jira-aware flow: commit → push → open PR → optionally transition the ticket.

### 1. Branch setup

If on `main` / `master`, ask the user for a branch name. If they have a Jira ticket in mind, suggest `<TICKET-KEY>-<slugified-title>` (e.g. `WSC-150-dark-mode-toggle`). Create the branch (`git checkout -b ...`).

### 2. Compose commit

Run the same compose logic as `/ws-commit`:
- Detect ticket from branch name (now guaranteed if step 1 created one)
- Compose Conventional Commits message with `(TICKET)` suffix
- Optionally add Smart Commit `#time` worklog (ask user, default = elapsed time since branch diverged from main)
- Skip transition here — that happens at PR creation instead (typical workflow: PR open = In Review)

Do NOT commit yet — the changelog update (step 3) goes into the same commit.

### 3. Update CHANGELOG.md

This is the step that distinguishes the PR flow from a plain `/ws-commit`. Changelog updates happen at PR time, consolidating the branch's work.

Read changelog config from `./.claude/ws-project.yaml`:

```yaml
changelog:
  auto_update: true                                   # default true; false = skip this step
  path: CHANGELOG.md
  skip_types: [docs, chore, test, style, build, ci]   # per-project override of the default skip set
```

If `auto_update` is false, skip to step 4.

The `keep-a-changelog` skill (from docs-agent) auto-loads on the word "CHANGELOG" — follow its formatting rules.

**3a. Determine entries to add.** Two cases:

- **Working tree dirty** (pending changes in this run): one entry for the commit you're about to make. Classify from the CC `type`.
- **Working tree clean** (branch already has commits from prior `/ws-commit` runs): analyze `git log <base>..HEAD --format='%s'` (base = merge-base with main/master). One entry per functional commit. De-duplicate.

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

🤖 Generated with [Claude Code](https://claude.ai/code)
EOF
)" --base main
```

Construct the Jira link from `site` in `~/.claude/ws/config.yaml`. If no ticket, omit the Jira section.

### 7. Transition the ticket (if applicable)

If a ticket exists and `defaults.pr_transition` is set in global config (default: `in-review`):
- Call `mcp__plugin_atlassian_atlassian__getTransitionsForJiraIssue` to find the matching transition
- Ask the user (AskUserQuestion):
  - **Transition to <target>** (e.g. In Review) — recommended
  - **Skip transition**
- If confirmed, call `mcp__plugin_atlassian_atlassian__transitionJiraIssue`

### 8. Report

```
✓ Committed abc1234: feat(auth): add OTP screen (WSC-142)
✓ CHANGELOG.md: +1 entry under Added
✓ Pushed to origin/WSC-142-otp-screen
✓ PR opened: https://gitea.ws.agency/wsagency/acme-app/pulls/231
✓ WSC-142 → In Review
```

### Constraints

- Do all bash steps in a single response after the user confirms the commit message and PR description
- Don't push to main directly; if user is on main and refuses to branch, abort
- If `tea` isn't installed, fall back to printing instructions for opening the PR manually
- Don't transition without explicit user confirmation
