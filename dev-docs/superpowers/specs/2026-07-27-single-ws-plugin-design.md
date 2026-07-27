# Single `ws` Plugin — v4.0.0 Restructure Design

**Goal:** merge the four plugins (docs-agent, ws-commit-commands, ws-matt,
ws-project-hub) into ONE plugin `ws`, consolidate the command surface to 7
commands, drop the double prefix from agent names, and sweep every reference.
One breaking release: v4.0.0.

**Why:** lockstep versioning (ADR 0002) already treats the suite as one
product; the team installs all four; cross-plugin references (ws-implement →
/ws-commit-push-pr, ws-docs → hub-architect) are really internal edges. One
plugin = one install, one update, one version field, cleaner canonical names
(`ws:reviewer` instead of `ws-matt:ws-matt-reviewer`).

**Trade-off accepted:** no selective install; future extraction of a part
would need a split (git history preserved via `git mv`).

## Target layout

```
plugins/ws/
  .claude-plugin/plugin.json    name "ws"; description covers the whole suite
  commands/                     7 files (see command map)
  agents/                       renamed, no double prefix (see agent map)
  skills/                       all 28, names unchanged
  hooks/hooks.json              merged (docs-agent hooks + hub Stop hook)
  scripts/                      outline-sync.py + test_outline_sync.py
  templates/                    hub templates incl. omp preset (from ws-project-hub)
  rules/                        omp-edge-discipline.md (from ws-matt)
  UPSTREAM.md                   mattpocock vendoring record (from ws-matt)
```

Moves use `git mv` to preserve history. Old plugin dirs are deleted in the
same commit.

## Command map (14 → 7)

| Old | New |
|---|---|
| /ws-docs | /ws-docs (unchanged) |
| /ws-matt | /ws-matt (unchanged) |
| /ws-help | /ws-help (unchanged) |
| /ws-status | /ws-status (unchanged) |
| /ws-init | /ws-init (unchanged) |
| /ws-commit | /ws-commit (no arg = commit only, as today) |
| /ws-commit-push-pr | /ws-commit pr |
| /ws-clean-gone | /ws-commit clean |
| /ws-hub-init | /ws-hub init (doctor auto-offer stays) + explicit /ws-hub doctor |
| /ws-hub-status | /ws-hub status |
| /ws-hub-repos <pull\|clone> | /ws-hub repos <pull\|clone> |
| /ws-hub-add-repo [--scan] | /ws-hub add [--scan] |
| /ws-hub-describe | /ws-hub describe |
| /ws-hub-docs | /ws-hub docs |
| /ws-hub-explained | /ws-hub explained |

Router files merge verb bodies INLINE (precedent: /ws-docs at ~340 lines).
`ws-hub.md` = routing header + verb sections (init keeps its full flow +
Doctor mode section; doctor verb jumps straight to Doctor mode in fix
posture, still asking fix vs report). `ws-commit.md` = routing + three verb
sections. `allowed-tools` per router = union of the merged commands' tools.
No verb → each router prints its verb list (ws-hub with a one-line hint per
verb; ws-commit defaults to the commit flow — its historic no-arg behavior).

## Agent map

| Old canonical | New file | New canonical |
|---|---|---|
| ws-matt:ws-matt-reviewer | agents/reviewer.md | ws:reviewer |
| ws-matt:ws-matt-researcher | agents/researcher.md | ws:researcher |
| ws-matt:ws-matt-tdd-runner | agents/tdd-runner.md | ws:tdd-runner |
| ws-project-hub:hub-architect | agents/hub-architect.md | ws:hub-architect |
| docs-agent:<name> (all) | agents/<name>.md unchanged | ws:<name> |

Agent frontmatter `name:` fields updated to match the new file names.

## Skills

All 28 move unchanged (names stay: ws-tdd, dual-track-docs,
project-hub-conventions, …). No name collisions (verified). Skill bodies that
reference agent names, command names, or plugin paths are part of the sweep.

## Hooks

Merge into one `hooks/hooks.json`: docs-agent's PreToolUse/Stop enforcement
hooks (docs-config driven) + ws-project-hub's Stop hook
(openwiki-freshness.sh). Shell scripts move alongside. `${CLAUDE_PLUGIN_ROOT}`
now resolves to `plugins/ws` — script-relative paths inside hook commands must
be re-checked.

## Registry & metadata

- `.claude-plugin/marketplace.json`: replace 4 entries with 1 — name `ws`,
  source `./plugins/ws`, version `4.0.0`, category/tags merged, description =
  suite description. Keep `ws-marketplace` marketplace name (installed
  clients reference it).
- plugin.json: name `ws`, same description, author "WS Agency AI suite
  <ai@ws.agency>".
- ADR 0003 (full MADR — breaking, had options): single plugin; notes that
  ADR 0002 lockstep remains for any future additional plugins and becomes
  trivially satisfied.

## Reference sweep (exhaustive list of stale tokens)

Old command names: `ws-commit-push-pr`, `ws-clean-gone`, `ws-hub-init`,
`ws-hub-status`, `ws-hub-repos`, `ws-hub-add-repo`, `ws-hub-describe`,
`ws-hub-docs`, `ws-hub-explained`.
Old agent names: `ws-matt-reviewer`, `ws-matt-researcher`,
`ws-matt-tdd-runner` (incl. `task.agentModelOverrides` example in
`templates/omp/config.yml.tmpl`).
Old plugin names as identifiers: `docs-agent`, `ws-commit-commands`,
`ws-matt` (plugin, not skill names), `ws-project-hub` — in install commands,
`@ws-marketplace` suffixed references, and prose.

Files to sweep: all `plugins/ws/**` (commands, skills, agents, templates —
esp. AGENTS.md.tmpl, config.yml.tmpl, omp rules), root `AGENTS.md`
("docs-agent plugin v3.0.0+", `/ws-commit-push-pr`), `README.md`,
`docs/reference/commands.md` (regrouped: one plugin section), `docs/index`,
`docs/how-to/use-with-omp.md` + `omp-setup.md` (install/update lines → single
plugin), getting-started. CHANGELOG HISTORY entries stay untouched (they
describe the past).

Out of scope for the sweep: `dev-docs/superpowers/` specs/plans and
`dev-docs/research/` (historical documents; add one line at top of the two
consolidation-era specs pointing at this spec). `dev-docs/omp-integration-backlog.md`
gets its references updated (living doc).

Live wsault hub: check `.omp/config.yml` for the `ws-matt-reviewer` override
example and hub AGENTS.md for old command names; fix there too (separate
commit in that repo).

## Migration (goes in CHANGELOG + README)

Claude Code:
```
claude plugin uninstall docs-agent@ws-marketplace ws-commit-commands@ws-marketplace ws-matt@ws-marketplace ws-project-hub@ws-marketplace
claude plugin marketplace update ws-marketplace
claude plugin install ws@ws-marketplace
```
omp:
```
omp plugin marketplace update ws-marketplace
omp plugin uninstall docs-agent ws-commit-commands ws-matt ws-project-hub
omp plugin install ws
```
Muscle-memory map: `/ws-commit-push-pr` → `/ws-commit pr`; `/ws-hub-<x>` →
`/ws-hub <x>`; `/ws-clean-gone` → `/ws-commit clean`. Everything else keeps
its name.

## Release

CHANGELOG `[4.0.0]`: **BREAKING:** entries (single plugin, command renames,
agent renames) + migration block. Mirror to docs/changelog.md. Set version in
marketplace.json (single field now). Tag v4.0.0, push. Then update the user's
local omp + Claude installs to the new plugin.

## Amendments after adversarial review

1. **Hooks**: merged `hooks/hooks.json` = docs-agent PreToolUse + Stop,
   ws-project-hub Stop (openwiki-freshness.sh), AND ws-commit-commands
   **SessionStart** (session-start-dashboard.sh — Jira dashboard). All shell
   scripts move to `plugins/ws/hooks/`; hooks/ and scripts/ are IN the sweep
   (session-start-dashboard.sh prints `/ws-commit-push-pr`).
2. **rules/** = `omp-edge-discipline.md` (ws-matt) + `openwiki-freshness.md`
   (ws-project-hub — required by /ws-hub init step 5a and doctor check 5).
3. **scripts/** = all four: outline-sync.py, test_outline_sync.py,
   parse-git-log.sh, validate-changelog.sh. Delete untracked
   `__pycache__/` before the move.
4. **LICENSE** (ws-matt MIT vendoring) moves next to UPSTREAM.md;
   `ws-matt/docs/graph.md` moves to `plugins/ws/docs/graph.md`.
   `docs-agent/UPGRADE-NOTES.md` is DELETED (v2→v3 history lives in git +
   CHANGELOG).
5. **Sweep list additions**: dev-docs/architecture.md, dev-docs/development.md,
   dev-docs/index.md, dev-docs/reference/marketplace-json.md,
   dev-docs/reference/plugin-json.md, dev-docs/runbooks/add-agent.md (and the
   other runbooks if hit), docs/explanation/plugin-architecture.md,
   docs/how-to/troubleshooting.md, docs/contributing.md,
   docs/reference/commands.md:336 canonical `subagent_type:
   "docs-agent:diataxis-writer"` → `"ws:diataxis-writer"`.
   **ADRs 0001/0002 are historical — untouched**; ADR 0003 records the merge.
   `.claude/settings.json` → `"ws@ws-marketplace": true`.
6. **allowed-tools union is unrestricted Bash** for both routers — the
   read-only guards of ws-hub-status and ws-clean-gone are consciously given
   up (verb-level restriction isn't expressible); delete the stale
   piped-commands remark from the clean verb body. Router `argument-hint`:
   `"<verb> [args...]"` listing the verbs.
7. **One deduped context block per router.** /ws-hub: `pwd` + `cat
   ./project.yaml` only (the sibling-repo scan moves into the init verb body
   as an instruction). /ws-commit: status + branch + diff + log set, deduped;
   `git branch -vv` / `git worktree list` move into the clean verb body.
8. **Reword standalone assumptions** in merged bodies: usage strings
   (`/ws-hub repos <pull|clone>`), `/ws-hub-init` → `/ws-hub init` (or
   `/ws-hub doctor` in the status hint), cross-references between the commit
   trio become section references within the router.
9. Command count: **15 → 7**. Agent `name:` frontmatter: only the three
   ws-matt agents change; hub-architect keeps `name: hub-architect`;
   docs-agent agents have no name field (leave as-is). Skill names unchanged.
10. Marketplace single entry carries: name, description, version, source,
    category, author, tags = union of the four tag sets.

## Verification

- `claude plugin validate` equivalent: JSON parse of marketplace.json +
  plugin.json; every command/agent/skill file has frontmatter.
- Grep gate: zero hits for the stale tokens in swept scopes (excluding
  CHANGELOG history + dev-docs archives).
- outline-sync tests still green from new path.
- omp: `omp plugin marketplace update` + install `ws` locally; `omp plugin
  list` shows `ws@ws-marketplace (4.0.0)`.
