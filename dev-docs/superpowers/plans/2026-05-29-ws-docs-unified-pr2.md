# /ws-docs Unified Entry — PR 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship docs-agent v3.0.0 — collapse 11 docs commands into a single `/ws-docs` entry with 10 verbs and a discovery default, add 3 new subagents (docs-doctor, public-api-watcher, arch-watcher), add opt-in PreToolUse + Stop hooks gated by `.claude/docs-config.yaml`, delete the old commands, update docs.

**Architecture:** One large slash-command file (`ws-docs.md`) acts as a verb router; it dispatches to existing agents (reused from v2.1.0) plus 3 new ones, using `run_in_background: true` for heavy verbs. Hooks live in `plugins/docs-agent/hooks/` and exit 0 when `.claude/docs-config.yaml` is missing, making enforcement opt-in per project. No back-compat for old commands — they are deleted outright.

**Tech Stack:** Markdown slash commands and skill files with YAML frontmatter, JSON plugin/hook manifests, bash hook scripts. Verification is grep + JSON validity + `bash -n` + python yaml + hook smoke tests.

---

## File Structure

**Create (7 files):**

- `plugins/docs-agent/commands/ws-docs.md` — the unified verb router (single source of all `/ws-docs *` behavior)
- `plugins/docs-agent/agents/docs-doctor.md` — discovery / status scanner agent
- `plugins/docs-agent/agents/public-api-watcher.md` — diffs exports / CLI / schema across a commit range
- `plugins/docs-agent/agents/arch-watcher.md` — detects 4 architectural-change signals across commits
- `plugins/docs-agent/hooks/hooks.json` — plugin hook registration (PreToolUse + Stop)
- `plugins/docs-agent/hooks/enforce-changelog.sh` — PreToolUse Bash matcher; blocks `git commit` without changelog
- `plugins/docs-agent/hooks/enforce-stop.sh` — Stop hook; blocks claude stop if uncommitted code lacks changelog entry

**Delete (11 files — old commands):**

- `plugins/docs-agent/commands/docs.md`
- `plugins/docs-agent/commands/docs-tutorial.md`
- `plugins/docs-agent/commands/docs-howto.md`
- `plugins/docs-agent/commands/docs-reference.md`
- `plugins/docs-agent/commands/docs-explanation.md`
- `plugins/docs-agent/commands/adr.md`
- `plugins/docs-agent/commands/architecture.md`
- `plugins/docs-agent/commands/contributing.md`
- `plugins/docs-agent/commands/changelog.md`
- `plugins/docs-agent/commands/changelog-entry.md`
- `plugins/docs-agent/commands/release-notes.md`

**Modify (4 files):**

- `plugins/docs-agent/skills/dual-track-docs/SKILL.md` — replace the per-command routing table with a single row pointing to `/ws-docs <verb>`
- `plugins/docs-agent/UPGRADE-NOTES.md` — prepend v3.0.0 section with migration table from v2.x
- `plugins/docs-agent/.claude-plugin/plugin.json` — tweak description to mention unified entry
- `.claude-plugin/marketplace.json` — bump docs-agent version `2.1.0` → `3.0.0` + sync description

---

### Task 1: Create the unified `/ws-docs` command

**Files:**
- Create: `plugins/docs-agent/commands/ws-docs.md`

- [ ] **Step 1: Write the file**

Write the following content to `plugins/docs-agent/commands/ws-docs.md`. The frontmatter `description` is quoted to be safe against future colon insertions.

```markdown
---
description: "Unified docs entry: discovery, init, audit, catchup, repair, write, adr, architecture, contributing, changelog, release-notes"
arguments:
  - name: verb
    description: "Verb: init | audit | catchup | repair | write | adr | architecture | contributing | changelog | release-notes (omit for discovery)"
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

## Routing

Read the verb from `{{ verb }}`. If empty → **discovery** mode. Otherwise dispatch the verb.

### No verb → Discovery

Run the `docs-doctor` agent (Task tool, foreground — fast). It returns a structured report. Render this exact table format:

\`\`\`
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
\`\`\`

State icons: `✓ present`, `⚠ stale|behind|empty`, `✗ missing`. Suggest verbs based on detected gaps. Do not write anything.

### verb = init

First-time setup. Dispatch in parallel (Agent tool with `run_in_background: true`):

1. `architecture-documenter` → writes `dev-docs/architecture.md`
2. `contributing-generator` → writes the 3-file CONTRIBUTING set
3. `changelog-analyzer` → generates root `CHANGELOG.md` from git history (and mirrors)
4. `tutorial-writer` → writes `docs/tutorials/getting-started.md` if absent

While they run, in the main session:
- Create directories: `docs/{tutorials,how-to,reference,explanation,release-notes}/` and `dev-docs/{decisions,runbooks,reference,explanation}/`
- Create `index.md` stubs in each subfolder if missing (one line: `# <Subfolder>`)
- Write `.claude/docs-config.yaml` with defaults (see schema below). Prompt the user via AskUserQuestion if they want to override `default_audience` (ask | user | dev) or `auto.enforce_via_hooks` (true | false).
- Append the "Documentation maintenance" section to root `CLAUDE.md` (create the file if missing). Do not overwrite existing content; if a previous v2.x maintenance section is detected (`# Documentation maintenance` heading), replace it; otherwise append.

Poll the dispatched agents every 3-5 seconds (TaskList / TaskGet) and print a status block per poll like:

\`\`\`
/ws-docs init  —  4 subagents

⏳ architecture-documenter   12s   writing dev-docs/architecture.md
⏳ contributing-generator    08s   analyzing tooling...
✓ tutorial-writer           18s   docs/tutorials/getting-started.md
⏳ changelog-analyzer        15s   parsed 240/247 commits
\`\`\`

When all complete, print a final summary listing every file created. Commit nothing automatically — print the suggested commit message:

\`\`\`
Suggested commit:
  git add docs/ dev-docs/ CHANGELOG.md CONTRIBUTING.md CLAUDE.md .claude/docs-config.yaml
  git commit -m "chore(docs): initialize dual-track docs via /ws-docs init"
\`\`\`

### verb = audit

Verbose dijagnoza. Dispatch foreground (single agent):
- `docs-doctor` with `mode: audit` — returns the same artifact table plus per-commit details since last CHANGELOG entry, detected public API changes, ADR candidates.

Render the same table as discovery, then a follow-up section:

\`\`\`
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
\`\`\`

Optionally write the report to `docs-audit-<YYYY-MM-DD>.md` if the user opts in (AskUserQuestion).

### verb = catchup

Run 3 agents in parallel (background):
1. `changelog-analyzer` (mode: propose) — returns proposed [Unreleased] entries
2. `public-api-watcher` — returns reference files needing update
3. `arch-watcher` — returns ADR candidates

While they run, render the same live status block format. When all complete, present an interactive triage:

\`\`\`
─────────────────
CHANGELOG (12 entries proposed):
  [A] Added — OTP login screen (WSC-142)  abc1234
  [A] Fixed — Token refresh race (WSC-138)  def5678
  ...
Action: [a]ccept all, [s]elect, [n]one
\`\`\`

Use AskUserQuestion to gather decisions. After the user triages each category, perform the writes (update CHANGELOG.md + mirror, edit reference files, write new ADR(s)), then stage them and create one commit:

\`\`\`bash
git add CHANGELOG.md docs/changelog.md docs/reference/ dev-docs/decisions/
git commit -m "docs: catchup since <last_version_or_sha>"
\`\`\`

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
- `tutorial` → `tutorial-writer`
- `howto` → `tutorial-writer` (it handles both)
- `reference` → `api-documenter`
- `explanation` → `tutorial-writer` (handles explanations too, per existing v2.1.0 behavior)

Pass `destination_track` and `destination_path` inputs to the agent. After the agent returns, print a one-line spinner status and a final "✓ wrote `<path>`" line.

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

## `.claude/docs-config.yaml` defaults

When `init` creates this file, use:

\`\`\`yaml
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
\`\`\`

## Constraints

- Never overwrite files without prompt + confirmation (except in `init` when files are missing).
- Never push or commit on the user's behalf without explicit verb authorization (only `catchup` commits automatically, and only after user triage).
- All file paths are relative to the project root unless explicitly noted.
- Heavy verbs (`init`, `catchup`, `architecture`, `contributing`) use `run_in_background: true`; lightweight verbs (`write`, `adr`, `release-notes`, `changelog`) run foreground.
```

- [ ] **Step 2: Verify the file**

Run:

```bash
python3 -c "import yaml; yaml.safe_load(open('plugins/docs-agent/commands/ws-docs.md').read().split('---')[1])" && echo "yaml OK"
wc -l plugins/docs-agent/commands/ws-docs.md
grep -E '^### verb = ' plugins/docs-agent/commands/ws-docs.md
```

Expected: `yaml OK`, length ~180-260 lines, and 10 `### verb = ...` lines (init, audit, catchup, repair, write, adr, architecture, contributing, changelog, release-notes).

- [ ] **Step 3: Commit**

```bash
find /Users/klukacin/Projects/development/ws-claude-marketplace/.git -name "*.lock" -delete 2>/dev/null
git add plugins/docs-agent/commands/ws-docs.md
git commit -m "feat(docs-agent): add unified /ws-docs entry with 10 verbs"
```

---

### Task 2: Create `docs-doctor` agent

**Files:**
- Create: `plugins/docs-agent/agents/docs-doctor.md`

- [ ] **Step 1: Write the agent file**

```markdown
---
description: Scans a project for documentation state (which artifacts exist, which are stale, which are missing) and returns a structured report for /ws-docs discovery and audit modes
tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# Docs Doctor Agent

Inspect a project to report on the state of its documentation in the dual-track-docs convention. You produce a status table, not file changes.

## Process

### 1. Read project state

Check existence and recency of:

- `docs/` and each subfolder (`tutorials/`, `how-to/`, `reference/`, `explanation/`, `release-notes/`)
- `dev-docs/` and each subfolder (`decisions/`, `runbooks/`, `reference/`, `explanation/`)
- Root `CHANGELOG.md`
- `docs/changelog.md` (the mirror)
- Root `CONTRIBUTING.md` (and whether it's the thin router pattern)
- `.claude/docs-config.yaml`

For each artifact gather:
- present | missing | stale | empty (empty = directory exists but no content files)
- file count (for directories)
- last mtime (for files; oldest mtime for directories — use `stat -f %m` on macOS or `stat -c %Y` on Linux; fallback to `git log -1 --format=%ct` if `stat` not available)
- relevant counts (e.g. for `CHANGELOG.md`: commits since last entry — derive by reading the file's last `## [` block and `git log --oneline <SHA>..HEAD` where SHA = latest CHANGELOG-modifying commit)

### 2. Determine "stale"

- A file is `stale` if it hasn't been touched in 90+ days AND has at least one commit affecting `docs/` since its last modification.
- A directory is `stale` if its newest file is stale.
- `CHANGELOG.md` is `behind` if there are commits since its last entry that aren't in the skip-set (docs/chore/test/style/build/ci by default; read `skip_types` from `.claude/docs-config.yaml` if present).

### 3. Identify suggestions

Based on detected state:
- No `.claude/docs-config.yaml` → suggest `/ws-docs init`
- `CHANGELOG.md` behind → suggest `/ws-docs catchup` (with commit count)
- Missing `dev-docs/` or `docs/changelog.md` → suggest `/ws-docs repair`
- All clean → "no action needed"

### 4. Audit mode (optional)

If invoked with `mode: audit` in your prompt, additionally include:
- Full list of commits since last CHANGELOG entry with subject lines
- Detected exports/CLI surface changes (delegate to `public-api-watcher` if available, or do a basic git-grep for `export ` additions)
- ADR candidates (look for keyword commits: `adopt`, `migrate`, `switch`, `replace`, `introduce`)

## Inputs

The invoking command may pass these structured inputs in your prompt:

- **`mode`** — `discovery` (default) or `audit`. Audit adds the deep-dive section.

## Output

Return a structured markdown report with two sections:

1. The artifact table (use exactly the format shown in the `/ws-docs` command file)
2. The "Suggested:" list of recommended next verbs

Do NOT write any files. Read-only operation.

## Constraints

- Bash commands must succeed on macOS bash 3.2 and Linux bash 4+. Prefer `stat -f` on macOS, fall back gracefully.
- Run independent checks in parallel where possible (e.g. one shell pipeline per top-level artifact).
- Total runtime budget: ~10 seconds for discovery, ~30 seconds for audit.
```

- [ ] **Step 2: Verify**

```bash
python3 -c "import yaml; yaml.safe_load(open('plugins/docs-agent/agents/docs-doctor.md').read().split('---')[1])" && echo "yaml OK"
grep -E '^## (Process|Inputs|Output|Constraints)$' plugins/docs-agent/agents/docs-doctor.md
```

Expected: `yaml OK` and 4 matching sections.

- [ ] **Step 3: Commit**

```bash
git add plugins/docs-agent/agents/docs-doctor.md
git commit -m "feat(docs-agent): add docs-doctor agent for discovery/audit"
```

---

### Task 3: Create `public-api-watcher` agent

**Files:**
- Create: `plugins/docs-agent/agents/public-api-watcher.md`

- [ ] **Step 1: Write the file**

```markdown
---
description: Diffs public API surface (TypeScript exports, Python __all__, CLI flags, GraphQL schema) across a git commit range and returns the set of docs/reference/ files that need updating
tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# Public API Watcher Agent

Detect changes to a project's externally-visible surface between two git refs and identify which `docs/reference/` files should be updated.

## Process

### 1. Determine the commit range

Accept `since` and `until` inputs (default: `since` = last `CHANGELOG.md`-modifying commit, `until` = HEAD).

### 2. Run language-specific detectors

For each ecosystem present in the repo, run a focused detector:

**TypeScript / JavaScript** (presence of `package.json`):
- `git diff <since>..<until> -- '*.ts' '*.tsx' '*.js' '*.jsx' | grep -E '^[+-]export '` — added/removed exports
- For each changed file, record: file path, added exports, removed exports

**Python** (presence of `pyproject.toml` or `setup.py` or `requirements.txt`):
- `git diff <since>..<until> -- '*.py' | grep -E '^[+-]__all__ ?='` — `__all__` changes
- `git diff <since>..<until> -- '*.py' | grep -E '^[+-](class|def) [A-Z_]'` — public class/function additions (heuristic: starts with uppercase letter)

**CLI flag changes** (heuristic, regex-based):
- Look for changes to argparse `add_argument(`, click `@click.option(`, click `@click.command(`, cobra `cmd.Flags()` declarations
- `git diff <since>..<until> | grep -E '^[+-].*(add_argument|@click\.option|@click\.command|Flags\(\)\.[A-Z])'`

**GraphQL** (presence of `.graphql` files):
- `git diff <since>..<until> -- '*.graphql' '*.gql' | grep -E '^[+-]\s*(type|input|enum|interface|union) '` — schema declarations

### 3. Map surface changes to docs/reference/ files

For each detected surface change, map to a likely `docs/reference/` target by heuristic:
- Module `src/api/` → `docs/reference/api.md`
- CLI binary `bin/foo` → `docs/reference/cli.md`
- GraphQL schema → `docs/reference/graphql.md`
- Otherwise → `docs/reference/<module-basename>.md`

If the candidate file doesn't exist, flag it as "create new" rather than "update existing".

## Inputs

- **`since`** — git ref (SHA, tag, or relative like `HEAD~10`). Default: last `CHANGELOG.md`-modifying commit.
- **`until`** — git ref. Default: `HEAD`.

## Output

A structured list:

\`\`\`
Public API changes detected (<since>..<until>):

  src/api.ts (TypeScript)
    + getUser
    + listSessions
    - getUserByEmail (removed — breaking change!)
  → suggest update: docs/reference/api.md

  bin/foo (CLI)
    + new flag: --json
  → suggest update: docs/reference/cli.md (create new — does not exist)
\`\`\`

If no changes found, return: `No public API changes between <since> and <until>.`

Do NOT write any files. Read-only.

## Constraints

- Detectors must not error if the language isn't present — skip silently.
- Runtime budget: ~15 seconds for typical 10-commit ranges, ~60 seconds for large ranges.
```

- [ ] **Step 2: Verify**

```bash
python3 -c "import yaml; yaml.safe_load(open('plugins/docs-agent/agents/public-api-watcher.md').read().split('---')[1])" && echo "yaml OK"
grep -E '^## (Process|Inputs|Output|Constraints)$' plugins/docs-agent/agents/public-api-watcher.md
```

Expected: `yaml OK` and 4 matching sections.

- [ ] **Step 3: Commit**

```bash
git add plugins/docs-agent/agents/public-api-watcher.md
git commit -m "feat(docs-agent): add public-api-watcher agent"
```

---

### Task 4: Create `arch-watcher` agent

**Files:**
- Create: `plugins/docs-agent/agents/arch-watcher.md`

- [ ] **Step 1: Write the file**

```markdown
---
description: Scans commits for architectural-change signals (BREAKING CHANGE, keywords, large diffs on infra/schema paths, new dependencies) and returns ADR candidates
tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# Arch Watcher Agent

Detect architectural decisions hiding in commit history that should have ADRs and return them as candidates for `/ws-docs adr`.

## Process

### 1. Determine the commit range

Accept `since` and `until` inputs (default: `since` = last commit that modified `dev-docs/decisions/`, `until` = HEAD; if no ADRs exist, scan last 50 commits).

### 2. Run 4 signal detectors

Run each detector on the same commit range and merge results:

**Signal A — BREAKING CHANGE** (Conventional Commits):
- `git log <since>..<until> --grep='BREAKING CHANGE' --format='%H %s'`
- `git log <since>..<until> --format='%H %s' | grep -E '^[a-f0-9]+ [a-z]+!:'`

**Signal B — Keywords in subject or body**:
- Keywords: `adopt`, `migrate`, `switch`, `replace`, `introduce`
- `git log <since>..<until> --format='%H %s%n%b' | awk '/^[a-f0-9]/{sha=$1; sub(/^[a-f0-9]+ /,""); subj=$0; next} { for (k in keywords) if (tolower($0) ~ k) print sha, subj }' BEGIN='keywords["adopt"]=1;keywords["migrate"]=1;keywords["switch"]=1;keywords["replace"]=1;keywords["introduce"]=1'`
- Simpler shell-only approach: `git log <since>..<until> -i --grep='adopt\|migrate\|switch\|replace\|introduce' --format='%H %s'`

**Signal C — Large diffs on infra / schema / config paths**:
- Watch paths: `infra/`, `config/`, `schema/`, `migrations/`, top-level `*.toml`, `*.yaml`, `*.yml`, `Dockerfile`, `docker-compose.*`, `terraform/`, `helm/`, `.github/workflows/`
- `git log <since>..<until> --format='%H' -- <paths>` + `git show <SHA> --stat | tail -1` per SHA — flag commits with >500 lines changed in those paths

**Signal D — New dependencies**:
- Watch manifest files: `package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`, `pyproject.toml`, `pubspec.yaml`
- `git log <since>..<until> --format='%H' -- <manifests>` + `git show <SHA> -- <manifest> | grep -E '^\+\s+\".*\":' or similar pattern per file type`

### 3. De-duplicate and propose

Merge signals by commit SHA. Each candidate gets:
- SHA
- Subject line
- List of signals triggered (e.g. `[keyword(migrate), new dep(jsonwebtoken)]`)
- Suggested ADR title (derive from subject — e.g. "Migrate auth to JWT" → "Adopt JWT for session tokens")

Filter out commits where the only signal is a small dependency bump in a CI config or test-only manifest.

## Inputs

- **`since`** — git ref. Default: last commit affecting `dev-docs/decisions/`; or `HEAD~50` if no ADRs exist.
- **`until`** — git ref. Default: `HEAD`.

## Output

Markdown list:

\`\`\`
ADR candidates (<since>..<until>):

  feb1234  "Migrate auth to JWT"
    signals: keyword(migrate), new dep(jsonwebtoken)
    suggested title: "Adopt JWT for session tokens"

  abc4567  "Switch to PostgreSQL from SQLite"
    signals: BREAKING CHANGE, keyword(switch), large diff (migrations/)
    suggested title: "Adopt PostgreSQL as primary database"
\`\`\`

If no candidates, return: `No architectural signals between <since> and <until>.`

Do NOT write any files. Read-only.

## Constraints

- Detectors must not error if a manifest isn't present — skip silently.
- Avoid duplicate candidates: if the same commit triggers multiple signals, list it once with all signals.
- Runtime budget: ~20 seconds.
```

- [ ] **Step 2: Verify**

```bash
python3 -c "import yaml; yaml.safe_load(open('plugins/docs-agent/agents/arch-watcher.md').read().split('---')[1])" && echo "yaml OK"
grep -E '^## (Process|Inputs|Output|Constraints)$' plugins/docs-agent/agents/arch-watcher.md
```

Expected: `yaml OK` and 4 matching sections.

- [ ] **Step 3: Commit**

```bash
git add plugins/docs-agent/agents/arch-watcher.md
git commit -m "feat(docs-agent): add arch-watcher agent"
```

---

### Task 5: Create the two hook scripts

**Files:**
- Create: `plugins/docs-agent/hooks/enforce-changelog.sh`
- Create: `plugins/docs-agent/hooks/enforce-stop.sh`

These are bash scripts that read JSON from stdin (the hook event), check whether `.claude/docs-config.yaml` exists in `cwd`, and emit JSON decisions on stdout. They exit 0 (no-op) when the config file is missing — making them opt-in per project.

- [ ] **Step 1: Write `enforce-changelog.sh`**

```bash
#!/usr/bin/env bash
# docs-agent PreToolUse hook
# Blocks `git commit` when staged code changes lack a CHANGELOG.md entry.
# No-op when .claude/docs-config.yaml is missing in the project.

set -euo pipefail

# Read the hook event from stdin
input=$(cat)

# Extract tool name and command via simple text parsing (avoid jq dependency)
tool_name=$(printf '%s' "$input" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
[[ "$tool_name" != "Bash" ]] && exit 0

# Extract the command field (single-line assumption; multi-line shell input is rare in hook events but acceptable to skip)
command=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' | head -1)

# Only act on `git commit` invocations (not amend, not --allow-empty)
case "$command" in
  *"git commit"*"--allow-empty"*) exit 0 ;;
  *"git commit"*) ;;
  *) exit 0 ;;
esac

# Opt-in check: only enforce if .claude/docs-config.yaml exists in cwd
[[ -f .claude/docs-config.yaml ]] || exit 0

# Honor auto.enforce_via_hooks (default true; explicit false disables)
enforce=$(awk '
  /^[[:space:]]*auto:/ {inauto=1; next}
  inauto && /^[^[:space:]]/ {inauto=0}
  inauto && /enforce_via_hooks:/ {
    sub(/^[[:space:]]*enforce_via_hooks:[[:space:]]*/,"")
    sub(/[[:space:]]+#.*$/,"")
    print; exit
  }
' .claude/docs-config.yaml)
[[ "$enforce" == "false" ]] && exit 0

# Detect skip-types from config (comma-list inside [...]); default skip set
skip_types_default="docs chore test style build ci"
skip_types=$(awk '
  /^[[:space:]]*changelog:/ {incl=1; next}
  incl && /^[^[:space:]]/ {incl=0}
  incl && /skip_types:/ {
    sub(/^[[:space:]]*skip_types:[[:space:]]*/,"")
    gsub(/[\[\]"'\'']/,"")
    gsub(/,/," ")
    print; exit
  }
' .claude/docs-config.yaml)
skip_types="${skip_types:-$skip_types_default}"

# Inspect staged diff: any code changes outside docs/, dev-docs/, *.md?
staged_files=$(git diff --cached --name-only 2>/dev/null || true)
[[ -z "$staged_files" ]] && exit 0

has_code=0
while IFS= read -r f; do
  case "$f" in
    docs/*|dev-docs/*|*.md|*.MD|CHANGELOG.md) ;;
    *) has_code=1 ;;
  esac
done <<< "$staged_files"

[[ $has_code -eq 0 ]] && exit 0  # only docs/changelog files — fine

# CHANGELOG.md must be in the staged set if has_code
if printf '%s\n' "$staged_files" | grep -q '^CHANGELOG\.md$'; then
  exit 0
fi

# Try to detect commit type from -m message in the command (best-effort)
msg=$(printf '%s' "$command" | sed -n "s/.*-m[[:space:]]*[\"']\([^\"']*\)[\"'].*/\1/p" | head -1)
commit_type=$(printf '%s' "$msg" | sed -n 's/^\([a-z]*\)[(:!].*/\1/p')

if [[ -n "$commit_type" ]]; then
  for t in $skip_types; do
    [[ "$commit_type" == "$t" ]] && exit 0
  done
fi

# Block
cat <<JSON
{
  "hookSpecificOutput": {
    "permissionDecision": "deny"
  },
  "systemMessage": "Code changes staged without a CHANGELOG.md entry. Add an entry under [Unreleased] via /ws-docs changelog, or stage CHANGELOG.md manually. To bypass once, prefix the commit with a skip type (docs:, chore:, test:, style:, build:, ci:)."
}
JSON
exit 2
```

- [ ] **Step 2: Write `enforce-stop.sh`**

```bash
#!/usr/bin/env bash
# docs-agent Stop hook
# Blocks claude stop when uncommitted code changes exist without a CHANGELOG.md update.
# No-op when .claude/docs-config.yaml is missing in the project.

set -euo pipefail

# Read the hook event from stdin (not directly used, but consume it)
cat > /dev/null || true

# Opt-in check
[[ -f .claude/docs-config.yaml ]] || exit 0

enforce=$(awk '
  /^[[:space:]]*auto:/ {inauto=1; next}
  inauto && /^[^[:space:]]/ {inauto=0}
  inauto && /enforce_via_hooks:/ {
    sub(/^[[:space:]]*enforce_via_hooks:[[:space:]]*/,"")
    sub(/[[:space:]]+#.*$/,"")
    print; exit
  }
' .claude/docs-config.yaml)
[[ "$enforce" == "false" ]] && exit 0

# Are there uncommitted code changes (working tree OR staged) outside docs?
diff_files=$( { git diff --name-only; git diff --cached --name-only; } 2>/dev/null | sort -u || true)
[[ -z "$diff_files" ]] && exit 0

has_code=0
while IFS= read -r f; do
  case "$f" in
    docs/*|dev-docs/*|*.md|*.MD|CHANGELOG.md) ;;
    *) has_code=1 ;;
  esac
done <<< "$diff_files"

[[ $has_code -eq 0 ]] && exit 0

# Has CHANGELOG been updated in the uncommitted set?
if printf '%s\n' "$diff_files" | grep -q '^CHANGELOG\.md$'; then
  exit 0
fi

# Block stop with a prompt
cat <<JSON
{
  "decision": "block",
  "reason": "Uncommitted code changes detected with no CHANGELOG.md update. Run /ws-docs changelog to add an entry, or confirm 'stop anyway' to override."
}
JSON
exit 0
```

- [ ] **Step 3: Make both scripts executable and syntax-check**

```bash
chmod +x plugins/docs-agent/hooks/enforce-changelog.sh plugins/docs-agent/hooks/enforce-stop.sh
bash -n plugins/docs-agent/hooks/enforce-changelog.sh && echo "changelog hook syntax OK"
bash -n plugins/docs-agent/hooks/enforce-stop.sh && echo "stop hook syntax OK"
```

Expected: both `OK` lines.

- [ ] **Step 4: Smoke test the changelog hook with mock input**

Run in a temp directory to confirm the opt-in (no-config) path works:

```bash
TMP=$(mktemp -d) && cd "$TMP" && git init -q
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"feat: x\""}}' | bash /Users/klukacin/projects/development/ws-claude-marketplace/plugins/docs-agent/hooks/enforce-changelog.sh; echo "exit=$?"
cd /Users/klukacin/projects/development/ws-claude-marketplace && rm -rf "$TMP"
```

Expected: `exit=0` (no `.claude/docs-config.yaml`, so no-op). Note the absolute path to the hook — bash will resolve it via the chmod +x file.

- [ ] **Step 5: Commit**

```bash
git add plugins/docs-agent/hooks/enforce-changelog.sh plugins/docs-agent/hooks/enforce-stop.sh
git commit -m "feat(docs-agent): add enforce-changelog and enforce-stop hook scripts"
```

---

### Task 6: Register hooks via `hooks.json`

**Files:**
- Create: `plugins/docs-agent/hooks/hooks.json`

- [ ] **Step 1: Write the manifest**

```json
{
  "description": "docs-agent enforcement hooks — block git commits and claude stops when CHANGELOG.md is out of sync. Opt-in via .claude/docs-config.yaml.",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/enforce-changelog.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/enforce-stop.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify JSON**

```bash
python3 -c "import json; json.load(open('plugins/docs-agent/hooks/hooks.json')); print('json OK')"
```

- [ ] **Step 3: Commit**

```bash
git add plugins/docs-agent/hooks/hooks.json
git commit -m "feat(docs-agent): register PreToolUse and Stop hooks"
```

---

### Task 7: Delete the 11 old commands

**Files:**
- Delete: 11 files in `plugins/docs-agent/commands/`

- [ ] **Step 1: Delete via git rm**

```bash
git rm plugins/docs-agent/commands/docs.md \
       plugins/docs-agent/commands/docs-tutorial.md \
       plugins/docs-agent/commands/docs-howto.md \
       plugins/docs-agent/commands/docs-reference.md \
       plugins/docs-agent/commands/docs-explanation.md \
       plugins/docs-agent/commands/adr.md \
       plugins/docs-agent/commands/architecture.md \
       plugins/docs-agent/commands/contributing.md \
       plugins/docs-agent/commands/changelog.md \
       plugins/docs-agent/commands/changelog-entry.md \
       plugins/docs-agent/commands/release-notes.md
```

- [ ] **Step 2: Verify only `/ws-docs` remains**

```bash
ls plugins/docs-agent/commands/
```

Expected: only `ws-docs.md`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(docs-agent)!: remove old docs commands in favor of /ws-docs

BREAKING CHANGE: /docs, /docs-tutorial, /docs-howto, /docs-reference,
/docs-explanation, /adr, /architecture, /contributing, /changelog,
/changelog-entry, /release-notes are all removed. Use /ws-docs <verb>.

Migration table in UPGRADE-NOTES.md."
```

---

### Task 8: Update the `dual-track-docs` skill

**Files:**
- Modify: `plugins/docs-agent/skills/dual-track-docs/SKILL.md`

The skill currently has a multi-row "Routing rules for docs-agent commands" table. Replace it with a single row pointing at `/ws-docs <verb>` plus a verbs table beneath.

- [ ] **Step 1: Read current file to confirm the section header**

```bash
grep -n '## Routing rules' plugins/docs-agent/skills/dual-track-docs/SKILL.md
```

Expected: one match.

- [ ] **Step 2: Apply the replacement**

Use the Edit tool with this exact old_string / new_string pair (the table block ends just before the next `## ` heading; the existing block is the 12-line table from PR 1):

old_string:
```
## Routing rules for docs-agent commands

| Command | Destination |
|---|---|
| `/docs` | Both tracks per Diátaxis category and audience |
| `/docs-tutorial` | `docs/tutorials/` (always user) |
| `/docs-howto` | Prompts audience → `docs/how-to/` or `dev-docs/runbooks/` |
| `/docs-reference` | Prompts audience → `docs/reference/` or `dev-docs/reference/` |
| `/docs-explanation` | Prompts audience → `docs/explanation/` or `dev-docs/explanation/` |
| `/adr` | `dev-docs/decisions/` (always internal) |
| `/architecture` | `dev-docs/architecture.md` (always internal) |
| `/contributing` | 3 files: root router, `docs/contributing.md`, `dev-docs/development.md` |
| `/changelog`, `/changelog-entry` | Root `CHANGELOG.md` + mirror to `docs/changelog.md` |
| `/release-notes` | `docs/release-notes/` |
```

new_string:
```
## Routing rules for docs-agent

As of v3.0.0, all docs operations route through `/ws-docs <verb>`:

| Verb | Destination |
|---|---|
| (no verb) | Discovery — prints the artifact status table, no writes |
| `init` | Scaffolds both tracks, writes `.claude/docs-config.yaml`, appends CLAUDE.md section, generates CHANGELOG.md, 3-file CONTRIBUTING |
| `audit` | Verbose dijagnoza; optionally writes `docs-audit-<date>.md` |
| `catchup` | Proposes CHANGELOG entries, reference updates, ADRs; user triages; one big commit |
| `repair` | Creates missing artifacts only (never deletes) |
| `write <type> [topic]` | One Diátaxis doc; `type` = `tutorial \| howto \| reference \| explanation` |
| `adr "<decision>"` | New ADR in `dev-docs/decisions/` |
| `architecture` | Regenerate `dev-docs/architecture.md` (diff + confirm) |
| `contributing` | Regenerate 3-file CONTRIBUTING set (diff + confirm) |
| `changelog [version]` | Update `[Unreleased]` or cut version; mirrors to `docs/changelog.md` |
| `release-notes [version]` | Linear-style notes → `docs/release-notes/<version>.md` |
```

- [ ] **Step 3: Verify**

```bash
grep -q '/ws-docs <verb>' plugins/docs-agent/skills/dual-track-docs/SKILL.md && echo "OK"
grep -cE '^\| `(init|audit|catchup|repair|write|adr|architecture|contributing|changelog|release-notes)' plugins/docs-agent/skills/dual-track-docs/SKILL.md
```

Expected: `OK` and count of 10 verb rows.

- [ ] **Step 4: Commit**

```bash
git add plugins/docs-agent/skills/dual-track-docs/SKILL.md
git commit -m "docs(docs-agent): dual-track-docs skill points at /ws-docs verbs"
```

---

### Task 9: Update UPGRADE-NOTES with v3.0.0 section + bump versions + push

**Files:**
- Modify: `plugins/docs-agent/UPGRADE-NOTES.md`
- Modify: `plugins/docs-agent/.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Prepend v3.0.0 section to UPGRADE-NOTES**

```bash
python3 <<'PY'
new_section = """# docs-agent v3.0.0 — Unified /ws-docs entry (BREAKING)

## What Changed in v3.0.0

### Breaking
All eleven prior commands are removed. There is no back-compat alias.

### Migration table

| v2.x command | v3.0.0 equivalent |
|---|---|
| `/docs` | `/ws-docs init` |
| `/docs-tutorial <topic>` | `/ws-docs write tutorial <topic>` |
| `/docs-howto <topic>` | `/ws-docs write howto <topic>` |
| `/docs-reference <topic>` | `/ws-docs write reference <topic>` |
| `/docs-explanation <topic>` | `/ws-docs write explanation <topic>` |
| `/adr "<decision>"` | `/ws-docs adr "<decision>"` |
| `/architecture` | `/ws-docs architecture` |
| `/contributing` | `/ws-docs contributing` |
| `/changelog [version]` | `/ws-docs changelog [version]` |
| `/changelog-entry <type> <text>` | removed — handled automatically by /ws-commit-push-pr and the CLAUDE.md maintenance rules added by `/ws-docs init` |
| `/release-notes [version]` | `/ws-docs release-notes [version]` |

Run `/ws-docs` (no args) to see the discovery report for your project, then `/ws-docs init` if you haven't initialized.

### New: discovery + automation

- `/ws-docs` with no args returns a per-artifact status table (no writes).
- `/ws-docs init` writes `.claude/docs-config.yaml` and appends a "Documentation maintenance" section to root `CLAUDE.md`. After init, Claude knows to update CHANGELOG after code changes, propose ADRs for architectural changes, and update `docs/reference/` for public API changes.
- Two opt-in hooks: PreToolUse blocks `git commit` when staged code changes lack a CHANGELOG entry; Stop blocks claude stop when uncommitted code lacks a CHANGELOG entry. Both no-op without `.claude/docs-config.yaml`.

### New: subagent team for heavy verbs

`init`, `catchup`, `architecture`, `contributing` dispatch background subagents and print a live status block. Main session stays clean.

### New agents

- `docs-doctor` — scans project state, returns the artifact status table
- `public-api-watcher` — diffs exports/CLI/schema across commits, suggests `docs/reference/` updates
- `arch-watcher` — detects architectural-decision signals (BREAKING, keywords, large infra diffs, new dependencies)

## Migrating Existing v2.x Projects

1. Update the plugin: `/plugin update docs-agent@ws-marketplace`
2. Run `/ws-docs` in each project to see what's already in place.
3. Run `/ws-docs init` (idempotent — preserves existing content).
4. Commit the new `.claude/docs-config.yaml` and CLAUDE.md additions.

If you were using `/changelog-entry` in scripts or muscle-memory: stop. With v3.0.0 you either let `/ws-commit-push-pr` handle it (recommended) or run `/ws-docs changelog` for explicit edits.

---

"""

path = 'plugins/docs-agent/UPGRADE-NOTES.md'
with open(path) as f:
    existing = f.read()
with open(path, 'w') as f:
    f.write(new_section + existing)
print('prepended')
PY
```

Verify:

```bash
head -1 plugins/docs-agent/UPGRADE-NOTES.md
```

Expected: `# docs-agent v3.0.0 — Unified /ws-docs entry (BREAKING)`

- [ ] **Step 2: Update plugin.json description**

Read:

```bash
cat plugins/docs-agent/.claude-plugin/plugin.json
```

Edit (use the Edit tool to replace the `description` value with this exact string — preserve other fields):

```
Dual-track documentation suite with unified /ws-docs entry (discovery, init, audit, catchup, repair, write, adr, architecture, contributing, changelog, release-notes), opt-in PreToolUse/Stop hooks, and background subagent dispatch
```

Verify:

```bash
python3 -c "import json; d = json.load(open('plugins/docs-agent/.claude-plugin/plugin.json'))['description']; assert d.startswith('Dual-track documentation suite with unified /ws-docs entry'); print('plugin.json description OK')"
```

- [ ] **Step 3: Bump marketplace.json**

Edit `.claude-plugin/marketplace.json` — find the docs-agent entry, change `"version": "2.1.0"` to `"version": "3.0.0"` and update its `description` to match plugin.json (the long string above).

Verify:

```bash
python3 -c "
import json
mp = json.load(open('.claude-plugin/marketplace.json'))
for p in mp['plugins']:
    if p['name'] == 'docs-agent':
        assert p['version'] == '3.0.0', p['version']
        assert p['description'].startswith('Dual-track documentation suite with unified /ws-docs entry'), p['description'][:80]
        break
print('marketplace.json bumped to 3.0.0')
"
```

- [ ] **Step 4: Final verification sweep**

```bash
echo "=== JSON validity ==="
python3 -c "import json; json.load(open('.claude-plugin/marketplace.json')); json.load(open('plugins/docs-agent/.claude-plugin/plugin.json')); json.load(open('plugins/docs-agent/hooks/hooks.json')); print('JSON OK')"

echo "=== Version is 3.0.0 ==="
python3 -c "
import json
mp = json.load(open('.claude-plugin/marketplace.json'))
v = next(p['version'] for p in mp['plugins'] if p['name'] == 'docs-agent')
assert v == '3.0.0'
print('version OK')
"

echo "=== /ws-docs exists ==="
test -f plugins/docs-agent/commands/ws-docs.md && echo "command OK"

echo "=== 11 old commands gone ==="
old=(docs docs-tutorial docs-howto docs-reference docs-explanation adr architecture contributing changelog changelog-entry release-notes)
for c in "${old[@]}"; do
  if [ -f "plugins/docs-agent/commands/${c}.md" ]; then
    echo "STILL PRESENT: ${c}.md"
  fi
done
echo "(any 'STILL PRESENT' lines above = failure)"

echo "=== 3 new agents present ==="
for a in docs-doctor public-api-watcher arch-watcher; do
  test -f "plugins/docs-agent/agents/${a}.md" && echo "${a}: OK"
done

echo "=== hook scripts executable and syntactically valid ==="
test -x plugins/docs-agent/hooks/enforce-changelog.sh && bash -n plugins/docs-agent/hooks/enforce-changelog.sh && echo "enforce-changelog OK"
test -x plugins/docs-agent/hooks/enforce-stop.sh && bash -n plugins/docs-agent/hooks/enforce-stop.sh && echo "enforce-stop OK"

echo "=== YAML in all command/skill/agent files ==="
python3 -c "
import yaml, os
for root in ['plugins/docs-agent/commands', 'plugins/docs-agent/agents', 'plugins/docs-agent/skills']:
    for dp, _, files in os.walk(root):
        for fn in files:
            if fn.endswith('.md'):
                p = os.path.join(dp, fn)
                content = open(p).read()
                if content.startswith('---'):
                    yaml.safe_load(content.split('---')[1])
print('all YAML frontmatter parses')
"

echo "=== UPGRADE-NOTES has v3.0.0 ==="
head -1 plugins/docs-agent/UPGRADE-NOTES.md | grep -q '3.0.0' && echo "upgrade-notes OK"
```

Every line that doesn't begin with `===` must end with `OK` (or `JSON OK`, etc.). No `STILL PRESENT` lines.

- [ ] **Step 5: Commit and push**

```bash
find /Users/klukacin/Projects/development/ws-claude-marketplace/.git -name "*.lock" -delete 2>/dev/null

git add plugins/docs-agent/UPGRADE-NOTES.md \
        plugins/docs-agent/.claude-plugin/plugin.json \
        .claude-plugin/marketplace.json

git commit -m "$(cat <<'EOF'
feat(docs-agent)!: bump to v3.0.0 with unified /ws-docs entry

BREAKING CHANGE: All 11 prior commands removed. Replaced by /ws-docs
<verb>. Migration table in UPGRADE-NOTES.md.

New:
- /ws-docs discovery + 10 verbs (init/audit/catchup/repair/write/adr/
  architecture/contributing/changelog/release-notes)
- 3 new subagents: docs-doctor, public-api-watcher, arch-watcher
- Opt-in PreToolUse and Stop hooks gated by .claude/docs-config.yaml
- Background subagent dispatch with live status surface

Refs: dev-docs/superpowers/specs/2026-05-29-ws-docs-unified.md
Refs: dev-docs/superpowers/plans/2026-05-29-ws-docs-unified-pr2.md

Co-Authored-By: WS Agency AI suite <ai@ws.agency>
EOF
)"

git push
```

Expected: push succeeds; no merge conflicts.

---

## Self-Review Notes

**Spec coverage:**
- `/ws-docs` unified command with 10 verbs + discovery → Task 1 ✓
- 3 new subagents → Tasks 2, 3, 4 ✓
- 2 hook scripts → Task 5 ✓
- hooks.json registration → Task 6 ✓
- 11 old commands deleted → Task 7 ✓
- dual-track-docs skill updated → Task 8 ✓
- UPGRADE-NOTES v3.0.0 + version bump + push → Task 9 ✓

**Out of scope (PR 3):**
- Marketplace migration (apply /ws-docs init to this repo)

**Placeholder scan:** None — every step has exact content.

**Type / name consistency:**
- Agent names: `docs-doctor`, `public-api-watcher`, `arch-watcher` consistently used
- Verb names: init, audit, catchup, repair, write, adr, architecture, contributing, changelog, release-notes — consistent across spec, command, skill, UPGRADE-NOTES
- Config file: `.claude/docs-config.yaml` consistently used
- Version target: v3.0.0 used in commit messages, UPGRADE-NOTES, plugin.json, marketplace.json
