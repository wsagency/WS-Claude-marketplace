# @wsagency/omp-ws

WS Agency **full-native consumer suite** for [omp](https://omp.sh) (oh-my-pi).
Since 0.2.0 (ADR 0004) this package is the complete consumer-facing WS surface
on omp — one install, zero marketplace coupling:

- **Generated at build time** from `plugins/ws/` in the ws-claude-marketplace
  repo (single source of truth): `commands/` (7), `skills/` (30), `agents/`
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
independent consumer distributions generated from the same source. The native
package intentionally omits the source-checkout-only `ws-repo-maintenance`
maintainer workflow.

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

Install the published package directly:

```bash
omp plugin install @wsagency/omp-ws@0.7.0
```

`npm pack` and `npm publish` run the `prepack` script (`bun run build`)
automatically. Release builds require the exact marketplace commit identity and
emit a checksum manifest for the generated commands, skills, agents, and rules,
so the pre-publication verifier can prove the tarball matches the reviewed
source.

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

## Repository policy and machine capability

The package declares no settings schema and never reads plugin settings
or project override files as WS policy. Repository behavior is owned only by
the checked-in `.wsagency/config.yaml` created by `/ws-setup`:

- `runtime` selects session discipline and dangerous-git protection.
- `ui.session_start_dashboard` plus a canonical `jira` binding selects the Jira
  assignments widget.
- `changelog`, `tracker`, and the remaining sections drive their matching
  native helpers and generated skills.

Use `/ws-setup reconfigure` for intentional repository-policy changes. A
legacy-only repository is directed to `/ws-setup`; legacy files are detected
by path and never parsed as runtime policy.

`OMP_WS_GUARD=on` (or `OMP_WS_GUARD=required`) is the sole explicit
machine-wide strengthening signal. It may keep dangerous-git protection active
when a repository disables its own guard, but no package setting, project
override, or force-off environment value can weaken a committed requirement.

The profile/XDG/legacy-aware plugin-path resolver remains only for
both-installed detection, so the warning reads the same
`installed_plugins.json` omp uses under named profiles and migrated XDG roots.

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

The gate reads only canonical `.wsagency/config.yaml`. It enforces when
`changelog.update_mode` is `commit`, using the configured changelog path and
skip types. It passes for repositories with no canonical policy or no detected
legacy source, non-commit cadence, docs-only staged sets, a staged configured
changelog, configured skip commit types, commits whose type cannot be
extracted from `-m`, and `--allow-empty`.

### dashboard (session_start)

Native counterpart of the canonical SessionStart dashboard hook, rendered as
a persistent widget below the editor plus a one-line notification. It requires
`ui.session_start_dashboard: jira_assignments`, a canonical Jira binding, and a
working jira-cli integration. Missing machine integration is a silent no-op;
legacy-only repository policy directs `/ws-setup` without being parsed.

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

Native counterpart of the canonical stop hook, deliberately downgraded from a
blocking stop hook to a visible reminder. It uses canonical changelog policy
to detect uncommitted code changes without a configured changelog update,
shows a warning notification and banner, and never returns
`continue`/`decision: \"block\"`, so the turn always settles.

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
| `ws_ticket` | Create, move, or close tickets in the canonical repository root's `dev-docs/tickets/open|done`. Requires strict-valid `.wsagency/config.yaml` with `tracker.primary: local`; when `jira.sync: all_local_tickets` is configured, every write uses the durable synchronization boundary and fails closed if that boundary is unavailable. |
| `ws_changelog` | append an entry (`feat|fix|perf|refactor|security|breaking`, text, optional ticket) under `[Unreleased]` in CHANGELOG.md, creating sections in canonical Keep-a-Changelog order; mirrors to `docs/changelog.md` when that file exists. |
| `ws_adr` | Scaffold a lightweight two-tier ADR (`# NNNN — Title` + 1-3 sentences) in the strict-valid canonical policy's `docs.dev_track/decisions/` directory, auto-numbered; returns the path. |

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
