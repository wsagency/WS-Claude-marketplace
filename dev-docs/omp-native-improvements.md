# omp-Native Improvements — Capability Audit & Port Plan

Living document. Maps every WS surface to omp's native capabilities (verified
against the omp 17.2.4 source, 2026-08), records what going native improves,
and tiers the work. Supersedes the extension bullet in
`omp-integration-backlog.md` (which now points here).

## Architecture (ADR 0004): full-native package, generated

Decision 2026-07-27: `@wsagency/omp-ws` carries the COMPLETE suite natively —
one install, zero marketplace coupling on omp. Single source of truth stays
in this repo (`dev-docs/` conventions + `plugins/ws/` markdown);
`extensions/omp-ws/scripts/generate.ts` produces the native package dirs at
build time (generated dirs are gitignored build artifacts, never hand-edited).

Verified mechanism (omp scans these dirs inside every enabled npm/link
plugin — `src/discovery/omp-plugins.ts`, provider priority 90):

| Package dir | Loads as | Source → transform |
|---|---|---|
| `commands/*.md` | native slash commands; `$ARGUMENTS`/`$1` substitution compatible with Claude bodies | near-copy from `plugins/ws/commands/` |
| `skills/<name>/SKILL.md` | native skills (`description` REQUIRED; `hide:` keeps prompt lean) | copy from `plugins/ws/skills/` |
| `agents/*.md` | task subagents (`@role` model aliases, `spawns`, `output` schemas, `autoloadSkills`, `prewalk`) | frontmatter transform from `plugins/ws/agents/` |
| `rules/*.md` | TTSR / always-apply / rulebook rules | copy from `plugins/ws/templates/omp/rules/` + `plugins/ws/rules/` |
| `hooks/`, `tools/`, `extensions:` manifest | TS behaviors | hand-written (src/) |
| `.mcp.json`, `prompts/*.md` | MCP servers, prompt templates | future use |

Known traps (from source): manifest `commands:`/`hooks:` keys are DEAD
in-tree (zero callers) — only directory conventions and the `extensions:` /
`tools:` manifest keys are consumed; `.md` files under `tools/` are
declarative metadata, not executable; agent `model:` must be omp specs or
`@role` aliases, never Claude model names. Both-installed duplication: the
marketplace `ws` plugin + this package would register everything twice — the
extension warns at session start; omp users run ONLY the npm package.

Churn risk: LOW — no experimental markers in `src/extensibility`; the
17.1.3→17.1.5 delta touched no extensibility surface, and the 17.2.4 re-audit
confirmed the package's discovery, plugin-path, and ExtensionAPI contracts.

## Principle: one source, two complete artifacts

The Claude plugin and the omp package are independent, complete consumer
distributions generated from the same source. The repository-maintenance skill
remains source-checkout-only. Hand-maintained copies are forbidden — the
generator is the only bridge.

| Surface | Today in omp | Native gain |
|---|---|---|
| 7 commands, 30 consumer skills, 14 agents | generated natively at build time from `plugins/ws/` (ADR 0004); the source-checkout-only maintenance skill is excluded | native discovery, no compat layer; hand-maintained copies stay forbidden — the generator is the only bridge |
| Shell hooks (SessionStart dashboard, PreToolUse changelog, Stop docs-drift) | DEAD (omp ignores Claude shell-hook JSON) | full parity via ExtensionAPI |
| Per-project `.omp/` preset (rules, freshness TS hook, config) | works, but must be re-installed per hub | one global extension covers every repo |
| Dangerous-git protection | TTSR rule (in-stream, advisory-strength) | canonical `tool_call` block with fail-open internal-error handling and optional explicit `OMP_WS_GUARD` machine strengthening |
| Structured ticket/changelog writes | free-form file edits | `registerTool` with schema validation |

## Tier 1 — `@wsagency/omp-ws` extension (parity + guard)

One thin npm package (also installable via `omp plugin link` from a git
checkout). Distribution CANNOT go through the marketplace (Claude format
carries no TS); versions are tagged to match the marketplace repo release.

1. **ws-guard** — `tool_call` hook on bash: block `git push --force*` (allow
   `--force-with-lease` behind a confirm), `git reset --hard origin/*`,
   `git clean -fd`, `rm -rf` outside the repo. The hook fails open on internal
   errors, but invalid or legacy-only repository policy blocks dangerous
   commands with a `/ws-setup` migration directive. Canonical
   `runtime.dangerous_git_guard` owns repository behavior; only explicit
   `OMP_WS_GUARD=on|required` may strengthen it machine-wide.
2. **Changelog enforcement port** — `tool_call` on `git commit`: canonical
   `changelog.update_mode: commit` verifies the staged set touches the
   configured changelog path for non-skip types. Missing policy is a no-op;
   legacy-only policy directs `/ws-setup`.
3. **Jira session dashboard** — `session_start` + `ui.setWidget`: canonical
   `ui.session_start_dashboard: jira_assignments` plus an explicit Jira binding
   renders assigned tickets from jira-cli. Missing machine integration degrades
   silently.
4. **Docs-drift stop nudge** — `session_stop` + `additionalContext` (capped):
   port of `enforce-stop.sh` — uncommitted CHANGELOG drift, ADR candidates.
5. **OpenWiki freshness, global** — promote the per-hub
   `.omp/hooks/post/openwiki-freshness.ts` into the extension (detect
   `project.yaml` + `openwiki/` at cwd). The per-project copy remains as the
   plugin-less fallback; the extension skips when the local hook already ran
   (marker check) to avoid double banners.

Maintenance rule: the package stays THIN (no business logic beyond the five
behaviors) because omp's ExtensionAPI moves fast — every omp minor gets a
smoke test (headless `omp -e <built-extension> --no-session -p ...` run — see
the recipe in `extensions/omp-ws/README.md`; never `--no-extensions`, which
silently drops explicit `-e` paths).

## Tier 2 — registered tools (conventions as tools)

`registerTool` lets the model call schema-validated operations instead of
free-form file edits. Candidates, in value order:

1. **`ws_ticket`** — create/move/close tickets in `dev-docs/tickets/`
   (schema: title, body, blocked-by, share link; moves open→done). Kills the
   "ticket file format drift" class of errors; ws-matt skills keep working
   without it (graceful absence).
2. **`ws_changelog`** — append a Keep-a-Changelog entry (schema: type,
   text, ticket). Mirrors the keep-a-changelog section rules.
3. **`ws_adr`** — lightweight ADR scaffold with auto-numbering.

Each tool duplicates a convention that already exists as prose — so each is
added ONLY when we see the prose version misfire in practice (evidence-driven,
not speculative).

## Adopted omp-specific improvements (current through the 17.2.4 source audit)

1. **Canonical repository policy contract** — the native package declares no
   settings schema and never reads package/project settings as policy.
   `.wsagency/config.yaml` is the sole repository input; the only machine-wide
   policy strengthening is explicit `OMP_WS_GUARD=on|required`. Generic
   profile/XDG plugin-path resolution remains solely for both-installed
   registry detection.
2. **TTSR rules shipped by the package** — the guardrails run BOTH as
   in-stream rules (interrupt while the model is typing) and as the
   fail-safe `tool_call` hook (blocks execution) — defense in depth Claude
   plugins cannot express.
3. **Compaction preservation** — `session.compacting` injects preserved
   context (active ticket, changelog state) so long sessions survive
   compaction without losing WS state.
4. **Both-installed detection** — session_start warns when the marketplace
   `ws` plugin is also enabled in omp (duplication).
5. **Purpose-specific worker roles** — generated agents use omp's fixed
   `@slow`, `@plan`, `@task`, `@smol`, and `@tiny` roles; project-specific
   `task.agentModelOverrides` remain optional and outrank frontmatter.
6. **Per-spawn effort** — introduced in 17.1.6 and schema-gated behind
   `task.enableEffort`; hub presets enable it and fan-out sites choose
   `hi|med|lo` per task item without multiplying model definitions.
7. Cataloged for later: `.mcp.json` bundling (jira/OpenWiki MCP zero-setup),
   `askDialog` rich forms, `registerShortcut`/`registerFlag`, memory API
   (`ctx.memory.save`), `resources_discover` conditional skill packs,
   `before_agent_start` per-turn prompt shaping, and `user_bash` interception.

### 17.2.4 re-audit outcome

- The extension SDK/typecheck pin now matches the installed runtime at 17.2.4.
- omp 17.2.4 preserves explicit `-e` extension paths under
  `--no-extensions`; the headless guard smoke now uses both flags to isolate
  the package from ambient plugins.
- `ExtensionContext.getAsyncJobSnapshot()` and `ctx.invokeTool()` were reviewed
  but not adopted: no WS extension behavior needs to inspect task jobs or wrap
  native tool execution, so adding either would create code without a contract.
- The fixed role keys, `task.enableEffort`, `task.maxConcurrency`,
  `task.maxRecursionDepth`, and parked-agent TTL are configuration concerns;
  they belong in generated prompts/presets rather than the TypeScript extension.

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

- Commands/skills/agents are never hand-ported — they are generated natively
  at build time from `plugins/ws/` (ADR 0004); hand-maintained copies remain
  forbidden.
- TTSR rules pack (already omp-native, per-project by design: rules are
  project conventions, not machine-global policy).
- `outline-sync.py`, jira-cli, tea flows (agent-neutral binaries — the whole
  point).

## Delivery

- Repo: `extensions/omp-ws/` inside this marketplace repo (TS, bun build,
  npm publish `@wsagency/omp-ws`); README with `omp plugin link` dev flow.
- Versioning: the package versions independently (0.x); each marketplace
  release notes the omp-ws version it shipped with.
- Install documented in `docs/how-to/omp-setup.md`; `/ws-hub doctor` gains a
  harness-assets bullet checking for the extension when the user runs omp.
