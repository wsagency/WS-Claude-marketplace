# @wsagency/omp-ws

WS Agency **full-native suite** for [omp](https://omp.sh) (oh-my-pi). Since
0.2.0 (ADR 0004) this package IS the complete WS surface on omp — one
install, zero marketplace coupling:

- **Generated at build time** from `plugins/ws/` in the ws-claude-marketplace
  repo (single source of truth): `commands/` (8), `skills/` (31), `agents/`
  (14, with omp `@role` model aliases and Claude tool names remapped to
  omp-resolvable ids), `rules/` (4 TTSR/always-apply rules), `templates/`
  (including the hub-only `openwiki-freshness` rule under
  `templates/omp/hub-rules/`), and three command/skill runtime helpers under
  `scripts/`. Generated directories are gitignored, wiped and rewritten by
  `scripts/generate.ts`; helper copies sharing that directory are overwritten.
  Never hand-edit generated assets.
- **Hand-written TS** (`src/` → `dist/index.js`): the behaviors markdown
  cannot express — blocking hooks, UI widgets, compaction preservation, and
  registered tools.

omp discovers the generated directories natively from any enabled npm/link
plugin (its `omp-plugins` provider scans `commands/*.md`, `skills/<name>/
SKILL.md`, `rules/*.md`, and the task system scans `agents/*.md`). Claude
Code users keep using the marketplace `ws` plugin; the two artifacts are
independent, complete distributions generated from the same source.

The hub-only `openwiki-freshness` rule carries `alwaysApply: true`, so it is
deliberately NOT shipped under the auto-scanned `rules/` — it would otherwise
inject hub-only OpenWiki discipline into every omp session. It is packaged at
`templates/omp/hub-rules/` (outside omp's discovery scan) for `/ws-hub` to copy
into each hub's `.omp/rules/` on init. Likewise, the `researcher` agent keeps
web/read capability under omp: `generate.ts` remaps the Claude tool names
`WebSearch` → `web_search` and `WebFetch` → `read` (omp's tool resolver would
otherwise silently drop them).

## Install

Development flow (from a checkout of the marketplace repo):

```bash
cd extensions/omp-ws
bun install
bun run build          # generate the complete markdown/runtime surface + bundle dist/
omp plugin link "$(pwd)"
```

Restart omp. Once published to npm:

```bash
omp plugin install @wsagency/omp-ws
```

`npm pack` and `npm publish` run the `prepack` script (`bun run build`)
automatically, so a clean checkout produces a complete tarball with no manual
build step — every path in `package.json#files` is regenerated from
`plugins/ws/` before the tarball is created.

**Rebuild after plugin changes:** any change to `plugins/ws/` that the generator
consumes (commands, skills, agents, rules, templates, or runtime scripts)
requires `bun run build` (or `bun run generate`) here
— the linked package serves whatever was last generated. The release
checklist in `dev-docs/development.md` carries a "rebuild the native omp
package" step.

## Migration from the marketplace plugin

Running BOTH `ws@ws-marketplace` (Claude-format marketplace plugin) and this
package in omp registers every command/skill/agent **twice**. The extension
warns at session start when it detects this. Remedies (verified against the
omp 17.2.4 source):

- **On omp**, if you installed the marketplace plugin through omp: run
  `omp plugin disable ws@ws-marketplace` (or uninstall it).
- **On machines where Claude Code also has `ws` installed** (omp reads
  Claude's `~/.claude/plugins/installed_plugins.json` too): add a disabled
  entry for the id to omp's own user registry — `installed_plugins.json` under
  omp's plugins dir. That dir is profile/XDG/legacy-aware (a named
  `OMP_PROFILE` roots it at `~/.omp/profiles/<p>/plugins`; `XDG_DATA_HOME`
  relocates it to `$XDG_DATA_HOME/omp[/profiles/<p>]/plugins` once omp migrated
  the data root; otherwise `~/.omp/plugins`) — the session-start warning names
  the exact resolved path. omp's user registry is authoritative and drops the
  Claude-sourced root, while Claude Code keeps its copy untouched:

  ```json
  { "version": 2, "plugins": { "ws@ws-marketplace": [
    { "installPath": "", "version": "0", "installedAt": "", "lastUpdated": "", "enabled": false }
  ] } }
  ```

  (Merge into the existing file if it already has entries.)
- Note: `.omp/plugin-overrides.json` `disabled: []` does **not** work here —
  it only applies to npm/link plugins, never to marketplace plugins.

## Orchestration and artifact policy

The packaged `omp-edge-discipline` rule applies the WS session contract to
every WS command, skill, agent, and tool:

- Every written artifact is English; translated user-facing copies never
  replace the English original.
- Herdr owns only 2+ substantial, independent, long-lived repo/subsystem lanes
  when `HERDR_ENV=1`; smaller fan-out uses one batched `task` call. A Herdr lane
  may batch disjoint inner task slices, but no unit is submitted at both layers.
- Generated agents ship on purpose-specific fixed roles (`@slow`, `@plan`,
  `@task`, `@smol`, `@tiny`). The generated hub preset enables
  `task.enableEffort` (omp 17.1.6+) so callers can choose `hi`, `med`, or `lo`
  per task item.

## Settings

Declared in `package.json` under `omp.settings`; set globally via
`omp plugin settings @wsagency/omp-ws` (stored in `omp-plugins.lock.json` under
omp's plugins dir — profile/XDG/legacy-aware, same resolution as `omp plugin`
itself: `~/.omp/plugins` by default, `~/.omp/profiles/<p>/plugins` under a named
`OMP_PROFILE`, or `$XDG_DATA_HOME/omp[/profiles/<p>]/plugins` once omp migrated
the data root) or per-project in `.omp/plugin-overrides.json`:

```json
{ "settings": { "@wsagency/omp-ws": { "guard": false, "dashboard": false, "jiraProject": "WSC" } } }
```

| Setting | Type | Default | Effect |
|---|---|---|---|
| `jiraProject` | string (env `JIRA_PROJECT`) | `""` | Jira project the dashboard scopes to; overrides the `.claude/ws-project.yaml` binding |
| `guard` | boolean | `true` | fail-safe dangerous-git/rm guard |
| `dashboard` | boolean | `true` | Jira workload widget on session start |

omp 17.2.4 offers no ExtensionAPI settings accessor, so the extension reads
the same two stores omp's own `getPluginSettings` reads (project overrides
global, env fallback and defaults applied per the schema). Legacy
off-switches keep working: `.omp/ws-guard.off` file or `OMP_WS_GUARD=off`
for the guard; `hooks.session_start_dashboard` / `ui.session_start_dashboard`
YAML toggles for the dashboard.

No `features` split: omp's feature mechanism only gates `extensions`/`tools`
manifest entry points — it cannot gate the directory-convention surface
(commands/skills/agents/rules), which is the bulk of this package, so a
split would toggle almost nothing. The `settings` booleans cover the real
switches.

## Behaviors (dist/index.js)

### ws-guard (tool_call, fail-safe)

Blocks dangerous bash invocations before they run (fails OPEN on internal
error; a self-discipline guard, not a security boundary):

- `git push --force` / `-f` — `--force-with-lease` stays allowed
- `git reset --hard origin/*` / `upstream/*` / `@{u}` / `@{upstream}`
- `git clean -fd` / `-fdx` (dry runs pass)
- `rm -rf` targeting paths outside the working-directory subtree (absolute
  paths, `~`, `..`-escapes; globs are judged by their directory prefix)

The block reason always tells the agent what to do instead. Defense in
depth: the generated `rules/ws-guard-git.md` TTSR rule interrupts the model
in-stream; this hook is the enforcement layer.

### changelog-gate (tool_call on `git commit`)

Port of `enforce-changelog.sh`. Only enforces when the project's
`.claude/docs-config.yaml` sets `auto.changelog_per_commit: true`
(PR-time is the canonical WS timing; per-commit is opt-in). Passes for:
absent config, `auto.enforce_via_hooks: false`, docs-only staged sets,
staged CHANGELOG.md, skip commit types (`docs chore test style build ci`,
overridable via `changelog.skip_types`), commits whose type cannot be
extracted from `-m`, and `--allow-empty`.

### dashboard (session_start)

Port of `session-start-dashboard.sh`, rendered as a persistent widget below
the editor plus a one-line notification. Requires `./.claude/ws-project.yaml`
and `~/.claude/ws/config.yaml`; honors the `dashboard` plugin setting and the
YAML toggles. Fetches with the same jira-cli query `/ws-status` uses (3s
timeout). Silent no-op on any failure.

### both-installed warning (session_start)

Detects `ws@ws-marketplace` still enabled in omp (checks omp's user/project
`installed_plugins.json` registries and Claude Code's, with omp's registry
authoritative — same precedence as omp's loader) and shows a one-line
warning with the right remedy (see Migration above).

### compaction preservation (session.compacting)

Injects a short preserved-context block into the compaction summary so long
sessions keep WS state: open ticket file names under `dev-docs/tickets/open/`
(max 5) and whether CHANGELOG.md has uncommitted changes. Non-fatal on any
error.

### stop-nudge (session_stop, non-blocking)

Port of `enforce-stop.sh`, deliberately downgraded from a blocking stop hook
to a visible reminder: when uncommitted code changes exist without a
CHANGELOG.md update (and docs-config enforcement is on), it shows a warning
notification and a banner. It never returns `continue`/`decision: "block"`,
so the turn always settles.

### wiki-freshness (session_stop, non-blocking)

Behavior-identical port of the per-project hook
`plugins/ws/templates/omp/hooks/openwiki-freshness.ts`: warns when a
`type: working` repo's `dev-docs/**` files are newer than
`openwiki/.last-update.json` (repo types parsed from `project.yaml`, ADR
0006 — input/output repos and the hub's own `dev-docs/` never trigger it;
standalone repos without `project.yaml` walk their own `dev-docs/` plus each
immediate sub-directory's, per ADR 0007 — with no hub, the repo's own
`dev-docs/` IS the product knowledge root).
Skips when `<cwd>/.omp/hooks/post/openwiki-freshness.ts` exists (no double
banners).

## Tools

All three are OPTIONAL conveniences: the prose conventions in the generated
skills remain authoritative, and free-form file edits stay equally valid.

| Tool | What it does |
|---|---|
| `ws_ticket` | create / move / close tickets in `dev-docs/tickets/open|done` per the local-tracker convention. Refuses with a pointer to `/ws-matt setup` when `dev-docs/tickets/` does not exist. |
| `ws_changelog` | append an entry (`feat|fix|perf|refactor|security|breaking`, text, optional ticket) under `[Unreleased]` in CHANGELOG.md, creating sections in canonical Keep-a-Changelog order; mirrors to `docs/changelog.md` when that file exists. |
| `ws_adr` | scaffold a lightweight two-tier ADR (`# NNNN — Title` + 1-3 sentences) in `dev-docs/decisions/`, auto-numbered; returns the path. |

## Development

```bash
bun install        # dev deps (typescript + @oh-my-pi/pi-coding-agent for types)
bun run generate   # regenerate the complete native surface from plugins/ws/
bun run typecheck  # tsc --noEmit against the real omp 17.x types
bun run build      # generate + bundle src/index.ts -> dist/index.js
bun test           # unit + integration tests (incl. the generator transforms)
```

Smoke test against the installed omp (headless, throwaway directory):

```bash
mkdir -p /tmp/omp-ws-smoke && cd /tmp/omp-ws-smoke && git init -q .
omp --no-extensions -e /path/to/extensions/omp-ws/dist/index.js \
  --no-session --auto-approve -p "Run exactly this bash command: git push --force"
```

Expected: the command is blocked and the model reports the ws-guard reason
(suggesting `--force-with-lease`). Extension load errors, if any, appear in
the newest `~/.omp/logs/omp.*.log`. With the package linked, a plain
`omp --no-session -p "/ws-help"` from any repo resolves the generated
`/ws-help` command natively.

On omp 17.2.4+, `--no-extensions` disables discovery but preserves explicit
`-e` paths, so the smoke test isolates this extension from installed plugins.

## Versioning

The package versions independently (0.x); each marketplace release notes the
omp-ws version it shipped with (see ADR 0002 — lockstep versioning — for the
marketplace side). Bump rule: bump the package minor whenever a marketplace
release changes the native code (`src/`, `scripts/`) OR the generated surface
(anything under `plugins/ws/` that generate.ts consumes) — the version must
signal "the artifact you get changed", not just "the TS changed". Every omp
minor gets a fresh smoke test: the ExtensionAPI moves fast and this package
must stay thin.
