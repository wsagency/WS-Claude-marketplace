# @wsagency/omp-ws

WS Agency native extension for [omp](https://omp.sh) (oh-my-pi). Ports the WS
marketplace shell hooks to omp's ExtensionAPI and adds schema-validated tools
for the WS conventions. Design doc: `dev-docs/omp-native-improvements.md` in
the ws-claude-marketplace repo (Tier 1 + Tier 2).

The WS commands, skills, and agents stay in the Claude-format `ws` plugin
(omp reads it natively) — this package only carries what the compat layer
cannot express: blocking hooks, UI widgets, and registered tools.

## Install

Development flow (from a checkout of the marketplace repo):

```bash
cd extensions/omp-ws
bun install
bun run build
omp plugin link "$(pwd)"
```

Restart omp. The `omp` field in `package.json` points the plugin loader at
`dist/index.js`.

Once published to npm, this becomes:

```bash
omp plugin install @wsagency/omp-ws
```

To try a build without linking: `omp -e /path/to/extensions/omp-ws/dist/index.js`.

## Behaviors

### ws-guard (tool_call, fail-closed)

Blocks dangerous bash invocations before they run:

- `git push --force` / `-f` — `--force-with-lease` stays allowed
- `git reset --hard origin/*`
- `git clean -fd` / `-fdx` (dry runs pass)
- `rm -rf` targeting paths outside the working-directory subtree (absolute
  paths, `~`, `..`-escapes; globs are judged by their directory prefix)

The block reason always tells the agent what to do instead.

Off-switches: create `.omp/ws-guard.off` in the project, or set
`OMP_WS_GUARD=off` in the environment.

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
the editor plus a one-line notification instead of injected context. Requires
`./.claude/ws-project.yaml` and `~/.claude/ws/config.yaml`; honors the
`hooks.session_start_dashboard` (project) / `ui.session_start_dashboard`
(global) toggles. Fetches with the same jira-cli query `/ws-status` uses
(3s timeout). Silent no-op on any failure — missing binary, unconfigured
jira, timeout, headless mode.

### stop-nudge (session_stop, non-blocking)

Port of `enforce-stop.sh`, deliberately downgraded from a blocking stop hook
to a visible reminder: when uncommitted code changes exist without a
CHANGELOG.md update (and docs-config enforcement is on), it shows a warning
notification and a banner. It never returns `continue`/`decision: "block"`,
so the turn always settles. Debounced per drift set; the banner clears when
the drift resolves.

### wiki-freshness (session_stop, non-blocking)

Behavior-identical port of the per-project hook
`plugins/ws/templates/omp/hooks/openwiki-freshness.ts`: warns when
`<repo>/dev-docs/**` files are newer than `openwiki/.last-update.json`.
Skips entirely when `<cwd>/.omp/hooks/post/openwiki-freshness.ts` exists —
the per-project hook already covers that repo (no double banners).

## Tools

All three are OPTIONAL conveniences: the prose conventions in the ws plugin
skills remain authoritative, and free-form file edits stay equally valid.

| Tool | What it does |
|---|---|
| `ws_ticket` | create / move / close tickets in `dev-docs/tickets/open|done` per the local-tracker convention. Refuses with a pointer to `/ws-matt setup` when `dev-docs/tickets/` does not exist. |
| `ws_changelog` | append an entry (`feat|fix|perf|refactor|security|breaking`, text, optional ticket) under `[Unreleased]` in CHANGELOG.md, creating sections in canonical Keep-a-Changelog order; mirrors to `docs/changelog.md` when that file exists. |
| `ws_adr` | scaffold a lightweight two-tier ADR (`# NNNN — Title` + 1-3 sentences) in `dev-docs/decisions/`, auto-numbered; returns the path. |

## Development

```bash
bun install        # dev deps (typescript + @oh-my-pi/pi-coding-agent for types)
bun run typecheck  # tsc --noEmit against the real omp 17.x types
bun run build      # bundles src/index.ts -> dist/index.js
bun test           # unit + integration tests for all pure logic
```

Smoke test against the installed omp (headless, throwaway directory):

```bash
mkdir -p /tmp/omp-ws-smoke && cd /tmp/omp-ws-smoke && git init -q .
omp -e /path/to/extensions/omp-ws/dist/index.js --no-session \
  --auto-approve -p "Run exactly this bash command: git push --force"
```

Expected: the command is blocked and the model reports the ws-guard reason
(suggesting `--force-with-lease`). Extension load errors, if any, appear in
the newest `~/.omp/logs/omp.*.log`.

Note: do NOT combine the smoke test with `--no-extensions` — as of omp
17.1.5 that flag also drops explicit `-e` paths (despite its help text), so
the extension silently never loads.

## Versioning

Tagged `omp-ws-vX.Y.Z`; the version tracks the marketplace release the build
was verified against (see ADR 0002 — lockstep versioning — for the
marketplace side). Every omp minor gets a fresh smoke test: the ExtensionAPI
moves fast and this package must stay thin.
