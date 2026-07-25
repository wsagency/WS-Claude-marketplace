# Design — Migrate Jira integration from Atlassian MCP to jira-cli

**Date:** 2026-07-20
**Status:** Approved, awaiting implementation plan
**Scope:** ws-commit-commands v3.0.0 (breaking) + ws-jira-enhancer v1.1.0 (additive)

## Problem

The Jira-aware commands authenticate and talk to Jira through the Atlassian MCP server
(`mcp__plugin_atlassian_atlassian__*`). That couples the plugins to a per-user OAuth connector
that every team member must wire into claude.ai, can't run in CI or plain scripts, and is
non-deterministic (Claude drives each call step by step). We want a deterministic,
scriptable, connector-free path.

Goal: replace all Jira MCP usage with [jira-cli](https://github.com/ankitpokhrel/jira-cli)
(`ankitpokhrel/jira-cli`, the `jira` binary), invoked via Bash, while keeping the existing
commit / changelog / PR workflow and conventions unchanged.

## Decisions

| Question | Decision |
|---|---|
| Which CLI | `jira-cli` (ankitpokhrel) — mature, single Go binary, full JQL, `--plain`/`--raw` output, `issue move/worklog/comment/create` |
| Auth model | Delegate entirely to jira-cli: `JIRA_API_TOKEN` env + `jira init` config (`~/.config/.jira/.config.yml`). No OAuth, no tokens in our configs |
| Our config layer | Keep the thin `~/.claude/ws/config.yaml` + `.claude/ws-project.yaml` for project binding, changelog, defaults, UI toggle. Drop MCP-only fields (`cloud_id`, `account_id`) |
| Worklog/transition/comment | **Both**: explicit CLI calls do the real action (deterministic, immediate) AND the Smart Commit trailer is written to the message. Guarded against double-apply (below) |
| ws-jira-enhancer | Add optional ticket creation via `jira issue create` after generating the ticket text |
| Version bumps | ws-commit-commands 2.1.0 → **3.0.0** (breaking: auth/onboarding change, MCP dependency dropped); ws-jira-enhancer 1.0.0 → **1.1.0** |

## Prerequisites change

- **Add:** jira-cli — `brew install ankitpokhrel/jira-cli/jira-cli`, then a Jira API token
  exported as `JIRA_API_TOKEN` and a one-time `jira init` (Cloud, site URL, default project,
  optional board).
- **Remove:** the Atlassian MCP server / `atlassian` plugin dependency for these commands.
- `tea` CLI (Gitea PRs) is unchanged.

## Config layering

**Auth** lives only in jira-cli: the `JIRA_API_TOKEN` env var and `~/.config/.jira/.config.yml`
(written by `jira init`). A repo may pin its own jira config with `JIRA_CONFIG_FILE=<path>` or
`jira -c <path>` if ever needed; not used by default.

**Our thin layer** stays, minus MCP fields:

```yaml
# ~/.claude/ws/config.yaml
jira:
  site: wsagency.atlassian.net     # for building browse URLs; matches jira-cli config
defaults:
  jira_actions: ask                # ask | always | never
  pr_transition: in-review
  commit_format: cc-suffix
  smart_commit_trailer: true       # include the #time/#transition trailer in messages
ui:
  session_start_dashboard: true
```

```yaml
# <project>/.claude/ws-project.yaml
jira:
  project: WSC
  board: 42                        # optional
  default_issue_type: Task
changelog:
  auto_update: true
  path: CHANGELOG.md
  skip_types: [docs, chore, test, style, build, ci]
hooks:
  session_start_dashboard: true
```

Removed vs today: `atlassian.cloud_id`, `atlassian.account_id`. Current user comes from
`jira me`; the browse URL comes from `jira.site`.

## MCP → CLI mapping

| Old MCP tool | New jira-cli command |
|---|---|
| `authenticate` / `complete_authentication` | (removed) `jira init` run once by the user; `/ws-init` verifies |
| `atlassianUserInfo` | `jira me` |
| `getAccessibleAtlassianResources` | (removed — site comes from `jira init`) |
| `getVisibleJiraProjects` | `jira project list` |
| `searchJiraIssuesUsingJql` | `jira issue list -q "<jql>" --plain --no-headers --columns ...` (or `--raw` for JSON) |
| `getJiraIssue` | `jira issue view <KEY> --raw` (JSON; fallback `--plain`) |
| `getTransitionsForJiraIssue` | (implicit) `jira issue move <KEY> "<state>"` — valid states surfaced by the CLI |
| `transitionJiraIssue` | `jira issue move <KEY> "<state>"` |
| `addCommentToJiraIssue` | `jira issue comment add <KEY> "<text>" --no-input` |
| (n/a) worklog | `jira issue worklog add <KEY> "<duration>" --comment "<text>" --no-input` |
| (n/a) create | `jira issue create -t<Type> -s"<summary>" -b"<body>" -p<PROJECT> --no-input` |

All commands run through Bash. Every command's frontmatter `allowed-tools` drops the
`mcp__plugin_atlassian_atlassian__*` entries and keeps `Bash, Read, ...`.

Note: exact `--raw` support on `issue view` and `--no-input` on `comment add` are verified at
implementation; fallbacks (`--plain` parsing) are specified where the flag is uncertain.

## Command-by-command changes (ws-commit-commands v3.0.0)

### /ws-init — onboarding

Replace the OAuth flow with a CLI readiness check:

1. **Binary present?** `command -v jira`. Missing → print
   `brew install ankitpokhrel/jira-cli/jira-cli` and abort.
2. **Authenticated?** Run `jira me`. Non-zero/empty → guide the user: create an API token,
   `export JIRA_API_TOKEN=…`, run `jira init` (Cloud + site + default project). `jira init` is
   an interactive TUI, so we instruct rather than drive it. Re-check with `jira me`.
3. **Global config:** write `~/.claude/ws/config.yaml` with `jira.site` (derived from
   `jira me` / the jira-cli config) and the `defaults`/`ui` blocks. If an old config with
   `cloud_id`/`account_id` exists, rewrite it to the new shape.
4. **Project binding:** if in a git repo, offer to bind. `jira project list` → AskUserQuestion
   → write `.claude/ws-project.yaml` (project, optional board, default issue type, changelog
   block). Ensure it is NOT gitignored (team-shared).
5. Report next steps (`/ws-status`, `/ws-commit`).

### /ws-status — dashboard

1. Verify `~/.claude/ws/config.yaml` exists (else run `/ws-init`).
2. Fetch: `jira issue list -q "assignee = currentUser() AND statusCategory != Done ORDER BY
   priority DESC, updated DESC" --plain --no-headers --columns KEY,TYPE,STATUS,PRIORITY,SUMMARY`
   (scope with `AND project = <KEY>` when bound; `--raw` when structured JSON is easier to
   parse). Limit ~50.
3. Render the same grouped dashboard as today (In Progress / To Do / In Review / Blocked,
   priority markers, `(you're here)` for the current branch's ticket, "Suggested next").
4. Cache to `~/.cache/ws-hub/status.txt` with timestamp for the hook.
5. Read-only.

### /ws-commit — Jira-aware commit

Unchanged: ticket detection, CC message composition, elapsed-time computation, preview,
staged commit. Changed only where MCP was used:

1. Fetch ticket context: `jira issue view <KEY> --raw` → read `summary`, `status`.
2. Smart Commit additions (`defaults.jira_actions`): when the user opts into worklog/transition,
   perform them with **explicit CLI calls after the commit succeeds**:
   - worklog → `jira issue worklog add <KEY> "<Xh Ym>" --no-input`
   - transition → `jira issue move <KEY> "<target>"`
   - optional comment → `jira issue comment add <KEY> "Committed <SHA>: <subject>" --no-input`
3. Smart Commit trailer: if `defaults.smart_commit_trailer` is true, ALSO append the
   `WSC-142 #time … #transition` line to the commit body (readable record, connector-ready).

### /ws-commit-push-pr — commit + changelog + push + PR

Unchanged: branch setup, CC compose, CHANGELOG.md update (keep-a-changelog skill), single
commit, push, `tea pr create` with the Jira link section. Changed:

- Transition at PR time → `jira issue move <KEY> "<pr_transition target>"` (default In Review),
  after user confirmation. No MCP.

## Smart Commit "both" — double-apply guard

The user chose to keep Smart Commit trailers **and** make explicit CLI calls. A trailer is only
re-applied server-side if an active Jira dev-connector processes Smart Commits from this repo.
WS uses Gitea, which Jira does not natively process for Smart Commits, so in practice the
trailer is an inert, human-readable record and there is no double-apply. To stay safe and
honest:

- The **CLI call is the source of truth** for actually applying worklog/transition/comment.
- The trailer is included only when `defaults.smart_commit_trailer: true` (default true).
- CLAUDE-facing docs and the skill warn: *if your Jira has an active dev-connector that
  ingests Smart Commits from this repo, set `smart_commit_trailer: false` so worklogs and
  transitions are not applied twice.*

## ws-jira-enhancer v1.1.0 — optional creation

After generating the structured ticket (unchanged), when run inside a repo bound to a Jira
project:

1. Ask (AskUserQuestion): **Create in Jira?** yes / no.
2. If yes: map the generated Summary → `-s`, the body (User Story + Background + AC) → `-b`,
   type from `.claude/ws-project.yaml` `default_issue_type` (overridable), project from the
   binding. Run `jira issue create -t<Type> -s"<summary>" -b"<body>" -p<PROJECT> --no-input`.
3. Print the created key + browse URL (built from `jira.site`).
4. If no binding or not in a repo, keep today's behavior (text only) and say why.

Frontmatter gains `Bash` and `AskUserQuestion`.

## Hook + skill + metadata

- **session-start-dashboard.sh:** change the "fetch fresh via the Atlassian MCP server" line to
  "fetch fresh via `/ws-status` (jira-cli)". No behavioral change; the script already only
  emits context text.
- **ws-jira-conventions skill:** update "What Jira actually requires" and the Smart Commits
  section to note that jira-cli now performs actions explicitly and the trailer is an optional
  record; add the double-apply warning.
- **plugin.json / marketplace.json descriptions:** "Jira OAuth onboarding" → "Jira CLI
  onboarding (jira-cli)"; keep them in sync (per repo docs convention).

## Docs surface

- **README.md:** prerequisites (add jira-cli + token, drop the Atlassian MCP requirement line),
  ws-commit-commands section (onboarding wording, `/ws-init` description).
- **docs/reference/commands.md:** ws-commit-commands prerequisites and per-command notes.
- **CHANGELOG.md** (+ `docs/changelog.md` mirror): `Changed`/`**BREAKING:**` entries for the
  auth/onboarding migration; `Added` for enhancer creation.

## Error handling

- `jira` not installed → brew install hint, abort.
- `jira me` fails (no token / not initialized) → step-by-step setup, abort without partial work.
- JQL/list returns nothing → "no open assignments" empty state, not an error.
- `issue view` on a bad key → surface the CLI error, let the user re-enter.
- transition/worklog CLI error → report, do not fail the already-made commit; the commit stands
  and the user can retry the action.
- offline / API 5xx → CLI error surfaced verbatim; nothing written to our configs.

## Testing

- `command -v jira` gating verified on a machine without the binary (clean abort).
- `/ws-status` against a real bound project (dashboard renders, cache written).
- `/ws-commit` dry path: compose message, then worklog/transition CLI calls against a scratch
  ticket; verify no double-apply with `smart_commit_trailer: true` on the Gitea setup.
- `/ws-commit-push-pr` end-to-end on a scratch branch → PR + transition.
- `/ws-jira-enhancer "…"` → create on a scratch project, verify returned key/URL.

## Out of scope

- Migrating any non-Jira MCP usage.
- Self-hosted Jira Server/DC specifics (assume Jira Cloud, as jira-cli `init` Cloud).
- Bulk operations, epics/sprints management beyond the existing dashboard.
- Auto-installing jira-cli or auto-running `jira init` (guided, not driven — it's an
  interactive TUI).

## Rollout

1. ws-commit-commands v3.0.0: rewrite the 4 commands, hook text, skill, plugin.json.
2. ws-jira-enhancer v1.1.0: add the create step.
3. marketplace.json + README + docs/reference/commands.md + CHANGELOG (mirror) in one docs pass.
4. Announce the onboarding change: existing users re-run `/ws-init` after installing jira-cli
   and running `jira init`.
