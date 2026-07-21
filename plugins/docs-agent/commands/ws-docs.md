---
description: "Unified docs entry: discovery, init, audit, catchup, repair, write, adr, architecture, contributing, changelog, release-notes, explain, publish, pull-back"
arguments:
  - name: verb
    description: "Verb: init | audit | catchup | repair | write | adr | architecture | contributing | changelog | release-notes | explain | publish | pull-back (omit for discovery; publish/pull-back require Python 3 + OUTLINE_API_TOKEN)"
    required: false
  - name: arg1
    description: "Verb-specific arg 1: write <type>; adr <decision>; changelog <version>; release-notes <version>"
    required: false
  - name: arg2
    description: "Verb-specific arg 2: write <topic>"
    required: false
allowed_tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Task
  - AskUserQuestion
---

# /ws-docs — Unified Documentation Entry

Single entry point for all docs-agent operations in this project. Follows the dual-track-docs convention (`docs/` user, `dev-docs/` internal).

Project state lives in `.claude/docs-config.yaml`. Hooks (PreToolUse + Stop) read this file to decide whether to enforce; absent file = no enforcement.

## Skills loaded

- `dual-track-docs` — convention single source of truth
- `diataxis` — quadrant definitions (loaded when relevant)
- `keep-a-changelog` — changelog format (auto-loads on "changelog")
- `style-guide` — prose + code style
- `adr` — MADR format (loaded for adr verb)

## Hub mode

Before dispatching any verb, look for a `project.yaml` (cwd, then parent
directories up to $HOME) whose `repos:` list contains `role: docs`. If found,
you are in **hub mode**; resolve `DOCS_REPO` = the hub-relative path of that
repo. All product-level writes go there.

Scope routing in hub mode (repo-level behavior is unchanged outside hubs):
- `write` with user audience → ALWAYS `DOCS_REPO/docs/` (user docs are
  product-level by definition)
- `write` with dev audience → ask scope: **this repo** (local `dev-docs/`) or
  **product** (`DOCS_REPO/dev-docs/`)
- `adr` → ask scope: repo ADR (local `dev-docs/decisions/`) or product ADR
  (`DOCS_REPO/dev-docs/decisions/`)
- `architecture` → ask scope; product scope targets
  `DOCS_REPO/dev-docs/architecture.md` (delegate to ws-project-hub's
  hub-architect agent when available)
- `changelog`, `release-notes` → repo-level, unchanged

The scope answer may be cached in `.claude/docs-config.yaml` as
`default_scope: repo | product | ask` (honor it like `default_audience`).

## Routing

Read the verb from `{{ verb }}`. If empty → **discovery** mode. Otherwise dispatch the verb.

### No verb → Discovery

Run the `docs-doctor` agent (Task tool, foreground — fast). It returns a structured report. Render this exact table format:

```
ws-docs status
─────────────────────────────────────────────────────────────────
Artifact                  Status      Notes
─────────────────────────────────────────────────────────────────
docs/                     <state>     <note>
  docs/index.md           <state>     <note>
  docs/tutorials/         <state>     <note>
  docs/how-to/            <state>     <note>
  docs/reference/         <state>     <note>
  docs/explanation/       <state>     <note>
dev-docs/                 <state>     <note>
CHANGELOG.md              <state>     <note>
docs/changelog.md         <state>     <note>
CONTRIBUTING.md           <state>     <note>
.claude/docs-config.yaml  <state>     <note>

Suggested:
  <recommended verbs>
```

State icons: `✓ present`, `⚠ stale|behind|empty`, `✗ missing`. Suggest verbs based on detected gaps. Do not write anything.

### verb = init

First-time setup. Dispatch in parallel (Agent tool with `run_in_background: true`):

1. `architecture-documenter` → writes `dev-docs/architecture.md`
2. `contributing-generator` → writes the 3-file CONTRIBUTING set
3. `changelog-analyzer` → generates root `CHANGELOG.md` from git history (and mirrors)
4. `diataxis-writer` (quadrant: `tutorial`) → writes `docs/tutorials/getting-started.md` if absent

While they run, in the main session:
- Create directories: `docs/{tutorials,how-to,reference,explanation,release-notes}/` and `dev-docs/{decisions,runbooks,reference,explanation}/`
- Create `index.md` stubs in each subfolder if missing (one line: `# <Subfolder>`)
- Write `.claude/docs-config.yaml` with defaults (see schema below). Prompt the user via AskUserQuestion if they want to override `default_audience` (ask | user | dev) or `auto.enforce_via_hooks` (true | false).
- Append the "Documentation maintenance" section to root `CLAUDE.md` (create the file if missing). Do not overwrite existing content; if a previous v2.x maintenance section is detected (`# Documentation maintenance` heading), replace it; otherwise append.

Poll the dispatched agents every 3-5 seconds (TaskList / TaskGet) and print a status block per poll like:

```
/ws-docs init  —  4 subagents

⏳ architecture-documenter   12s   writing dev-docs/architecture.md
⏳ contributing-generator    08s   analyzing tooling...
✓ diataxis-writer           18s   docs/tutorials/getting-started.md
⏳ changelog-analyzer        15s   parsed 240/247 commits
```

When all complete, print a final summary listing every file created. Commit nothing automatically — print the suggested commit message:

```
Suggested commit:
  git add docs/ dev-docs/ CHANGELOG.md CONTRIBUTING.md CLAUDE.md .claude/docs-config.yaml
  git commit -m "chore(docs): initialize dual-track docs via /ws-docs init"
```

### verb = audit

Verbose dijagnoza. Run 3 agents in parallel (background) — same dispatch pattern as `catchup`:
1. `docs-doctor` with `mode: audit` — returns the artifact table plus per-commit details since last CHANGELOG entry
2. `public-api-watcher` — returns detected public API changes needing `docs/reference/` updates
3. `arch-watcher` — returns ADR candidates (architectural signals)

While they run, render the same live status block format. When all complete, merge the three reports: render the same table as discovery (from `docs-doctor`), then a follow-up section combining the watcher findings:

```
─────────────────
Audit details
─────────────────
Commits since last CHANGELOG entry: N
  abc1234  feat(auth): add OTP screen
  def5678  fix: token refresh race
  ...

Public API changes detected:
  src/api.ts: new exports — getUser, listSessions

ADR candidates (architectural signals):
  feb1234  "Migrate auth to JWT"  signals: keyword(migrate), new dep(jsonwebtoken)
```

Optionally write the report to `docs-audit-<YYYY-MM-DD>.md` if the user opts in (AskUserQuestion).

### verb = catchup

Run 3 agents in parallel (background):
1. `changelog-analyzer` (mode: propose) — returns proposed [Unreleased] entries
2. `public-api-watcher` — returns reference files needing update
3. `arch-watcher` — returns ADR candidates

While they run, render the same live status block format. When all complete, present an interactive triage:

```
─────────────────
CHANGELOG (12 entries proposed):
  [A] Added — OTP login screen (WSC-142)  abc1234
  [A] Fixed — Token refresh race (WSC-138)  def5678
  ...
Action: [a]ccept all, [s]elect, [n]one
```

Use AskUserQuestion to gather decisions. After the user triages each category, perform the writes (update CHANGELOG.md + mirror, edit reference files, write new ADR(s)), then stage them and create one commit:

```bash
git add CHANGELOG.md docs/changelog.md docs/reference/ dev-docs/decisions/
git commit -m "docs: catchup since <last_version_or_sha>"
```

Use the last version tag if one exists; otherwise the SHA of the last CHANGELOG-modifying commit.

### verb = repair

Re-run discovery, list only ✗-missing or ⚠-stale items. Prompt confirmation (AskUserQuestion: proceed | cancel). Then create only what's missing — never delete, never modify what's present.

Specifically:
- Missing `dev-docs/` → create directory tree + `index.md` stubs
- Missing `docs/changelog.md` → copy from root `CHANGELOG.md`
- Missing `.claude/docs-config.yaml` → write defaults
- Missing CLAUDE.md `# Documentation maintenance` section → append it

Print a summary of what was repaired.

### verb = write

`{{ arg1 }}` = type (`tutorial | howto | reference | explanation`), `{{ arg2 }}` = topic.

If type is missing or invalid → AskUserQuestion to pick from the 4 options. If topic is missing → AskUserQuestion for it.

Audience routing:
- `tutorial` → always user track
- Others → read `.claude/docs-config.yaml` `default_audience`. If `ask`, AskUserQuestion. If `user` or `dev`, use that.

Resolve destination from audience + type (see dual-track-docs skill routing table).

Dispatch the matching agent (foreground, single):
- `tutorial` → `diataxis-writer` with `quadrant: tutorial`
- `howto` → `diataxis-writer` with `quadrant: howto`
- `reference` → `api-documenter`
- `explanation` → `diataxis-writer` with `quadrant: explanation`

Pass `destination_track` and `destination_path` inputs to the agent (plus `quadrant` for `diataxis-writer`). After the agent returns, print a one-line spinner status and a final "✓ wrote `<path>`" line.

### verb = adr

`{{ arg1 }}` = decision text (required; AskUserQuestion if missing).

1. Scan `dev-docs/decisions/` for the highest existing number; new number = highest + 1, zero-padded to 4 digits.
2. Slug the decision text to kebab-case for the filename: `dev-docs/decisions/<NNNN>-<slug>.md`
3. Dispatch `adr-writer` foreground with the decision, target path, and project context.
4. Print "✓ wrote `<path>`".

### verb = architecture

Dispatch `architecture-documenter` foreground. Before writing, show a diff vs current `dev-docs/architecture.md` (if it exists) and AskUserQuestion: proceed | cancel. On proceed, write the new version.

### verb = contributing

Dispatch `contributing-generator` foreground. It will produce 3 file contents (root router, `docs/contributing.md`, `dev-docs/development.md`). Before writing, show a diff per file vs current content and AskUserQuestion per file: write | skip. Write only the confirmed files.

### verb = changelog

`{{ arg1 }}` = optional version (e.g. `v1.3.0`).

Dispatch `changelog-analyzer` foreground:
- No version → update `[Unreleased]` section with new entries from commits since last entry
- With version → close `[Unreleased]` as the new version (with today's ISO date), open a fresh empty `[Unreleased]`

After the agent updates `CHANGELOG.md`, mirror it to `docs/changelog.md` (Read + Write).

### verb = release-notes

`{{ arg1 }}` = version (e.g. `v1.3.0`). If missing, use the most recent git tag; if no tags, AskUserQuestion.

Dispatch `release-notes-writer` foreground. Write to `docs/release-notes/<version>.md` in Linear style with screenshot placeholders (`![screenshot](TODO)`).

### verb = explain

Regenerate `docs/explained.md` (in DOCS_REPO when in hub mode, else the
current repo): a single Outline-safe onboarding page generated from
project.yaml, sub-repo READMEs, dev-docs/architecture.md, and existing docs/ —
what the product is, a mermaid architecture diagram of the repos, workflow
diagrams, a roles table, install/quickstart, links to deeper docs. First line:
`<!-- GENERATED by /ws-docs explain — do not edit by hand -->`. Never
hand-edit; regenerate instead. Outline-safe profile only (no raw HTML) — run
`python3 ${CLAUDE_PLUGIN_ROOT}/scripts/outline-sync.py lint --root <repo>`
before finishing and fix violations.

### verb = publish

Push the user track to Outline. Steps: (1) run
`python3 ${CLAUDE_PLUGIN_ROOT}/scripts/outline-sync.py lint --root <repo>` —
abort on violations, listing them per file; (2) run
`... outline-sync.py push --root <repo>` (add `--dry-run` first and show the
plan when the user hasn't published before); (3) report created/updated/
skipped/conflicts/archived from the JSON; conflicts mean the doc changed in
Outline too — resolve via `pull-back`, or `--force` to overwrite; (4) commit
`.outline-sync.json` if it changed.

Requires Python 3 + `OUTLINE_API_TOKEN` (or `~/.config/ws-docs/outline-token`);
if the token is missing, the script exits with setup instructions — relay them.

### verb = pull-back

Bring Outline edits into git for review. Steps: (1) run
`... outline-sync.py pull --root <repo>`; (2) if the report shows pulled or
new_from_outline files: create branch `docs/outline-pull-back-<YYYY-MM-DD>`,
commit the changes, open a PR via tea titled
`docs: pull back Outline edits (<date>)`; (3) if nothing changed, say so and
stop. Files under `docs/from-outline/` were created in Outline by
helpdesk/others — the reviewer decides their final Diátaxis location during
the PR.

Requires Python 3 + `OUTLINE_API_TOKEN` (or `~/.config/ws-docs/outline-token`);
if the token is missing, the script exits with setup instructions — relay them.

## `.claude/docs-config.yaml` defaults

When `init` creates this file, use:

```yaml
docs:
  initialized: <today ISO date>
  version: 1
  user_track: docs
  dev_track: dev-docs
  default_audience: ask
  auto:
    changelog_per_commit: true
    adr_for_arch_changes: true
    enforce_via_hooks: true
  surface:
    subagent_status: compact
```

## Constraints

- Never overwrite files without prompt + confirmation (except in `init` when files are missing).
- Never push or commit on the user's behalf without explicit verb authorization (only `catchup` commits automatically after user triage; `publish` commits `.outline-sync.json`; `pull-back` commits to its review branch).
- All file paths are relative to the project root unless explicitly noted.
- Heavy verbs (`init`, `audit`, `catchup`, `architecture`, `contributing`) use `run_in_background: true`; lightweight verbs (`write`, `adr`, `release-notes`, `changelog`, `explain`, `publish`, `pull-back`) run foreground.
