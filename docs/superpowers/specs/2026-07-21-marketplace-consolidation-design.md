# Design — Marketplace consolidation (commands, skills, agents)

**Date:** 2026-07-21
**Status:** Approved, implementation in progress
**Scope:** ws-commit-commands v3.0.0, ws-jira-enhancer (retired), ws-project-hub v0.2.0,
docs-agent v3.1.0, marketplace registry + docs surface

## Problem

An architecture review (2026-07-20) of every command, skill, and agent found the repo
converging on one good pattern — docs-agent's "one entry command, knowledge in skills,
agents only for execution" — while the other plugins lag behind it:

- `ws-jira-enhancer` is a separate plugin whose single command overlaps the Jira domain
  owned by `ws-commit-commands`, and its ticket format is knowledge trapped in a command.
- `ws-project-hub` has 8 flat `hub-*` commands (only plugin without the `ws-` namespace),
  three commands sharing one fan-out skeleton, a scan command that textually delegates to
  add-repo, conventions triplicated across command prose, and an agent with no command
  entry point.
- `docs-agent` carries one orphaned agent, duplicated detection logic, and format knowledge
  restated in agents that already exists in skills.
- Two live bugs: an ADR path contradiction and a CLAUDE.md marker-name drift.

## Relationship to prior specs

- **2026-07-20 Jira CLI migration (`b417d16`)** — workstream 2 below *extends and partially
  supersedes* it: the MCP→jira-cli mapping, auth model, config layer, and per-command changes
  stand as written, but `ws-jira-enhancer` is **retired and absorbed** instead of bumped to
  v1.1.0. Where the two conflict, this spec wins.
- **2026-07-18 product docs + Outline (`729edbb`)** — unchanged in substance, but its version
  targets renumber because consolidation lands first: ws-project-hub `role: docs` work ships
  as **v0.3.0** (after consolidation's v0.2.0) and docs-agent Outline verbs ship as
  **v3.2.0** (after cleanup's v3.1.0). That spec's `/hub-*` command references (clone-all,
  init, add-repo, sync, status) **map through workstream 3's rename table** when implemented;
  `/hub-sync` and `/hub-status` in its text mean `ws-hub-repos pull` / `ws-hub-status`.

## Workstream 1 — bug fixes (first, independent)

1. **`plugins/docs-agent/agents/adr-writer.md`** instructs writing ADRs to
   `docs/decisions/…` in three occurrences while its own Inputs section and the `adr` skill
   mandate `dev-docs/decisions/`. Fix: `dev-docs/decisions/` everywhere.
2. **ws-project-hub CLAUDE.md marker drift** — the template's regenerated region is bounded
   by `<!-- AUTO-GENERATED from project.yaml — do not edit by hand -->` …
   `<!-- /AUTO-GENERATED -->` with a `__REPO_SECTIONS__` placeholder inside (filled by
   `hub-init`), but `hub-add-repo` / `hub-scan` / `hub-describe` reference a bare
   `<!-- AUTO-GENERATED -->` marker that never literally appears (the real opening marker
   carries trailing text) — a regeneration that greps for the bare string misses the region.
   Fix now (independent of workstream 3): standardize every command and template on paired
   markers `<!-- ws-hub:repos:start -->` … `<!-- ws-hub:repos:end -->`, and document the
   marker pair in `project-hub-conventions` as the single definition.

## Workstream 2 — Jira domain consolidation (ws-commit-commands v3.0.0)

Everything Jira lives in one plugin. Implements the 2026-07-20 spec plus the merge:

1. **jira-cli migration** of `/ws-init`, `/ws-status`, `/ws-commit`, `/ws-commit-push-pr`,
   the SessionStart hook text, and `ws-jira-conventions` — exactly per `b417d16`
   (MCP tools dropped from frontmatter, `jira me` / `issue list -q` / `issue view --raw` /
   `issue move` / `worklog add` / `comment add`, double-apply guard,
   `smart_commit_trailer` default true).
2. **Absorb the enhancer.** New command `/ws-ticket "<description>"` in ws-commit-commands
   replaces `/ws-jira-enhancer`:
   - Generation logic (codebase research, Given/When/Then AC) moves out of command prose
     into a new **`ticket-writing` skill** (triggers: jira ticket, user story, acceptance
     criteria, enhance task, ticket description). The command loads the skill.
   - After generating, when the repo is bound (`.claude/ws-project.yaml`), offer
     **Create in Jira?** → `jira issue create -t<Type> -s"<summary>" -b"<body>" -p<PROJECT>
     --no-input`, print key + browse URL. Unbound → text only, say why.
   - Frontmatter: `Bash, Glob, Grep, Read, Task, AskUserQuestion`.
3. **Retire `ws-jira-enhancer`**: delete `plugins/ws-jira-enhancer/`, remove its
   marketplace.json entry. Breaking note tells users `/ws-jira-enhancer` → `/ws-ticket`.
4. Version: ws-commit-commands 2.1.0 → **3.0.0** (breaking: onboarding/auth change +
   absorbed plugin). Description updated in both plugin.json and marketplace.json.

## Workstream 3 — ws-project-hub consolidation (v0.2.0)

Commands stay **separate files** (per-command `allowed-tools` least-privilege beats a single
`/ws-hub` verb dispatcher), and — because a single file has one static `allowed-tools` —
the read-only status probe stays its own command rather than a verb of a mutating one.
Surface shrinks 8 → 6 and adopts the `ws-` namespace:

| New command | Replaces | Notes |
|---|---|---|
| `/ws-hub-init` | `/hub-init` | Registration steps reference the skill instead of restating them |
| `/ws-hub-status` | `/hub-status` | Read-only tools only (Bash git-read, Read); output ends with the `./invoke-ai.sh` launch hint |
| `/ws-hub-repos <pull\|clone>` | `/hub-sync`, `/hub-clone-all` | One mutating traversal skeleton, verb picks the git op (both verbs legitimately share clone/pull-capable Bash) |
| `/ws-hub-add-repo [--scan]` | `/hub-add-repo`, `/hub-scan` | `--scan` runs discovery first, then the same registration flow (single definition) |
| `/ws-hub-describe` | `/hub-describe` | Unchanged behavior, renamed |
| `/ws-hub-docs` | (new) | Dedicated command for `hub-architect`'s primary purpose (cross-repo architecture/contracts/deployment docs — today it is reachable only as an optional helper inside describe). At v0.2.0 it targets the hub's `docs/` exactly as the agent does today; docs-repo targeting arrives with v0.3.0 (`role: docs`, 2026-07-18 spec) |

- `/hub-launch` is dropped; launching is documented in the skill and hinted by
  `ws-hub-status`.
- **Rename blast radius** (all in this workstream): `templates/CLAUDE.md.tmpl`,
  `templates/README.md.tmpl`, `templates/invoke-ai.sh.tmpl` (all reference `/hub-*` names
  that newly initialized hubs would otherwise advertise forever), and
  `skills/project-hub-conventions/SKILL.md` (its workflows table and prose use the old
  names).
- **Single-source the knowledge** in `project-hub-conventions/SKILL.md`: `.gitignore`
  managed block, `project.yaml` schema, tech-inference table
  (package.json→node, pubspec.yaml→flutter, requirements.txt / pyproject.toml→python,
  Cargo.toml→rust, go.mod→go), path rules, CLAUDE.md marker pair (workstream 1). Commands
  reference the skill sections instead of restating them.
- Remove the stray `<name>-truth` term from the skill trigger (doc drift; the only other
  occurrence is the skill-trigger row in `docs/reference/commands.md`, updated in the same
  pass).
- Version 0.1.0 → **0.2.0** (0.x: breaking renames allowed; changelog carries a
  **BREAKING** rename table).

## Workstream 4 — docs-agent cleanup (v3.1.0)

`/ws-docs` surface is unchanged; this is agent/skill hygiene:

1. **Delete `agents/docs-architect.md`** (orphaned — no verb dispatches it). Its only
   non-duplicated knowledge (AI-readiness/llms.txt notes, docs-as-code enforcement bullets)
   folds into `diataxis`/`dual-track-docs` skills; the rest is already there.
2. **`docs-doctor` stops duplicating the detectors** — but NOT by nesting Task calls
   (docs-doctor is itself a Task-spawned subagent; nested spawning is version-fragile).
   Instead `/ws-docs audit` dispatches `arch-watcher` and `public-api-watcher` from the
   command alongside docs-doctor — the exact pattern `catchup` already uses. The duplicated
   keyword/export-diff prose is deleted from docs-doctor; its scope narrows to artifact
   presence/staleness.
3. **Writers load skills instead of restating them**: strip the MADR template from
   `adr-writer` (points at `adr` skill), the "Changelog vs Release Notes" table from
   `release-notes-writer` (points at `keep-a-changelog`), SemVer mapping from
   `changelog-analyzer` (points at `conventional-commits`). `api-documenter` **keeps** its
   TSDoc/GraphQL guidance — the duplicate copy dies with `docs-architect`, so nothing to
   move.
4. **Fix the quadrant overload**: rename `tutorial-writer` → `diataxis-writer`,
   parameterized by quadrant (`tutorial | howto | explanation`); the agent loads the
   `diataxis` skill and applies the correct quadrant discipline instead of blending three.
   Update **all** `tutorial-writer` references in `ws-docs.md` (write routing, the init
   dispatch list, and the status block), plus the example citation in
   `dev-docs/runbooks/add-agent.md`. (`reference` still routes to `api-documenter`.)
5. **Skill de-dup**: the commitlint/husky/release-please pipeline and SemVer-impact mapping
   live only in `conventional-commits`; `keep-a-changelog` links to them.
6. Version 3.0.0 → **3.1.0** (agents are internal-ish surface; renames noted under Changed
   with the old→new names).

## Marketplace + docs surface (per workstream, same commit)

Per the repo convention: marketplace.json and plugin.json stay in sync (including **tags**
— WS2 drops `atlassian`/`oauth`, adds `jira-cli`); `docs/reference/commands.md` and README
tables update with each workstream; CHANGELOG.md (+ `docs/changelog.md` mirror) gets entries
per workstream (**BREAKING:** prefixes for the enhancer retirement and hub renames).
Additional known referencing files: `docs/contributing.md` (plugin list — enhancer row) and
`docs/explanation/plugin-architecture.md` (two diagrams list the enhancer; the agents list
names `docs-architect`). Also update the stale docs-agent section in
`docs/reference/commands.md` (still documents pre-v3 `/docs-*` commands — drift found
2026-07-16) as part of workstream 4's docs pass.

## Verification

- WS1: grep shows no `docs/decisions` in adr-writer; one marker pair across all hub files.
- WS2: no `mcp__plugin_atlassian` string anywhere in the plugin; `/ws-ticket` exists;
  `plugins/ws-jira-enhancer/` gone; marketplace.json valid JSON, no enhancer entry.
- WS3: exactly 6 command files, all `ws-hub-*`; no bare `AUTO-GENERATED` marker anywhere
  (the `__REPO_SECTIONS__` placeholder inside the marker pair is the documented template
  fill mechanism and stays); skill contains the single schema/marker definitions.
- WS4: no `docs-architect.md`; docs-doctor contains no watcher keyword/export-diff prose;
  `/ws-docs audit` dispatches both watchers; no MADR template outside the `adr` skill;
  no `tutorial-writer` string anywhere in the plugin or runbooks.
- **All (rename blast radius):** repo-wide grep for every retired name
  (`ws-jira-enhancer`, `hub-init`, `hub-launch`, `hub-scan`, `hub-describe`,
  `hub-add-repo`, `hub-clone-all`, `hub-sync`, `hub-status`, `docs-architect`,
  `tutorial-writer`) across README, docs/, dev-docs/, plugins/ **including
  `plugins/ws-project-hub/templates/`** returns hits only in CHANGELOG history and
  `docs/superpowers/specs/` (historical design records).
- All: `python3 -c "import json; json.load(open('.claude-plugin/marketplace.json'))"`.

## Rollout order

1. WS1 bug fixes (own commit).
2. WS2 Jira consolidation (breaking; announce `/ws-jira-enhancer` → `/ws-ticket`,
   re-run `/ws-init` after installing jira-cli).
3. WS3 hub consolidation (breaking renames; announce old→new table).
4. WS4 docs-agent cleanup.
5. Prior specs implement afterward on the renumbered versions (hub v0.3.0, docs-agent
   v3.2.0).
