# Design — `/ws-docs` unified entry + automatic docs maintenance

**Date:** 2026-05-29
**Status:** Approved, awaiting implementation plan
**Scope:** docs-agent plugin v3.0.0 (consolidate 11 commands into 1) + automatic maintenance hooks + background subagent dispatch
**Supersedes:** the PR 2 / PR 3 sections of `2026-05-29-dual-track-docs-design.md` (PR 1 of that spec is shipped and stays in effect)

## Problem

After shipping the dual-track docs convention (PR 1, docs-agent v2.1.0), the docs-agent plugin exposes 11 separate slash commands (`/docs`, `/docs-tutorial`, `/docs-howto`, `/docs-reference`, `/docs-explanation`, `/adr`, `/architecture`, `/contributing`, `/changelog`, `/changelog-entry`, `/release-notes`). This is too much namespace surface for the value it provides:

- The 4 Diátaxis writers (`/docs-tutorial`, `/docs-howto`, `/docs-reference`, `/docs-explanation`) differ only by quadrant — pure duplication.
- `/changelog-entry` is redundant: changelog updates already happen automatically through `/ws-commit-push-pr` (ws-commit-commands v2.1.0).
- Once a project is initialized, the user shouldn't have to remember which doc artifact to update — Claude should know it from CLAUDE.md instructions and a hook should enforce the obvious cases.
- Heavy operations (init, catchup) run sequentially in the main session; the user sees raw tool output instead of a clean progress summary.

## Goal

Replace the 11 commands with a single intelligent entry point `/ws-docs` that:

1. **Discovers state first** — bez argumenata, scans the repo and reports what's missing/stale/up-to-date. Suggests next steps. Doesn't write anything.
2. **Routes explicit intents** via verbs (`init`, `audit`, `catchup`, `repair`, `write`, `adr`, `architecture`, `contributing`, `changelog`, `release-notes`).
3. **Auto-maintains docs** after initialization via CLAUDE.md instructions + plugin hooks (opt-in per project via `.claude/docs-config.yaml`).
4. **Dispatches subagents in background** for heavy operations, surfacing a live status table instead of raw output.

docs-agent bumps to **v3.0.0** (breaking — old commands removed, no back-compat per user decision).

## Convention summary (carries over from PR 1)

- `docs/` — user-facing (VitePress-publishable)
- `dev-docs/` — internal contributor
- `CHANGELOG.md` at root, mirrored to `docs/changelog.md`
- `CONTRIBUTING.md` at root is a thin router → `docs/contributing.md` + `dev-docs/development.md`
- ADRs in `dev-docs/decisions/`; ARCHITECTURE in `dev-docs/architecture.md`

## `/ws-docs` surface

| Invocation | Behavior |
|---|---|
| `/ws-docs` | Discovery — detailed table of artifacts and their state. Suggests next verb. No writes. |
| `/ws-docs init` | First-time setup: scaffold both trees, write `.claude/docs-config.yaml`, append CLAUDE.md section, generate `CHANGELOG.md` from git history, write initial CONTRIBUTING set. Background subagent team. |
| `/ws-docs audit` | Verbose dijagnoza. Lists commits since last CHANGELOG entry, detected public API changes, ADR candidates. Optionally writes `docs-audit-<date>.md` report. No code writes. |
| `/ws-docs catchup` | Smart catch-up after drift: changelog-analyzer + public-api-watcher + arch-watcher run in parallel; user triages proposals; one big commit `docs: catchup since vX.Y.Z`. |
| `/ws-docs repair` | Add missing artifacts only (never delete). Detects + prompts confirmation + creates. |
| `/ws-docs write <type> [topic]` | Write a single Diátaxis doc. `type` = `tutorial \| howto \| reference \| explanation`. Audience prompt for `howto/reference/explanation`; tutorial always user. If `topic` missing, AskUserQuestion for it. |
| `/ws-docs adr "<decision>"` | Create new ADR in `dev-docs/decisions/`. |
| `/ws-docs architecture` | Regenerate `dev-docs/architecture.md`. Diff + confirm before write. |
| `/ws-docs contributing` | Regenerate 3-file CONTRIBUTING set. Diff + confirm before write. |
| `/ws-docs changelog [version]` | No arg: update `[Unreleased]`. With version: cut new version + new `[Unreleased]`. Always mirrors to `docs/changelog.md`. |
| `/ws-docs release-notes [version]` | Linear-style release notes with screenshot placeholders → `docs/release-notes/<version>.md`. |

### Discovery dashboard format

Detailed per-artifact table:

```
ws-docs status
─────────────────────────────────────────────────────────────────
Artifact                  Status      Notes
─────────────────────────────────────────────────────────────────
docs/                     ✓ present    12 files, last mtime 5d ago
  docs/index.md           ✓ exists     mirrors README ✓
  docs/tutorials/         ✓ present    1 file
  docs/how-to/            ⚠ empty      no content yet
  docs/reference/         ✓ present    4 files
  docs/explanation/       ⚠ stale      last update 3 months ago
dev-docs/                 ✗ missing    repair will create it
CHANGELOG.md              ⚠ behind     8 commits ahead of last entry (v1.2.0)
docs/changelog.md         ⚠ stale      out of sync with root (rerun mirror)
CONTRIBUTING.md           ✓ routes     points to docs/ + dev-docs/
.claude/docs-config.yaml  ✗ missing    init has not run

Suggested:
  /ws-docs init      (no config — first-time setup)
  /ws-docs catchup   (8 commits to fold into CHANGELOG)
  /ws-docs repair    (create missing dev-docs/, mirror changelog)
```

### Live subagent dispatch surface

Background team mode for heavy verbs (`init`, `catchup`, `architecture`, `contributing`). The main command dispatches subagents via the Agent tool with `run_in_background: true`, polls their status via TaskList/TaskGet at ~3-5 second intervals, and prints periodic status updates (not in-place refresh — each tick is a new printed block):

```
/ws-docs init  —  4 subagents

⏳ architecture-documenter   12s   writing dev-docs/architecture.md
⏳ contributing-generator    08s   analyzing tooling...
✓ tutorial-writer           18s   docs/tutorials/getting-started.md
⏳ changelog-analyzer        15s   parsed 240/247 commits
```

Lightweight verbs (`write`, `adr`, `release-notes`) use a single-line spinner.

## Auto-maintenance: CLAUDE.md + hooks

### CLAUDE.md section (appended by `init`)

Committed to repo so the whole team gets the same instructions.

```markdown
# Documentation maintenance

This project uses the WS dual-track-docs convention (docs-agent plugin).

- `docs/` — user-facing (VitePress-publishable)
- `dev-docs/` — internal contributor
- Single CHANGELOG.md at root, mirrored to docs/changelog.md
- ADRs in dev-docs/decisions/

## Always do

- After completing a group of code changes, append an entry to `CHANGELOG.md`
  under `[Unreleased]` using the `keep-a-changelog` skill (auto-loads on the
  word "changelog"). Map: feat→Added, fix→Fixed, perf/refactor→Changed,
  security→Security, breaking→**BREAKING:** prefix.
- When introducing a new architectural pattern, framework choice, persistence
  layer, or service boundary, propose `/ws-docs adr "<decision>"` before
  finishing.
- When public API/CLI surface changes, update `docs/reference/` to match.
- When adding a user-facing feature, consider `/ws-docs write tutorial|howto`
  for `docs/`.

## On request

- `/ws-docs` — status / audit
- `/ws-docs <verb>` — explicit intent (init/audit/catchup/repair/write/adr/
  architecture/contributing/changelog/release-notes)
```

### Hooks (full enforcement, opt-in per project)

Plugin registers two hooks in `plugins/docs-agent/hooks/hooks.json`. Both first check whether `.claude/docs-config.yaml` exists in the project; if not, they exit 0 (no-op). This makes the hooks opt-in per project, never globally imposed.

**`PreToolUse` matcher `Bash`** (script: `plugins/docs-agent/hooks/enforce-changelog.sh`):
- If `tool_input.command` matches `git commit` (excluding `--allow-empty`):
  - Read staged diff
  - If diff contains code changes (anything outside `docs/`, `dev-docs/`, `CHANGELOG.md`, `*.md`) AND `CHANGELOG.md` is NOT staged AND commit type is not in skip-set (`docs, chore, test, style, build, ci`), block with `{"decision": "deny", "reason": "Code changes pending without CHANGELOG entry. Run /ws-docs changelog or add entry manually under [Unreleased]."}`
- Override: user can confirm and re-run; or commit with a type in the skip-set.

**`Stop` hook** (script: `plugins/docs-agent/hooks/enforce-stop.sh`):
- Inspect `git diff` and `git diff --cached` for code changes since last commit
- If there are uncommitted code changes AND CHANGELOG has no matching new entry, return `{"decision": "block", "reason": "Code changes uncommitted with no corresponding CHANGELOG entry. Update changelog or confirm to stop anyway."}`
- User can answer "yes, stop anyway" via the standard AskUserQuestion flow that follows the block.

Both hooks read `.claude/docs-config.yaml` for the `auto.enforce_via_hooks` flag — if `false`, exit 0.

## `.claude/docs-config.yaml` schema

```yaml
docs:
  initialized: 2026-05-29
  version: 1                    # config schema version
  user_track: docs
  dev_track: dev-docs
  default_audience: ask         # ask | user | dev
  auto:
    changelog_per_commit: true
    adr_for_arch_changes: true
    enforce_via_hooks: true
  surface:
    subagent_status: compact    # compact | verbose | none
```

This file is **committed to the repo** so the whole team shares the binding.

## Catchup logic

`/ws-docs catchup` runs 3 subagents in parallel, then triages with the user.

### Changelog (changelog-analyzer)

- Reads `git log` since the last entry under `[Unreleased]` or last version tag
- Maps commits to KaC sections via Conventional Commits type:
  - `feat` → Added
  - `fix` → Fixed
  - `perf`, `refactor`, `revert` → Changed
  - `feat!` / `BREAKING CHANGE` → Changed (prefixed `**BREAKING:**`)
  - security fix → Security
- Excludes types in `skip_types` from `.claude/docs-config.yaml`
- Returns proposed entries; user accepts all, selects, or skips

### Public API (public-api-watcher — NEW agent)

- Diffs exports/CLI/schema across commit range:
  - TypeScript: added/removed `export`s
  - Python: changes in `__all__`, class signatures
  - CLI: changes in argparse / click / cobra definitions (regex-based heuristic)
  - GraphQL: schema additions
- Returns list of `docs/reference/<file>.md` files that need updating

### Architectural signals (arch-watcher — NEW agent)

Looks for these 4 signals across commits since last ADR:

1. **`BREAKING CHANGE`** in commit message body or `!` in type
2. **Keywords** in subject/body: `adopt`, `migrate`, `switch`, `replace`, `introduce`
3. **Diff size + path patterns**: large diffs (>500 lines) touching `infra/`, `config/`, `schema/`, `*.toml`, `*.yaml`, `migrations/`, top-level config files
4. **New dependencies**: additions in `package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`, `pyproject.toml`, `pubspec.yaml`

Returns ADR candidates with suggested titles.

### Triage UX

After analysis, user triages each category interactively. One big commit at the end: `docs: catchup since v1.2.0`.

## Subagents (existing + new)

**Existing (reused from PR 1):**
- `docs-architect` — orchestrates init / catchup planning
- `tutorial-writer`, `api-documenter`, `changelog-analyzer`, `adr-writer`, `contributing-generator`, `architecture-documenter`, `release-notes-writer`

All accept `destination_track` and `destination_path` inputs (already added in PR 1).

**New:**
- `docs-doctor` — discovery scanner; returns structured table of artifact states
- `public-api-watcher` — diffs exports/CLI/schema
- `arch-watcher` — detects 4 architectural signals

## Skills (no changes)

`dual-track-docs`, `diataxis`, `keep-a-changelog`, `conventional-commits`, `style-guide`, `adr` — all stay. Only the `dual-track-docs` description gets a one-line update noting `/ws-docs` as the unified entry.

## Files

### New (plugins/docs-agent/)

- `commands/ws-docs.md` — the single unified command
- `agents/docs-doctor.md`
- `agents/public-api-watcher.md`
- `agents/arch-watcher.md`
- `hooks/hooks.json`
- `hooks/enforce-changelog.sh`
- `hooks/enforce-stop.sh`

### Deleted (plugins/docs-agent/commands/)

- `docs.md`
- `docs-tutorial.md`
- `docs-howto.md`
- `docs-reference.md`
- `docs-explanation.md`
- `adr.md`
- `architecture.md`
- `contributing.md`
- `changelog.md`
- `changelog-entry.md`
- `release-notes.md`

### Modified

- `plugins/docs-agent/UPGRADE-NOTES.md` — prepend v3.0.0 section with migration table
- `plugins/docs-agent/skills/dual-track-docs/SKILL.md` — replace the "Routing rules for docs-agent commands" table with a single row pointing to `/ws-docs <verb>`
- `plugins/docs-agent/.claude-plugin/plugin.json` — description tweak (unified entry)
- `.claude-plugin/marketplace.json` — bump docs-agent to v3.0.0

## Rollout

### PR 2 — `/ws-docs` consolidation + automation

Implement all of the above (consolidation + new subagents + hooks + version bump). Single big PR. Verification: `claude plugin update docs-agent` shows v3.0.0; `/ws-docs` listed; old commands gone; YAML/JSON parses.

### PR 3 — Marketplace migration

Apply `/ws-docs init` to the marketplace itself. Generate root `CHANGELOG.md` from git history (~60 commits). Move dev-only docs from `docs/` to `dev-docs/`. Commit `.claude/docs-config.yaml`. Update root CLAUDE.md.

## Out of scope

- VitePress config scaffolding (still option A — structure only)
- Migration of other WS projects' docs
- Public docs site theme / branding / GitHub Pages deployment

## Acceptance criteria

1. `/ws-docs` (no args) returns the detailed status table within 10s
2. `/ws-docs init` in an empty repo produces: `docs/`, `dev-docs/`, `CHANGELOG.md`, mirror, `.claude/docs-config.yaml`, CLAUDE.md section, root CONTRIBUTING.md router
3. `/ws-docs catchup` after at least 5 commits since last entry produces a triage prompt with proposed CHANGELOG entries
4. `/ws-docs write howto "<topic>"` with `default_audience: ask` prompts the user, then writes to the chosen track
5. `/ws-docs adr "<decision>"` writes a numbered ADR in `dev-docs/decisions/`
6. Hooks are no-op in projects without `.claude/docs-config.yaml`
7. Hooks block code commits without CHANGELOG in projects WITH `.claude/docs-config.yaml` and `auto.enforce_via_hooks: true` (with user override path)
8. All 11 old commands return "unknown command" after PR 2
9. Marketplace itself follows the convention end-to-end after PR 3
