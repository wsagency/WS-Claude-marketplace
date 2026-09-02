---
name: ws-jira-conventions
description: WS Agency Jira commit/branch/PR conventions. Use when working with Jira tickets, writing commits that reference issue keys (e.g. WSC-123), naming branches, or composing PR titles. Documents the project's Conventional Commits + Jira suffix format and Smart Commit syntax.
---

# WS Agency Jira Conventions

How we link git activity to Jira at WS Agency. Aligns with Atlassian's official Smart Commits and dev-connector recognition rules.

## Branch naming

```
<TICKET-KEY>-<slugified-summary>
```

Examples:
- `WSC-142-otp-screen`
- `WSC-138-token-refresh-race`
- `WSC-150-dark-mode-toggle`

Ticket key first → Jira auto-detects via the GitHub/Bitbucket/Gitea dev connector. Key MUST be uppercase.

## Commit messages

Format: **Conventional Commits + Jira suffix**.

```
<type>(<scope>): <imperative description> (<TICKET-KEY>)

- optional body bullets

Refs: <TICKET-KEY>
```

Examples:

```
feat(auth): add OTP screen for login (WSC-142)

- validates 6-digit code
- handles 30s resend timeout

Refs: WSC-142
```

```
fix(api): handle expired token race (WSC-138)

Refs: WSC-138
```

Rules:
- `type`: feat, fix, refactor, chore, docs, test, perf, style, build, ci
- Subject ≤ 72 chars including ` (WSC-XXX)` suffix
- Ticket key uppercase, in parens at end of subject
- `Refs:` trailer at the end of the body (git-trailers convention)

## Smart Commits (optional record, not the mechanism)

Since the jira-cli migration, worklogs/transitions/comments are applied by **explicit jira-cli calls** (`jira issue worklog add`, `jira issue move`, `jira issue comment add`) — the trailer below is a human-readable record in the commit body, included when canonical `commit.jira.smart_commit_trailer` is `true`.

If your Jira has an active dev-connector that ingests Smart Commits from this repo, use `/ws-setup reconfigure` to set `commit.jira.smart_commit_trailer: false`; otherwise the connector and the CLI would apply worklogs/transitions twice.

The trailer is a single line in the commit body:

```
<TICKET-KEY> #time <duration> #<transition>
```

Three commands (per [Atlassian docs](https://support.atlassian.com/jira-software-cloud/docs/process-issues-with-smart-commits/)):

| Command | Syntax | Example |
|---------|--------|---------|
| Comment | `#comment <text>` | `WSC-142 #comment fixed indent` |
| Worklog | `#time 1w 2d 4h 30m <text>` | `WSC-142 #time 2h 30m worked on auth` |
| Transition | `#<name-with-hyphens>` | `WSC-142 #in-review`, `WSC-142 #close` |

Combine on one line, ticket key first:

```
WSC-142 #time 2h 30m #in-progress
```

Multiple tickets: `WSC-142 WSC-143 #resolve`.

## PR conventions

- PR title = commit subject (already includes `(TICKET-KEY)`)
- PR description includes a **Jira** section with link to ticket
- On PR open, transition ticket: To Do / In Progress → **In Review**

## Changelog

Changelog updates happen at **PR time** (`/ws-commit pr`), not on every commit — this keeps feature-branch commits clean and consolidates the branch's work into the changelog when it's ready to merge.

- Follows [Keep a Changelog](https://keepachangelog.com/) format, entries go under `[Unreleased]`
- `CHANGELOG.md` is auto-created if missing
- CC type → section: `feat`→Added, `fix`→Fixed, `perf`/`refactor`/`revert`→Changed, security→Security, breaking→Changed (prefixed `**BREAKING:**`)
- Skipped by default: `docs, chore, test, style, build, ci` — configurable through canonical `changelog.skip_types` in `.wsagency/config.yaml`
- Entry text includes the ticket key: `- Add OTP screen for login (WSC-142)`

The `keep-a-changelog` skill (ws plugin) auto-loads on the word "CHANGELOG" and guides formatting — no manual invocation needed.

## Time tracking

The `/ws-commit` command computes elapsed time as a proxy for AI session work:

- Default: time since the **first commit on this branch** (branch diverged from main)
- Fallback: time since the last commit on this branch
- User can edit or skip

This isn't a stopwatch — it's a defensible approximation that captures the wall-clock duration of focused work on the ticket. Better than no worklog; the user can always adjust.

## What Jira actually requires for linking

Per Atlassian docs:
- Issue key must be **present** in the message and **uppercase**
- Placement is flexible (start, middle, suffix in parens — all link)
- Smart Commit actions need `#command` on a single line, after the ticket key
- Branch names with the key prefix link automatically

So `feat(scope): description (WSC-142)` is fully linkable. The Smart Commit trailer is an addition, not a replacement.
