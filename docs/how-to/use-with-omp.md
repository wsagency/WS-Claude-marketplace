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
- **Jira flows** — `/ws-init`, `/ws-status`, `/ws-commit`, `/ws-commit pr`
  use jira-cli (a plain binary), fully agent-neutral.
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

The skill graph runs well in omp: plugin skills load through omp's Claude-compatible
providers, the worker agents (`reviewer`, `researcher`,
`tdd-runner` — canonical `ws:<agent>`) carry `output` JSON schemas and `autoloadSkills` for omp's task
system, and `/ws-matt setup` installs the edge-discipline rule (`alwaysApply`) into
`.omp/rules/` so the two-tier topology (entry nodes never chain into entry nodes) and
the `DONE|{path}` file-handoff protocol are enforced session-wide.

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
