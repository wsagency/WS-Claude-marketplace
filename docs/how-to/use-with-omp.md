# Use WS with omp

> Machine setup (models, roles, safety, features): see
> [Set up omp for the WS stack](./omp-setup.md).

The supported WS distribution for [omp](https://omp.sh) (oh-my-pi) is the
native `@wsagency/omp-ws` package.

## Install

The native package carries the complete consumer suite (commands, 30 skills,
and agents generated from the same source — ADR 0004; the
repository-maintenance workflow stays source-checkout-only) plus the native
layer: guard, TTSR rules, dashboard, nudges, and `ws_*` tools.

```bash
omp plugin install @wsagency/omp-ws@0.7.0
```

Restart open omp sessions after installation. Do not combine the package with
`ws@ws-marketplace`; everything would load twice, and the package reports the
exact disable/uninstall remedy at session start.

## Update (verified on omp 17.x)

Upgrade the installed npm package, then restart open omp sessions:

```bash
omp plugin upgrade
```

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

## Known gaps

- **Sibling-pathed hub repos** (`path: ../<name>`, legacy layout) are unreachable —
  omp has no `--add-dir`. Use the nested layout.
- **Per-sub-repo context auto-load**: omp loads context from the working directory's
  ancestry only; the hub AGENTS.md instructs agents to read `<sub-repo>/AGENTS.md`
  when working inside one.
- **AskUserQuestion** prompts degrade to plain chat questions.
