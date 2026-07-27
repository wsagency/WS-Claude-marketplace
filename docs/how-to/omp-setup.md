# Set up omp for the WS stack

One-time machine setup for the full omp experience with the WS marketplace.
Verified against omp docs (2026-07-26). Everything here is copy-paste.

## Install & auth

```bash
curl -fsSL https://omp.sh/install | sh
echo 'eval "$(omp completions zsh)"' >> ~/.zshrc
omp            # then /login (Anthropic OAuth; repeat for other providers)
```

Optional work-identity isolation: `export OMP_PROFILE=ws` (separate config,
sessions, auth under `~/.omp/profiles/ws/`).

## Model roles (`~/.omp/agent/config.yml`)

omp routes classes of work through named roles — set them once:

```yaml
modelRoles:
  default: anthropic/claude-sonnet-4-5   # adjust ids to what /models shows
  slow: anthropic/claude-opus-4-5:high   # hard problems
  plan: anthropic/claude-opus-4-5        # plan mode
  smol: anthropic/claude-haiku-4-5       # cheap/fast tier (also /vibe "fast")
  tiny: anthropic/claude-haiku-4-5       # titles, classification
  task: anthropic/claude-sonnet-4-5      # subagents
  advisor: openai/gpt-5.5:medium         # cross-family reviewer (see below)
cycleOrder: [smol, default, slow]        # Ctrl+P cycles these
```

## Safety posture (defaults are aggressive — `yolo`)

```bash
omp config set tools.approvalMode write     # global; per-project .omp/config.yml can relax
omp config set secrets.enabled true         # + entries in ~/.omp/agent/secrets.yml
```

```yaml
# in config.yml — bash guardrails
bash:
  patterns:
    - { match: "git push --force*", approval: deny }
    - { match: "rm -rf *", approval: prompt }
```

Personal standing rules: create `~/.omp/agent/RULES.md` (e.g. "Never commit or
push unless asked"). Project rules live in `.omp/rules/` — the ws plugin installs
`omp-edge-discipline` and `openwiki-freshness` there via `/ws-matt setup` and
`/ws-hub init`.

## Features worth switching on (one-liners)

```bash
omp config set advisor.enabled true        # second model reviews every turn
omp config set memory.backend local        # per-project durable memory
omp config set autolearn.enabled true      # agent stores lessons as skills
omp config set checkpoint.enabled true     # checkpoint/rewind for deep dives
omp config set branchSummary.enabled true  # breadcrumbs on /tree jumps
omp config set task.isolation.mode auto    # isolated subagent workspaces
omp config set collab.displayName "Kristijan"
```

## WS stack wiring

```bash
omp plugin marketplace add git@github.com:wsagency/WS-Claude-marketplace.git
omp plugin install ws@ws-marketplace
# or: plugins installed via Claude Code are auto-visible in omp
```

MCP: existing `.claude`/`.mcp.json` configs are discovered automatically.
Context files: `~/.claude/CLAUDE.md` is read — do NOT also create
`~/.omp/agent/AGENTS.md` (it would shadow it).

### Native package — `@wsagency/omp-ws` (the complete suite, recommended)

Since 0.2.0 (ADR 0004) the native package carries the **entire ws plugin surface** —
all 7 commands, 30 skills, 14 agents (generated from the same source as the
Claude plugin), TTSR rules, PLUS what only a native package can do:
fail-safe git guard, opt-in changelog gate, Jira dashboard widget,
docs-drift nudge, OpenWiki freshness, compaction preservation, and the
`ws_ticket`/`ws_changelog`/`ws_adr` tools. On omp you install ONLY this —
no marketplace needed:

```bash
git clone git@github.com:wsagency/WS-Claude-marketplace.git
cd WS-Claude-marketplace/extensions/omp-ws && bun install && bun run build
omp plugin link .
```

Do NOT also run the marketplace `ws` plugin in omp — everything would load
twice; the package warns at session start with the exact remedy
(`omp plugin disable ws@ws-marketplace`). The marketplace plugin remains the
Claude Code distribution. Details, settings, and off-switches:
`extensions/omp-ws/README.md`. Capability audit + architecture:
`dev-docs/omp-native-improvements.md`, ADR 0004.

## Daily-driver vocabulary (no config)

- **`orchestrate`** in a prompt → multi-agent orchestration contract
- **`workflowz`** → deterministic multi-subagent workflow over `task`
- **`ultrathink`** → max reasoning for the turn
- `/tree` (or double-Esc) — jump anywhere in the session tree; `/fork`, `/fresh`
- `/vibe` — director mode with persistent fast/good workers
- `/share` — E2E-encrypted session link (attach to the Jira ticket for reviews)
- `browser` tool — headless Chromium / attach to any Electron app / cmux panes;
  nothing to install (replaces the playwright plugin on omp)

## Known gaps

- omp extensions (TS policy hooks) can't ship via the marketplace — npm/link
  only; `@wsagency/omp-ws` (above) is the WS extension, installed separately.
- `goal.*`/`loop.*` settings exist but are undocumented — inspect with
  `omp config list` before relying on them.
