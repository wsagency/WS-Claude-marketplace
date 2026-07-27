# 0004 — Full-native omp package, generated from a single source

- Status: accepted
- Date: 2026-07-27
- Deciders: Kristijan Lukačin

## Context and Problem Statement

ADR 0003 kept omp on the Claude-compat layer for commands/skills/agents,
reserving native work for hooks/tools. Kristijan decided the omp side should
be COMPLETE and fully decoupled: one native artifact per harness, with
authored truth in this repo (dev-docs conventions + plugins/ws content), so
an omp user installs one thing and never touches the marketplace compat path.

Research against the omp 17.1.5 source confirmed feasibility: an npm plugin
directory is scanned for `commands/*.md` (with `$ARGUMENTS`/`$1`
substitution compatible with our Claude command bodies), `skills/<name>/
SKILL.md`, `agents/*.md` (omp frontmatter: `@role` model aliases, `spawns`,
`output` schemas, `autoloadSkills`), `rules/*.md` (TTSR), `hooks/`,
`tools/`, `.mcp.json`, `prompts/` — plus the `extensions:` manifest we
already use. Manifest keys `commands:`/`hooks:` are dead in-tree (zero
callers) — directory conventions are the load-bearing mechanism.

## Considered Options

1. **Generated native package** — `@wsagency/omp-ws` carries the full suite;
   a build step generates commands/skills/agents/rules from `plugins/ws/`
   (agents get a frontmatter transform). Hand-written TS stays only for
   hooks/tools.
2. Hand-maintained native copy — two sources of truth; rejected outright
   (drift is a certainty).
3. Status quo (ADR 0003) — compat layer for content; rejected by the
   decision above.

## Decision Outcome

Option 1. **Single source of truth = this repo**: behavior conventions in
`dev-docs/`, command/skill/agent bodies in `plugins/ws/` (markdown).
`extensions/omp-ws/scripts/generate.ts` transforms that source into the
native package at build time; generated directories are build artifacts
(gitignored), never hand-edited. The Claude plugin and the omp package are
two independent, complete distributions of the same source.

### Consequences

- omp install becomes ONE package (`omp plugin link` / future `omp install
  @wsagency/omp-ws`) — no marketplace needed on omp.
- Installing BOTH the marketplace `ws` plugin and the npm package in omp
  duplicates every command/skill/agent — the extension warns at session
  start when it detects both; the omp migration is: uninstall
  `ws@ws-marketplace`, install the npm package.
- Claude Code users are untouched (marketplace plugin unchanged).
- The generator is new load-bearing code: any change to `plugins/ws/`
  surface requires a package rebuild; CI-less for now — the release runbook
  gains a "rebuild omp-ws" step.
- Supersedes ADR 0003's "stays compat, permanently" clause for omp;
  everything else in 0003 stands.
