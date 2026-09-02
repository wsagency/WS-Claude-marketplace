---
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
description: "Canonical-policy git flow: commit, pull request, or stale-branch cleanup"
argument-hint: "[pr | clean]"
---

# /ws-commit — Canonical-policy Git Flow

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status`
- Diff (staged + unstaged): !`git diff HEAD`
- Recent commits: !`git log --oneline -10`
- Canonical policy: !`cat ./.wsagency/config.yaml 2>/dev/null || echo "(missing)"`
- Time since branch diverged from main: !`base=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null); if [ -n "$base" ]; then first=$(git log --format=%ct --reverse "$base..HEAD" 2>/dev/null | head -1); if [ -z "$first" ]; then first=$(git log -1 --format=%ct "$base" 2>/dev/null); fi; secs=$(( $(date +%s) - first )); printf '%dh %dm\n' $((secs/3600)) $(((secs%3600)/60)); else echo "(no merge-base)"; fi`
- Time since last commit on this branch: !`last=$(git log -1 --format=%ct HEAD 2>/dev/null); if [ -n "$last" ]; then secs=$(( $(date +%s) - last )); printf '%dh %dm\n' $((secs/3600)) $(((secs%3600)/60)); else echo "(no commits)"; fi`

If a Context command was not expanded, run it now. Never read
`~/.claude/ws/config.yaml`, `.claude/ws-project.yaml`, or another legacy source
as policy or fallback.

## Routing

The verb is `$1`:

- empty → commit flow;
- `pr` → commit if needed, update the configured changelog when applicable,
  push, and open a pull request;
- `clean` → prune gone branches and their worktrees;
- anything else → print `/ws-commit [pr | clean]` and stop.

The clean flow is repository maintenance and does not need project-policy
readiness. Every other flow first follows the capability contract below.

## Canonical capability contract

Resolve the installed ws plugin root and import
`skills/ws-project-bootstrap/consumer.mjs`.

1. Call `inspectCanonicalCapability({ root, capability: "commit" })`. If it is
   blocked, print its canonical ownership line and blocker verbatim, then stop.
   A missing capability with legacy state therefore names the exact
   repository-local source and directs the user to `/ws-setup`.
2. Read commit behavior only from the returned `commit.jira` object. There are
   no runtime defaults.
3. Request `changelog` separately only when the selected flow can update it.
   Read `update_mode`, `path`, and `skip_types` only from that result.
4. Request `jira_commit` only when a Jira ticket is actually in play and
   `commit.jira.actions` is not `disabled`. Build that snapshot from the
   `jira-cli` capability only. A Jira outage blocks Jira enrichment/actions,
   not the local git commit; report the blocker and omit those actions.
5. Read `tracker.pull_requests` from the validated canonical config when
   drafting the PR report. It controls whether the resulting PR enters tracker
   triage; it does not silently enable intake.

`.wsagency/config.yaml` owns policy. Jira authentication/site state remains
machine-owned by jira-cli and is never copied into or recovered from repository
or user-global legacy config.

## Shared commit composition

### Guard and ticket

For a plain commit, stop with `Nothing to commit — working tree clean.` before
ticket or integration work when the diff is empty.

Parse a Jira-shaped key from the branch prefix (`^([A-Z]+-\d+)`). If there is
no branch key, offer a ticket only when canonical policy has a Jira binding and
Jira commit actions are enabled; otherwise compose a plain Conventional Commit.
The user may always choose no ticket or cancel.

When Jira capability is ready, fetch a chosen ticket with
`jira issue view <KEY> --raw` (fall back to `--plain`). When it is unavailable,
retain the key as a commit reference but do not invent ticket metadata,
worklogs, comments, or transitions.

### Message

Compose:

```text
<type>(<scope>): <imperative description> (<TICKET>)

- optional distinct change bullets

<TICKET> #time <Xh Ym> #<transition>

Refs: <TICKET>
Co-Authored-By: WS Agency AI suite <ai@ws.agency>
```

- Subject length is at most 72 characters including the optional ticket suffix.
- Types are `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`,
  `style`, `build`, and `ci`.
- Omit the ticket suffix, Smart Commit line, and `Refs:` when no ticket exists.
- Include the Smart Commit line only when canonical
  `commit.jira.smart_commit_trailer` is true and at least one Jira action was
  selected.
- `Co-Authored-By` is always the final trailer.

### Jira actions

Use canonical `commit.jira.actions` exactly:

- `disabled` → no Jira action or Jira prompt;
- `always` → stage the configured worklog action without prompting;
- `ask` → ask whether to use or edit the measured time, or skip it.

The first worklog on a branch uses time since divergence; later worklogs use
time since the last branch commit so intervals do not overlap. Ask separately
about a transition when appropriate. After the commit succeeds, perform the
approved calls in order:

```text
jira issue worklog add <TICKET> "<Xh Ym>" --no-input
jira issue move <TICKET> "<target state>"
jira issue comment add <TICKET> "Committed <SHA>: <subject>" --no-input
```

The comment runs only when canonical `post_commit_comment` is true. A failed
Jira call is reported and does not undo the commit.

## Commit flow

1. Apply the clean-tree guard.
2. Validate the `commit` capability and perform ticket/Jira capability work as
   narrowly described above.
3. Request `changelog`. Update it before committing only when
   `changelog.update_mode` is `commit`; skip it for `pull_request` or
   `disabled`. Use the configured path and skip types exactly.
4. Preview the full message, relevant files, optional changelog entry, and
   approved Jira actions. Ask confirm/edit/cancel.
5. After confirmation, stage specific paths (never `git add -A` or `git add .`)
   and create one commit with the approved message.
6. Apply only the approved, ready Jira actions.
7. Report the commit hash, canonical ownership, changelog effect, completed
   Jira actions, and any Jira capability blocker.

## Pull-request flow

### Prepare

Resolve `BASE_BRANCH` as `main`, otherwise `master`. If on that branch, ask for
a feature branch and create it; never push directly from the base branch.

If the worktree is clean and the branch has no commits beyond the base, stop.
If dirty, use Shared commit composition. If clean with existing commits, derive
the PR title from the highest-impact Conventional Commit (`feat` > `fix` >
`perf`/`refactor`/`revert` > others), adding the ticket suffix only when absent.

Request `changelog`. Update the configured path only when `update_mode` is
`pull_request`; `commit` means entries should already have landed with their
commits, and `disabled` means no update. Filter by the canonical `skip_types`
list without adding fallback types. Follow Keep a Changelog section mapping:
`feat` → Added, `fix` → Fixed, `perf`/`refactor`/`revert` → Changed, breaking
changes → Changed with `**BREAKING:**`, and security fixes → Security.

Draft the complete PR title and body before writing or publishing. The body
contains Summary, Jira (ticket key and summary only; never reconstruct a site
URL from legacy config), Test plan, and the standard generated footer. Omit the
Jira section without a ticket. State whether canonical
`tracker.pull_requests` is `triage` or `ignore`.

### Confirm and execute

Preview, in one block:

- commit message or the reason no commit is needed;
- exact changelog diff;
- PR title and full body;
- push target;
- worklog and eventual transition;
- active canonical ownership and PR-intake policy.

Ask confirm/edit/cancel. This confirms the exact local commit, push, and PR
payload. After confirmation:

1. Commit dirty work and the applicable changelog entry together. If only the
   changelog changed, commit just its configured path. If neither changed,
   create no empty commit.
2. Apply an approved worklog after a successful commit.
3. Push the branch.
4. Select the PR client from the validated origin: `gh pr create` for GitHub,
   `glab mr create` for GitLab, and `tea pr create` for Gitea. Check only that
   selected client. Send the confirmed title/body verbatim.
5. Only after a PR URL exists, offer canonical `commit.jira.pr_transition`
   when a ticket exists and Jira capability is ready. A null transition means
   no prompt. Confirm immediately before the Jira transition.

If the selected PR client is missing or fails, print the confirmed title, body,
and base branch for manual creation and do not transition the ticket.

Report commit/no-commit, configured changelog path and effect, push target, PR
URL or manual fallback, PR-intake policy, Jira action results, and any
capability-specific blocker.

## Clean flow

1. Inspect `git branch -vv` and `git worktree list`.
2. Run `git fetch --prune`, then identify branches marked gone.
3. Never delete the current branch. For each other gone branch, remove its
   associated worktree first and then delete the branch.
4. Report the exact worktrees and branches removed.

## When you finish

In two or three sentences, state what landed and where, then name the relevant
canonical policy effects. After a plain commit route to `/ws-commit pr`; after
a PR route to `/ws-status`.