# omp-Native Improvements — Capability Audit & Port Plan

Living document. Maps every WS surface to omp's native capabilities (verified
against omp 17.x source + docs, 2026-07), records what going native improves,
and tiers the work. Supersedes the extension bullet in
`omp-integration-backlog.md` (which now points here).

## Principle: native where it adds power, compat where it adds nothing

omp reads our Claude-format plugin natively (commands, skills, agents). A
TypeScript rewrite of those would create a SECOND source of truth for huge
prompt bodies — forbidden. Native work is reserved for capabilities the
Claude-compat layer CANNOT express: process hooks, blocking policy, UI
widgets, registered tools.

| Surface | Today in omp | Native gain |
|---|---|---|
| 7 commands, 28 skills, 14 agents | work via Claude-compat | none — stays compat, permanently |
| Shell hooks (SessionStart dashboard, PreToolUse changelog, Stop docs-drift) | DEAD (omp ignores Claude shell-hook JSON) | full parity via ExtensionAPI |
| Per-project `.omp/` preset (rules, freshness TS hook, config) | works, but must be re-installed per hub | one global extension covers every repo |
| Dangerous-git protection | TTSR rule (in-stream, advisory-strength) | `tool_call` block — fail-closed, cannot be talked past |
| Structured ticket/changelog writes | free-form file edits | `registerTool` with schema validation |

## Tier 1 — `@wsagency/omp-ws` extension (parity + guard)

One thin npm package (also installable via `omp plugin link` from a git
checkout). Distribution CANNOT go through the marketplace (Claude format
carries no TS); versions are tagged to match the marketplace repo release.

1. **ws-guard** — `tool_call` hook on bash: block `git push --force*` (allow
   `--force-with-lease` behind a confirm), `git reset --hard origin/*`,
   `git clean -fd`, `rm -rf` outside the repo. Fail-closed (verified omp
   semantics: hook error ⇒ blocked). Config: `.omp/config.yml` `wsGuard:`
   block, default on with a per-project off switch. Replaces the
   advisory-only half of the `ws-guard-git` TTSR rule (the rule stays as
   in-stream guidance; the hook is the enforcement).
2. **Changelog enforcement port** — `tool_call` on `git commit`: when
   `.claude/docs-config.yaml` sets `changelog_per_commit: true`, verify the
   staged set touches CHANGELOG.md for non-skip types (same logic as
   `hooks/enforce-changelog.sh`). Opt-in, exactly like Claude Code.
3. **Jira session dashboard** — `session_start` + `ui.setWidget`: assigned
   tickets via jira-cli (same content as `session-start-dashboard.sh`),
   rendered as a persistent widget instead of injected text. Degrades
   silently when jira-cli is absent.
4. **Docs-drift stop nudge** — `session_stop` + `additionalContext` (capped):
   port of `enforce-stop.sh` — uncommitted CHANGELOG drift, ADR candidates.
5. **OpenWiki freshness, global** — promote the per-hub
   `.omp/hooks/post/openwiki-freshness.ts` into the extension (detect
   `project.yaml` + `openwiki/` at cwd). The per-project copy remains as the
   plugin-less fallback; the extension skips when the local hook already ran
   (marker check) to avoid double banners.

Maintenance rule: the package stays THIN (no business logic beyond the five
behaviors) because omp's ExtensionAPI moves fast — every omp minor gets a
smoke test (`omp -e <built-hook> --no-extensions` headless run).

## Tier 2 — registered tools (conventions as tools)

`registerTool` lets the model call schema-validated operations instead of
free-form file edits. Candidates, in value order:

1. **`ws_ticket`** — create/move/close tickets in `dev-docs/tickets/`
   (schema: title, body, blocked-by, share link; moves open→done). Kills the
   "ticket file format drift" class of errors; ws-matt skills keep working
   without it (graceful absence).
2. **`ws_changelog`** — append a Keep-a-Changelog entry (schema: type,
   text, ticket). Wraps the `validate-changelog.sh` rules as validation.
3. **`ws_adr`** — lightweight ADR scaffold with auto-numbering.

Each tool duplicates a convention that already exists as prose — so each is
added ONLY when we see the prose version misfire in practice (evidence-driven,
not speculative).

## Tier 3 — config-level improvements (no code, document + preset)

Already possible today; recorded here so they land in omp-setup.md / the hub
preset as defaults evolve:

- **advisor** as a standing cross-family second reviewer — complements
  ws-code-review (the graph's reviewer stays authoritative; advisor is a
  cheap always-on tripwire).
- **checkpoint.enabled** — checkpoint before `/ws-matt implement` risky
  steps; rewind instead of revert-commit for failed experiments.
- **secrets.yml** — move `JIRA_API_TOKEN` / `OUTLINE_API_TOKEN` out of
  shell env into omp's secrets store (per-profile).
- **memory.backend local / autolearn** — boundary rule: omp memory =
  the agent's private working notes; authored truth stays in `dev-docs/`
  (autolearn lessons that deserve permanence get promoted to a skill or
  dev-docs note by the user, never auto-committed).
- **snapcompact + branchSummary** — long grill/spec sessions; requires a
  vision-capable session model (documented in omp-setup).
- **browser tool** — replaces the playwright plugin on omp; the
  `browser-verify` skill idea from the backlog builds on it.
- **profiles** (`OMP_PROFILE=ws`) — work-identity isolation on shared
  machines.
- **hub tool (agent messaging)** — advanced orchestration: entry nodes
  messaging parked workers (`agent://`, `history://`) instead of respawning;
  record as a ws-graph-engineering pattern once omp's API stabilizes.

## What is deliberately NOT ported

- Commands/skills/agents (single source of truth — compat layer).
- TTSR rules pack (already omp-native, per-project by design: rules are
  project conventions, not machine-global policy).
- `outline-sync.py`, jira-cli, tea flows (agent-neutral binaries — the whole
  point).

## Delivery

- Repo: `extensions/omp-ws/` inside this marketplace repo (TS, bun build,
  npm publish `@wsagency/omp-ws`); README with `omp plugin link` dev flow.
- Versioning: tag `omp-ws-vX.Y.Z`; X.Y.Z tracks the marketplace release the
  build was verified against.
- Install documented in `docs/how-to/omp-setup.md`; `/ws-hub doctor` gains a
  harness-assets bullet checking for the extension when the user runs omp.
