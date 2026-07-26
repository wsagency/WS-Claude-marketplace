# Issue tracker: Jira (jira-cli)

Issues and PRDs for this repo live in Jira, project **`<PROJECT-KEY>`**. Use the
[jira-cli](https://github.com/ankitpokhrel/jira-cli) binary (`jira`) for all
operations — same setup as the WS `/ws-init` flow (`JIRA_API_TOKEN` + `jira init`).
Verify exact flags with `jira <command> --help` if a call errors.

## Conventions

- **Create an issue**: `jira issue create -tTask -s"..." -b"..." -p<PROJECT-KEY> --no-input` (heredoc/quoted body for multi-line; `-tBug`/`-tStory` when the content implies it; `-l<label>` per label).
- **Read an issue**: `jira issue view <KEY> --raw` (JSON, includes comments and labels; `--plain` fallback).
- **List issues**: `jira issue list -q '<JQL>' --plain --no-headers --columns KEY,TYPE,STATUS,PRIORITY,SUMMARY` (or `--raw` for JSON). Scope with `project = <PROJECT-KEY>` and label filters in the JQL.
- **Comment**: `jira issue comment add <KEY> "..." --no-input`
- **Apply / remove labels**: `jira issue edit <KEY> --label <add>` (verify removal syntax via `jira issue edit --help`; JQL `labels = x` for filtering).
- **Close / transition**: `jira issue move <KEY> "<target state>"` — the CLI lists valid states when the name doesn't match.
- **Assign**: `jira issue assign <KEY> $(jira me)`

The bound project key comes from `.claude/ws-project.yaml` (`jira.project`) when present.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Jira lives apart from the git host; PR triage stays in the PR tool — flip only if your Jira ingests PRs via a connector and `/ws-triage` should read them.)_

## When a skill says "publish to the issue tracker"

Create a Jira issue in `<PROJECT-KEY>` (via `jira issue create` as above). Tickets follow the `ws-to-tickets` shape (What to build / AC checkboxes / Blocked by). When a ticket is stakeholder-facing (PM/client will read it in Jira), add a short user-story line ("As a [role], I want [goal], so that [value]") and write the AC as Given/When/Then — testable and readable for non-developers.

## When a skill says "fetch the relevant ticket"

Run `jira issue view <KEY> --raw`.

## Wayfinding operations

Used by `/ws-wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder-map` (colons are unreliable in Jira labels — use `-`), holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue linked to the map (`jira issue link <MAP> <CHILD> "Relates"` — or as a Jira sub-task via `-tSub-task` where the project allows). Labels: `wayfinder-research` / `wayfinder-prototype` / `wayfinder-grilling` / `wayfinder-task`. Once claimed, assign the driving dev.
- **Blocking**: Jira issue links — `jira issue link <BLOCKER> <CHILD> "Blocks"`. A ticket is unblocked when every linked blocker is Done.
- **Frontier query**: `jira issue list -q 'project = <PROJECT-KEY> AND labels in (wayfinder-research, wayfinder-prototype, wayfinder-grilling, wayfinder-task) AND statusCategory != Done AND assignee is EMPTY ORDER BY created ASC' --raw`, then drop any with an open "is blocked by" link (from each issue's `--raw` links).
- **Claim**: `jira issue assign <KEY> $(jira me)` — the session's first write.
- **Resolve**: `jira issue comment add <KEY> "<answer>" --no-input`, then `jira issue move <KEY> Done`, then append a context pointer to the map's Decisions-so-far.
