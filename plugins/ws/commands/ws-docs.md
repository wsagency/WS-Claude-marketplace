---
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
description: "Unified docs entry: discovery, init, audit, catchup, repair, write, adr, architecture, contributing, changelog, release-notes, explain, publish"
argument-hint: "[init | audit | catchup | repair | write | adr | architecture | contributing | changelog | release-notes | explain | publish] [verb args...]"
---

# /ws-docs — Unified Documentation Entry

Single entry point for all documentation operations in this project. Follows the dual-track-docs convention (`docs/` user, `dev-docs/` internal).

Project state lives in `.claude/docs-config.yaml`. Hooks (PreToolUse + Stop) read this file to decide whether to enforce; absent file = no enforcement.

## Skills loaded

- `dual-track-docs` — convention single source of truth
- `diataxis` — quadrant definitions (loaded when relevant)
- `keep-a-changelog` — changelog format (auto-loads on "changelog")
- `style-guide` — prose + code style
- `adr` — MADR format (loaded for adr verb)

## Hub mode

Before dispatching any verb, look for a `project.yaml` with a `repos:` list
(cwd, then parent directories up to $HOME). If found, you are in a WS project
hub (ADR 0006 — every repo has a `type: working | input | output`). Resolve
`DOCS_REPO` = the hub-relative path of the `type: output, purpose: docs`
repo when one is registered (legacy spelling: `role: docs`) — it receives
only USER-track product writes. Product-level INTERNAL writes always go to
the hub's own `dev-docs/` (the knowledge root), whether or not a docs repo
exists. **Position** then decides behavior:

- **Sub-repo position** — `project.yaml` was found in a PARENT directory: run
  repo-level with the product scope routing below (the original hub mode).
- **Hub-root position** — `./project.yaml` belongs to the cwd itself: there is
  no local repo to document (hubs never carry `docs/`), so verbs run as a
  **hub sweep** across the sub-repos (section below).

Scope routing in sub-repo position (repo-level behavior is unchanged outside hubs):
- `write` with user audience → ALWAYS `DOCS_REPO/docs/` (user docs are
  product-level by definition; requires a registered `purpose: docs` repo)
- `write` with dev audience → ask scope: **this repo** (local `dev-docs/`) or
  **product** (hub `dev-docs/`)
- `adr` → ask scope: repo ADR (local `dev-docs/decisions/`) or product ADR
  (hub `dev-docs/decisions/`)
- `architecture` → ask scope; product scope targets
  hub `dev-docs/architecture.md` (delegate to the ws plugin's
  hub-architect agent when available)
- `changelog`, `release-notes` → repo-level, unchanged

When the hub registers no `purpose: docs` output, user-track product targets
are unavailable: fall back to repo-level and mention that `/ws-hub init` step
4b (or `/ws-hub add`) can register one. Product internal targets (hub
`dev-docs/`) are always available.

The scope answer may be cached in `.claude/docs-config.yaml` as
`default_scope: repo | product | ask` (honor it like `default_audience`).

### Hub sweep (invoked at the hub root)

Sweep targets: every `type: working` repo in `project.yaml` that exists on
disk (`type: input` and `type: output` repos are excluded — inputs are raw
deliveries processed via `/ws-hub intake`, outputs are covered by the
product-level rows). Each working repo is its own git, so per-repo subagents
cannot conflict: dispatch **one subagent per target repo in parallel**
(`run_in_background: true`), passing the repo's absolute path as its working
root, and aggregate when all report. Each subagent honors that repo's own
`.claude/docs-config.yaml` (the hub has none).

Verb behavior at the hub root:

- **no verb (discovery)** — one `docs-doctor` per target repo. Render a
  compact aggregate table: one row per repo with its worst state per column
  (`docs/`, `dev-docs/`, `CHANGELOG`, config), then product rows (`DOCS_REPO`
  present/missing, hub `dev-docs/` state, `openwiki/` freshness). End with suggested verbs per repo.
- **audit** — same fan-out with `mode: audit`; merge into one report grouped
  by repo.
- **catchup** — one subagent per target repo returning the three proposal
  sets (changelog entries, reference updates, ADR candidates). Present ONE
  combined triage grouped by repo, then apply and commit **per repo, inside
  that repo's git** (same commit format as repo-level catchup). When
  `openwiki/` exists and dev-docs changed, offer the prompted wiki refresh at
  the end.
- **repair** — fan out discovery, list gaps grouped by repo, one confirmation,
  then per-repo repair subagents (create only what's missing).
- **init** — NEVER scaffold docs in the hub itself. List target repos missing
  the convention, let the user pick (AskUserQuestion, multi-select), then run
  the init flow per selected repo via one subagent each.
- **write / adr / architecture** — product scope by default (user-track
  writes → `DOCS_REPO`; internal writes → hub `dev-docs/`; architecture
  delegates to hub-architect when available) — at the hub root you are at
  product level, so skip the repo-vs-product question. If no `purpose: docs`
  repo is registered, user-track product writes are unavailable — say so and
  point at `/ws-hub init` step 4b.
- **changelog / release-notes** — per-repo artifacts: ask which repo, then run
  repo-level inside it.
- **explain / publish** — `DOCS_REPO`, as already defined.

## Routing

The verb is `$1` (the first word of `$ARGUMENTS`). If empty → **discovery** mode. Otherwise dispatch the verb.

### No verb → Discovery

Run the `docs-doctor` agent (Task tool (omp: its task agent), foreground — fast). It returns a structured report. Render this exact table format:

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

First-time setup. Dispatch in parallel (Task tool with `run_in_background: true`):

1. `architecture-documenter` → writes `dev-docs/architecture.md`
2. `contributing-generator` → writes the 3-file CONTRIBUTING set
3. `changelog-analyzer` → generates root `CHANGELOG.md` from git history (and mirrors)
4. `diataxis-writer` (quadrant: `tutorial`) → writes `docs/tutorials/getting-started.md` if absent

While they run, in the main session:
- Create directories: `docs/{tutorials,how-to,reference,explanation,release-notes}/` and `dev-docs/{decisions,runbooks,reference,explanation}/`
- Create `index.md` stubs in each subfolder if missing (one line: `# <Subfolder>`)
- Write `.claude/docs-config.yaml` with defaults (see schema below). Prompt the user via AskUserQuestion (or a plain chat question when that tool is unavailable) if they want to override `default_audience` (ask | user | dev) or `auto.enforce_via_hooks` (true | false).
- Append the "Documentation maintenance" section to root `AGENTS.md` (the canonical, agent-neutral context file; create it if missing). Do not overwrite existing content; if a previous maintenance section is detected in `AGENTS.md` (`# Documentation maintenance` heading), replace it; otherwise append. Never append the maintenance section to `CLAUDE.md`. (Tool-managed marker blocks in a thin `CLAUDE.md` — e.g. OpenWiki's `<!-- OPENWIKI:START/END -->` — are a permitted exception owned by their tool: leave them alone, and do not treat a thin import that carries one as "fat".)
- Ensure root `CLAUDE.md` is the thin import. If it is missing, create it containing exactly:

  ```markdown
  @AGENTS.md
  <!-- Canonical project context lives in AGENTS.md (agent-neutral). Keep this file as a one-line import. -->
  ```

- If a real (non-thin) `CLAUDE.md` exists (anything beyond the `@AGENTS.md` import — including a v2.x/v3.x `# Documentation maintenance` section), offer migration via AskUserQuestion: move its content into `AGENTS.md` (dropping any old maintenance section there — the fresh one is appended above), then replace `CLAUDE.md` with the two-line import. If the user declines, leave `CLAUDE.md` untouched; the maintenance section still goes to `AGENTS.md`.

Wait for the background agents' completion notifications; summarize when all report. As agents finish, you may print a status block like:

```
/ws-docs init  —  4 subagents

⏳ architecture-documenter   running   writing dev-docs/architecture.md
⏳ contributing-generator    running   analyzing tooling...
✓ diataxis-writer           done      docs/tutorials/getting-started.md
⏳ changelog-analyzer        running   parsing commits
```

When all complete, print a final summary listing every file created. Commit nothing automatically — print the suggested commit message:

```
Suggested commit:
  git add docs/ dev-docs/ CHANGELOG.md CONTRIBUTING.md AGENTS.md CLAUDE.md .claude/docs-config.yaml
  git commit -m "chore(docs): initialize dual-track docs via /ws-docs init"
```

### verb = audit

Verbose diagnosis. Run 3 agents in parallel (background) — same dispatch pattern as `catchup`:
1. `docs-doctor` with `mode: audit` — returns the artifact table plus per-commit details since last CHANGELOG entry
2. `public-api-watcher` — returns detected public API changes needing `docs/reference/` updates
3. `arch-watcher` — returns ADR candidates (architectural signals)

Wait for the background agents' completion notifications; summarize when all report. Then merge the three reports: render the same table as discovery (from `docs-doctor`), then a follow-up section combining the watcher findings:

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

Wait for the background agents' completion notifications; summarize when all report. Then present an interactive triage:

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

In a hub with `openwiki/`, significant dev-docs changes warrant an OpenWiki refresh (see the hub AGENTS.md; AI-driven).

### verb = repair

Re-run discovery, list only ✗-missing or ⚠-stale items. Prompt confirmation (AskUserQuestion: proceed | cancel). Then create only what's missing — never delete, never modify what's present.

Specifically:
- Missing `dev-docs/` → create directory tree + `index.md` stubs
- Missing `docs/changelog.md` → copy from root `CHANGELOG.md`
- Missing `.claude/docs-config.yaml` → write defaults
- Missing AGENTS.md `# Documentation maintenance` section → append it to `AGENTS.md` (create the file if missing). Never append it to `CLAUDE.md`, which stays a thin `@AGENTS.md` import
- Missing `CLAUDE.md` → create the thin two-line `@AGENTS.md` import (see init)

Print a summary of what was repaired.

### verb = write

`$2` = type (`tutorial | howto | reference | explanation`), `$3` = topic.

If type is missing or invalid → AskUserQuestion to pick from the 4 options. If topic is missing → AskUserQuestion for it.

Audience routing:
- `tutorial` → always user track
- Others → read `.claude/docs-config.yaml` `default_audience`. If `ask`, AskUserQuestion. If `user` or `dev`, use that.

Resolve destination from audience + type (see dual-track-docs skill routing table). In a hub with `openwiki/`, significant dev-docs changes warrant an OpenWiki refresh (see the hub AGENTS.md; AI-driven).

Dispatch the matching agent (foreground, single):
- `tutorial` → `diataxis-writer` with `quadrant: tutorial`
- `howto` → `diataxis-writer` with `quadrant: howto`
- `reference` → `api-documenter`
- `explanation` → `diataxis-writer` with `quadrant: explanation`

Pass `destination_track` and `destination_path` inputs to the agent (plus `quadrant` for `diataxis-writer`). After the agent returns, print a one-line spinner status and a final "✓ wrote `<path>`" line.

### verb = adr

`$2` = decision text (required; AskUserQuestion if missing).

1. Scan `dev-docs/decisions/` for the highest existing number; new number = highest + 1, zero-padded to 4 digits.
2. Slug the decision text to kebab-case for the filename: `dev-docs/decisions/<NNNN>-<slug>.md`
3. Dispatch `adr-writer` foreground with the decision, target path, and project context. Two-tier rule (see the `adr` skill): the lightweight template (`# NNNN — Title` + 1-3 sentences) is the default; full MADR v4.0.0 only for big decisions (breaking / costly to undo / multiple serious options). Both tiers share the same home and numbering.
4. Print "✓ wrote `<path>`".

In a hub with `openwiki/`, significant dev-docs changes warrant an OpenWiki refresh (see the hub AGENTS.md; AI-driven).

### verb = architecture

Dispatch `architecture-documenter` in the background (`run_in_background: true`) and wait for its completion notification. Before writing, show a diff vs current `dev-docs/architecture.md` (if it exists) and AskUserQuestion: proceed | cancel. On proceed, write the new version.

**When the project sits in a hub with `openwiki/`** (or its own OpenWiki): `architecture.md` is deliberately THIN — curated boundaries, cross-module contracts, and invariants only, opening with a pointer: "The living structural map is the OpenWiki (`openwiki/architecture/`) — this file records only what a map cannot: intended boundaries and contracts." Do not duplicate the wiki's derivable content; pass this constraint to the agent.

### verb = contributing

Dispatch `contributing-generator` in the background (`run_in_background: true`) and wait for its completion notification. It will produce 3 file contents (root router, `docs/contributing.md`, `dev-docs/development.md`). Before writing, show a diff per file vs current content and AskUserQuestion per file: write | skip. Write only the confirmed files.

### verb = changelog

`$2` = optional version (e.g. `v1.3.0`).

Dispatch `changelog-analyzer` foreground:
- No version → update `[Unreleased]` section with new entries from commits since last entry
- With version → close `[Unreleased]` as the new version (with today's ISO date), open a fresh empty `[Unreleased]`

After the agent updates `CHANGELOG.md`, mirror it to `docs/changelog.md` (Read + Write).

### verb = release-notes

`$2` = version (e.g. `v1.3.0`). If missing, use the most recent git tag; if no tags, AskUserQuestion.

Dispatch `release-notes-writer` foreground. Write to `docs/release-notes/<version>.md` in Linear style with screenshot placeholders (`![screenshot](TODO)`).

### verb = explain

Not to be confused with `/ws-hub explained` (the `purpose: explained` HTML artefacts).

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
`python3 ${CLAUDE_PLUGIN_ROOT}/scripts/outline-sync.py lint --root <repo>`
(if CLAUDE_PLUGIN_ROOT is unset — e.g. in omp — use the plugin's install
directory: the plugin root containing this command file) —
abort on violations, listing them per file; (2) run
`... outline-sync.py push --root <repo>` (add `--dry-run` first and show the
plan when the user hasn't published before); (3) report created/updated/
skipped/conflicts/archived from the JSON; conflicts mean the doc changed in
Outline (revision mismatch) — Outline edits are not synced back; re-apply
wanted changes in git and push with `--force`, which overwrites the
conflicting docs; it does NOT skip the lint gate; (4) commit
`.outline-sync.json` if it changed.

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
  changelog:
    # Commit types that never require a CHANGELOG entry.
    # Falls back to .claude/ws-project.yaml changelog.skip_types, then this default.
    skip_types: [docs, chore, test, style, build, ci]
  auto:
    changelog_per_commit: false  # PR-time is canonical (ws-commit pr); set true only for repos without the PR flow
    adr_for_arch_changes: true
    enforce_via_hooks: true
  surface:
    subagent_status: compact
```

## Constraints

- Never overwrite files without prompt + confirmation (except in `init` when files are missing).
- Never push or commit on the user's behalf without explicit verb authorization (only `catchup` commits automatically after user triage; `publish` commits `.outline-sync.json`).
- All file paths are relative to the project root unless explicitly noted.
- Background verbs (`init`, `audit`, `catchup`, `architecture`, `contributing`) dispatch agents with `run_in_background: true`; all other verbs (`repair`, `write`, `adr`, `changelog`, `release-notes`, `explain`, `publish`) run foreground. This is the single authoritative list for the repo-level position — the per-verb sections above follow it; at the hub root, dispatch per the Hub sweep section instead.
