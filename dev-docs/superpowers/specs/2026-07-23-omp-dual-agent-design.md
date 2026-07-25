# Design — Dual-agent support: omp.sh + Claude Code (v3.4.0)

**Date:** 2026-07-23
**Status:** Approved, implementation in progress
**Scope:** all three plugins + hub templates + repo docs; lockstep release 3.4.0

## Problem

The marketplace must work equally well in omp (omp.sh, `can1357/oh-my-pi`) and Claude
Code. Research against omp's source (2026-07-22) established that omp natively consumes
the Claude plugin registry (`.claude-plugin/marketplace.json` fallback, same schema),
plugin commands (`$ARGUMENTS` supported), plugin skills, and plugin `agents/` dirs.
Three genuine gaps remain:

1. omp has **no `` !`cmd` `` context injection** — command "## Context" blocks arrive as
   literal text (only `description` frontmatter is honored; `allowed-tools` is ignored
   in favor of omp's own approval system).
2. omp **never reads a root-level `CLAUDE.md`** — only `.claude/CLAUDE.md` or an
   `AGENTS.md` walk-up (cwd→root). Hub project maps are invisible to omp today.
3. omp has **no `--add-dir`** — fine for nested hubs (everything under cwd), but
   sibling-pathed (`../`) legacy repos are unreachable, and per-sub-repo context files
   don't auto-load.

Non-portable and accepted as documented gaps: Claude shell-hook JSON (SessionStart Jira
dashboard, docs enforcement — omp hooks are TS modules), AskUserQuestion/Task as named
tools (omp equivalents: plain chat questions, its `task` agent).

## Decisions

| Question | Decision |
|---|---|
| Context injection gap | Keep `` !`cmd` `` blocks (Claude fast path) + one standard fallback note per command instructing the model to run unexpanded commands itself |
| Canonical context file | **`AGENTS.md` everywhere** (industry standard read by omp/Codex/others); `CLAUDE.md` becomes a thin `@AGENTS.md` import (both agents expand `@imports`). Applies to: hub template, **sub-repos** (same pattern, per-repo rules live in the sub-repo's AGENTS.md), product-docs scaffold, dual-track convention (`/ws-docs init`), and this repo itself as the reference example. The thin CLAUDE.md is kept (not deleted) because Claude Code's AGENTS.md fallback behavior varies by version — the import guarantees loading everywhere and cannot double-load (CLAUDE.md contains nothing but the import) |
| Launcher | `invoke-ai.sh` becomes an **interactive agent picker**: menu of registered agents (claude, omp), ENTER = last-used default, `--agent <name>`/`WS_HUB_AGENT` bypass, one-case-entry extensibility for future agents |
| Version | Lockstep **3.4.0**, cut + tagged per ADR 0002 |

## Workstream A — command portability pass (all plugins)

1. Every command with a `` !`cmd` `` Context block gains this note directly under the
   block (exact text, one line — deliberately worded WITHOUT the exclamation-backtick
   sequence, which Claude Code would itself expand):
   > If any Context value above still shows an unexpanded shell command (an
   > exclamation mark followed by a backtick-quoted command), your runtime does not
   > pre-execute context commands — run each one via bash now, before proceeding.
   Files (verified inventory): ws-commit-commands
   `ws-init|ws-status|ws-commit|ws-commit-push-pr|ws-clean-gone|ws-ticket` (6);
   ws-project-hub `ws-hub-init|ws-hub-add-repo|ws-hub-describe|ws-hub-repos` (4 —
   `ws-hub-status` and `ws-hub-docs` have no Context blocks); docs-agent `ws-docs.md`
   has none (no note needed).
2. First mention of AskUserQuestion per file → `AskUserQuestion (or a plain chat
   question when that tool is unavailable)`. Later mentions unchanged.
3. First mention of the Task tool per file → `the Task tool (omp: its task agent)`.
4. `${CLAUDE_PLUGIN_ROOT}` fallback (same sentence pattern in BOTH files): `ws-docs.md`
   publish/pull-back script path, AND `ws-hub-init.md` template/skill-vendoring paths —
   `(if CLAUDE_PLUGIN_ROOT is unset — e.g. in omp — use the plugin's install directory:
   the plugin root containing this command file)`.
5. No behavioral change for Claude Code — additions only. Verification includes a
   Claude Code smoke-read of one edited command to confirm the note renders literally.

## Workstream B — AGENTS.md convention flip

**ws-project-hub:**
- `templates/CLAUDE.md.tmpl` → renamed `templates/AGENTS.md.tmpl` (full content + the
  `ws-hub:repos` marker pair move as-is). New `templates/CLAUDE.md.tmpl` containing
  exactly:
  ```markdown
  @AGENTS.md
  <!-- Canonical project context lives in AGENTS.md (agent-neutral). Keep this file as a one-line import. -->
  ```
- `ws-hub-init` generates both files; `ws-hub-add-repo` / `ws-hub-describe` regenerate
  the marker region **in AGENTS.md** (all "CLAUDE.md region" wording updated). The
  modification allowlist in `ws-hub-add-repo.md` ("Only project.yaml, CLAUDE.md, and
  .gitignore may be modified") MUST gain AGENTS.md or the command forbids itself from
  writing the region.
- **Sub-repo convention**: sub-repos adopt the same pattern (per-repo rules in the
  sub-repo's `AGENTS.md`, thin `CLAUDE.md` import). The hub AGENTS.md template gains an
  explicit instruction: "When working inside `<sub-repo>/`, read `<sub-repo>/AGENTS.md`
  first — runtimes without multi-dir auto-load (omp) do not load it automatically."
- **AGENTS.md.tmpl content is rewritten agent-neutrally, not moved verbatim**: the old
  template self-references `<hub>/CLAUDE.md` and describes Claude-only `--add-dir`
  loading — self-references become AGENTS.md, and the context-loading section describes
  both agents (Claude: --add-dir auto-load; omp: walk-up + the read-first instruction).
- Also updated (blast radius): `templates/README.md.tmpl` (tracked-files list + tree),
  `agents/hub-architect.md` ("except CLAUDE.md if explicitly requested" line), the
  skill's frontmatter `description` ("CLAUDE.md cascade" → "context-file cascade").
- Product-docs scaffold (init step): docs repo gets `AGENTS.md` (writing rules) +
  thin `CLAUDE.md` import.
- `project-hub-conventions` skill: layout diagram, "CLAUDE.md cascade" section renamed
  "Context-file cascade" (AGENTS.md canonical, CLAUDE.md thin import, why: omp reads
  AGENTS.md walk-up but never root CLAUDE.md), marker-pair section retargeted to
  AGENTS.md.
- Sibling-legacy note: omp cannot reach `../` repos (no `--add-dir`); documented in the
  skill's path rules.

**docs-agent:**
- `dual-track-docs` skill: standard layout shows `AGENTS.md` (canonical, agent-neutral)
  + `CLAUDE.md ← thin @AGENTS.md import`; a short "Why AGENTS.md" note.
- `ws-docs.md` — ALL verbs that touch the context file, not just `init`: `init`
  scaffolds `AGENTS.md` + thin `CLAUDE.md`; `audit` and `repair` retarget their
  "CLAUDE.md `# Documentation maintenance` section" detection/append to **AGENTS.md**
  (otherwise repair re-fattens the thin CLAUDE.md and undoes the migration). When a
  project has a real (non-thin) `CLAUDE.md`, offer migration: move content to
  `AGENTS.md`, replace `CLAUDE.md` with the import line.
- Blast radius: `plugins/docs-agent/UPGRADE-NOTES.md` and `dual-track-docs/SKILL.md`
  lines describing "init appends to CLAUDE.md" get the AGENTS.md wording.

**This repo (reference example):** move root `CLAUDE.md` content to `AGENTS.md`;
`CLAUDE.md` becomes the thin import. Content updated where it self-references.

## Workstream C — invoke-ai.sh agent picker

`templates/invoke-ai.sh.tmpl` changes:

1. **Agent registry** — one function per agent + a registry list near the top,
   commented "add new agents here":
   - `claude`: current behavior (`claude --dangerously-skip-permissions --add-dir …`
     per accessible repo).
   - `omp`: `omp` launched at hub root, NO --add-dir equivalent; sibling-pathed
     (`../`) repos are listed as `⊘ unreachable in omp` in the summary table.
2. **Picker step runs BEFORE the summary** (the current `print_summary` both renders
   the table and builds `ADD_DIR_ARGS`, so the agent must be known first — decouple
   mount-arg building from summary rendering): numbered menu of registered agents;
   ENTER = default (last-used, cached in `~/.cache/ws-hub/last-agent`, falling back to
   `claude`); selection is persisted. The summary's reachability column is rendered for
   the chosen agent (`⊘ unreachable in omp` for sibling paths).
3. **Bypass + arg parsing**: `--agent <name>` and `WS_HUB_AGENT` env skip the menu
   (error on unknown name, listing registered agents). `--agent` is parsed and
   consumed only BEFORE a literal `--`; everything after `--` is forwarded verbatim to
   the chosen agent's command and is agent-specific (e.g. `-- --resume` is a claude
   arg). The skill's forwarding example is updated to say so.
4. tmux flow unchanged — the chosen agent's command runs inside the session; session
   name unchanged. `check_marketplace`'s hint becomes agent-neutral (name the
   marketplace add step for the chosen agent, not claude-only wording).
5. Skill `invoke-ai.sh contract` section: five steps become six (agent pick), registry
   extensibility documented (add a function + registry entry).

## Workstream D — docs surface + release

- `docs/how-to/use-with-omp.md` (new): install the marketplace in omp (its marketplace
  reads our registry natively), what works (commands, skills, agents, jira-cli flows),
  the fallback-note behavior, known gaps (SessionStart dashboard, enforcement hooks,
  sibling repos, AskUserQuestion UX), and the AGENTS.md convention.
- README: "Using with omp" section linking the how-to; AGENTS.md convention mentioned
  in the docs section; project-structure tree updated (AGENTS.md).
- `docs/reference/commands.md`: launcher picker note in the hub section intro;
  `/ws-docs init` wording (AGENTS.md); hub-init/describe entries that name CLAUDE.md.
- `README.md`: plugin table + hub blurb CLAUDE.md mentions, and the "add to your
  project's `.claude/CLAUDE.md`" advice becomes AGENTS.md-first.
- `dev-docs/architecture.md`: "templates/ contains CLAUDE.md templates" line.
- CHANGELOG (+ mirror): Added (dual-agent support, picker, how-to), Changed (AGENTS.md
  convention — **BREAKING** for hub templates: regeneration now targets AGENTS.md).
- Cut **[3.4.0]**, set all marketplace.json versions, tag `v3.4.0` (ADR 0002 procedure).

## Verification

- Grep: each of the 10 inventoried command files has the fallback note exactly once,
  and the note text contains NO exclamation-backtick sequence; grep confirms the
  AskUserQuestion neutral phrase (7 files), Task-tool neutral phrase
  (`ws-hub-describe`, `ws-hub-docs`, `ws-docs`), and the CLAUDE_PLUGIN_ROOT fallback
  (`ws-docs.md`, `ws-hub-init.md`).
- ws-project-hub: no template writes a full root CLAUDE.md; `AGENTS.md.tmpl` contains
  the marker pair and no `<hub>/CLAUDE.md` self-references; thin CLAUDE.md tmpl is
  2 lines; commands reference the AGENTS.md region; `ws-hub-add-repo` allowlist names
  AGENTS.md.
- docs-agent: `ws-docs.md` init/audit/repair all target AGENTS.md for the maintenance
  section (grep shows no "CLAUDE.md section" append wording).
- Repo root: `CLAUDE.md` is the thin import; `AGENTS.md` holds the content;
  `python3 -m unittest discover -s plugins/docs-agent/scripts` still green;
  marketplace.json valid, all versions 3.4.0; tag `v3.4.0` exists after release;
  `docs/how-to/use-with-omp.md` exists.
- invoke-ai.sh tmpl: `bash -n` parses; picker precedes summary; contains registry
  comment, `--agent` consumed before `--`, `WS_HUB_AGENT` handling; omp launch path
  contains no `--add-dir`.
- Repo-wide grep for "CLAUDE.md" returns only: thin-import references, historical
  changelog/specs/UPGRADE-NOTES history lines, and intentional explanations of the
  convention (each surviving hit listed in the implementation report).

## Out of scope

- omp TypeScript hook port of the SessionStart Jira dashboard (candidate for later).
- Executing Claude shell-hooks in omp; per-sub-repo omp `rules` generation with globs
  (revisit if hub AGENTS.md instruction proves insufficient).
- Any change to outline-sync.py or jira-cli flows (already agent-neutral).
