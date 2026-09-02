# Use the marketplace with omp

> Machine setup (models, roles, safety, features): see
> [Set up omp for the WS stack](./omp-setup.md).

The WS marketplace works in [omp](https://omp.sh) (oh-my-pi) as well as Claude Code —
omp's plugin marketplace natively reads the Claude Code registry format this repo uses.

## Install

**Recommended: the native package** — carries the complete suite (commands,
skills, agents generated from the same source — ADR 0004) plus the native
layer (guard, TTSR rules, dashboard, nudges, ws_* tools):

```bash
git clone git@github.com:wsagency/WS-Claude-marketplace.git
cd WS-Claude-marketplace/extensions/omp-ws && bun install && bun run build
omp plugin link .
```

Don't combine it with the marketplace plugin in omp (everything loads twice;
the package warns with the remedy at session start).

**Compat alternative** (no bun/checkout — content only, no native layer):

```bash
# omp reads .claude-plugin/marketplace.json as a Claude-compatible catalog
omp
/marketplace add git@github.com:wsagency/WS-Claude-marketplace.git
/plugin install ws@ws-marketplace
```

⚠️ Always `ws@ws-marketplace`, never a bare `install ws` — the bare name
resolves to the npm websocket package `ws`, not this plugin.

(Consult `omp.sh/docs/marketplace` for the current commands — omp also picks up plugins
already installed by Claude Code via `~/.claude/plugins/installed_plugins.json`.)

## Update (verified on omp 17.x)

Two steps — the order matters:

```bash
omp plugin marketplace update ws-marketplace   # 1. refresh the catalog cache (git pull)
omp plugin upgrade                             # 2. upgrade all installed plugins
```

**Gotcha:** `omp plugin upgrade` alone compares against the CACHED catalog and
reports "all plugins are up to date" even when the marketplace has moved on —
always refresh the marketplace first. In-session equivalents: `/marketplace
update ws-marketplace`, then `/plugin upgrade`. Restart open omp sessions to
load the new command definitions. Versioning is lockstep, so one update brings
the ws plugin to the current repo version.

## What works

- **Commands** — all seven `/ws-*` commands (also addressable as
  `ws:<command>`). omp does not pre-execute the `` !`cmd` `` context lines
  Claude Code expands; each command carries a fallback note instructing the model to
  run those commands itself, so behavior converges.
- **Skills** — all plugin skills, plus skills vendored into projects under
  `.claude/skills/` (omp reads that directory too).
- **Agents** — plugin `agents/` definitions are read by omp's task system.
- **Setup and Jira flows** — `/ws-setup`, `/ws-status`, `/ws-commit`, and `/ws-commit pr` share canonical repository policy; jira-cli remains the agent-neutral integration owner.
- **Outline publish** — `/ws-docs publish` runs `outline-sync.py`
  (Python 3 stdlib, one-way), agent-neutral.
- **Context files** — the AGENTS.md convention: canonical project context lives in
  `AGENTS.md` (omp reads it with a cwd→root walk-up; Claude Code loads it via the
  thin `CLAUDE.md` → `@AGENTS.md` import). Note: omp never reads a root-level
  `CLAUDE.md`, which is why the convention exists.
- **Project hubs** — `./invoke-ai.sh` offers an agent picker (claude / omp; extensible).
  The omp option launches at the hub root — nested sub-repos are all reachable under
  the working directory.

## ws-matt in omp

The skill graph runs well in omp: plugin skills load through omp's Claude-compatible providers, and worker agents (`ws-reviewer`, `researcher`, and `tdd-runner`—native omp names are the unprefixed stems) carry output schemas and autoloaded skills for omp's task system.

The native package auto-discovers the `omp-edge-discipline.md` session policy. `/ws-setup` verifies that runtime capability and configures repository policy separately; `/ws-matt` has no setup route.

Choosing a backend: each work unit has one scheduling owner. With
`HERDR_ENV=1` and 2+ substantial lanes — independent, long-lived, own repo or
subsystem, not sharing a working tree — Herdr partitions the outer lanes
(parallel edits there need `herdr worktree`). A stamped lane may batch `task`
workers over disjoint slices it alone owns; no layer resubmits the same unit.

Picking a worker: prefer the specialized agent type. Its **role** ships as a
package default (`ws-reviewer` on `@slow`, `hub-architect` and
`architecture-documenter` on `@plan`, writing and research on `@task`,
mechanical scans on `@smol`, pure classification on `@tiny`) and is
overridable with `task.agentModelOverrides`. **Effort** (`lo|med|hi`) is a
per-item field on omp 17.1.6+ when `task.enableEffort: true`; otherwise omit it.
The full precedence and role/effort tables live in the
`ws-graph-engineering` skill.

## Artifact language

Every artifact the suite generates — specs, tickets, ADRs, changelog entries, commit
and PR bodies, review findings, research notes, generated docs and HTML — is written
in English regardless of the conversation language.

## Known gaps (compat install)

The native `@wsagency/omp-ws` package closes the dashboard, changelog-gate, and
stop-nudge gaps — only the compat install lacks them.

- **SessionStart Jira dashboard** (ws plugin hook) does not run — omp hooks
  are TypeScript modules, not Claude's shell-hook JSON. Run `/ws-status` manually.
- **Docs enforcement hooks** (PreToolUse/Stop) likewise do not run; they are
  opt-in even in Claude Code.
- **Sibling-pathed hub repos** (`path: ../<name>`, legacy layout) are unreachable —
  omp has no `--add-dir`. Use the nested layout.
- **Per-sub-repo context auto-load**: omp loads context from the working directory's
  ancestry only; the hub AGENTS.md instructs agents to read `<sub-repo>/AGENTS.md`
  when working inside one.
- **AskUserQuestion** prompts degrade to plain chat questions.
