# Use the marketplace with omp

The WS marketplace works in [omp](https://omp.sh) (oh-my-pi) as well as Claude Code —
omp's plugin marketplace natively reads the Claude Code registry format this repo uses.

## Install

```bash
# omp reads .claude-plugin/marketplace.json as a Claude-compatible catalog
omp
/marketplace add git@github.com:wsagency/WS-Claude-marketplace.git
/plugin install docs-agent
/plugin install ws-commit-commands
/plugin install ws-project-hub
```

(Consult `omp.sh/docs/marketplace` for the current commands — omp also picks up plugins
already installed by Claude Code via `~/.claude/plugins/installed_plugins.json`.)

## What works

- **Commands** — all `/ws-*` and `/ws-hub-*` commands (also addressable as
  `<plugin>:<command>`). omp does not pre-execute the `` !`cmd` `` context lines
  Claude Code expands; each command carries a fallback note instructing the model to
  run those commands itself, so behavior converges.
- **Skills** — all plugin skills, plus skills vendored into projects under
  `.claude/skills/` (omp reads that directory too).
- **Agents** — plugin `agents/` definitions are read by omp's task system.
- **Jira flows** — `/ws-init`, `/ws-status`, `/ws-commit`, `/ws-commit-push-pr`,
  `/ws-ticket` use jira-cli (a plain binary), fully agent-neutral.
- **Outline sync** — `/ws-docs publish` / `pull-back` run `outline-sync.py`
  (Python 3 stdlib), agent-neutral.
- **Context files** — the AGENTS.md convention: canonical project context lives in
  `AGENTS.md` (omp reads it with a cwd→root walk-up; Claude Code loads it via the
  thin `CLAUDE.md` → `@AGENTS.md` import). Note: omp never reads a root-level
  `CLAUDE.md`, which is why the convention exists.
- **Project hubs** — `./invoke-ai.sh` offers an agent picker (claude / omp; extensible).
  The omp option launches at the hub root — nested sub-repos are all reachable under
  the working directory.

## Known gaps in omp

- **SessionStart Jira dashboard** (ws-commit-commands hook) does not run — omp hooks
  are TypeScript modules, not Claude's shell-hook JSON. Run `/ws-status` manually.
- **docs-agent enforcement hooks** (PreToolUse/Stop) likewise do not run; they are
  opt-in even in Claude Code.
- **Sibling-pathed hub repos** (`path: ../<name>`, legacy layout) are unreachable —
  omp has no `--add-dir`. Use the nested layout.
- **Per-sub-repo context auto-load**: omp loads context from the working directory's
  ancestry only; the hub AGENTS.md instructs agents to read `<sub-repo>/AGENTS.md`
  when working inside one.
- **AskUserQuestion** prompts degrade to plain chat questions.
