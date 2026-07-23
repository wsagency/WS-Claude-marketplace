# WS Claude Marketplace

A curated registry of Claude Code plugins, agents, and tools built by [ws.agency](https://ws.agency).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Available Plugins

| Plugin | Description | Commands |
|--------|-------------|----------|
| [docs-agent](./plugins/docs-agent) | Dual-track documentation suite with a single `/ws-docs` entry (Diátaxis, ADRs, changelogs, Outline sync) | `/ws-docs <verb>` (init, audit, catchup, repair, write, adr, architecture, contributing, changelog, release-notes, explain, publish, pull-back) |
| [ws-commit-commands](./plugins/ws-commit-commands) | Jira-aware git workflows via jira-cli: Conventional Commits + ticket suffix, worklogs, ticket writing, PR via tea | `/ws-init`, `/ws-status`, `/ws-commit`, `/ws-commit-push-pr`, `/ws-ticket`, `/ws-clean-gone` |
| [ws-project-hub](./plugins/ws-project-hub) | Multi-repo project hubs with auto-generated AGENTS.md and an agent-picker launcher (claude / omp) | `/ws-hub-init`, `/ws-hub-status`, `/ws-hub-repos <pull\|clone>`, `/ws-hub-add-repo [--scan]`, `/ws-hub-describe`, `/ws-hub-docs` |

## Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [Git](https://git-scm.com/)
- [tea CLI](https://gitea.com/gitea/tea) (required for ws-commit-commands) — `brew install tea`
- [jira-cli](https://github.com/ankitpokhrel/jira-cli) (required for ws-commit-commands) — `brew install ankitpokhrel/jira-cli/jira-cli`, then `export JIRA_API_TOKEN=<token>` and `jira init`
- [Python 3](https://python.org/) (required for `/ws-docs publish` / `pull-back` — Outline sync) with `OUTLINE_API_TOKEN` exported or stored in `~/.config/ws-docs/outline-token`

## Installation

```bash
# Add the marketplace (one-time setup)
claude plugin marketplace add git@github.com:wsagency/WS-Claude-marketplace.git

# Install individual plugins
claude plugin install docs-agent@ws-marketplace
claude plugin install ws-commit-commands@ws-marketplace
claude plugin install ws-project-hub@ws-marketplace
```

```bash
# List available plugins
claude plugin marketplace list

# Update marketplace
claude plugin marketplace update ws-marketplace

# Uninstall a plugin
claude plugin uninstall docs-agent@ws-marketplace
```

## Plugin Details

### docs-agent

Dual-track documentation suite with a single unified `/ws-docs` entry covering the full docs-as-code lifecycle: Diátaxis framework docs, Keep a Changelog, Architecture Decision Records (MADR v4.0.0), CONTRIBUTING.md, ARCHITECTURE.md, release notes, Conventional Commits, style guide enforcement, and TSDoc/GraphQL API reference. Ships opt-in PreToolUse/Stop hooks and dispatches work to background subagents.

**Commands** (all via the unified `/ws-docs` entry):
- `/ws-docs` — Discovery / status (run with no verb to see what exists, what's stale, what's missing)
- `/ws-docs init | audit | catchup | repair` — Scaffold the dual-track layout, audit docs state, backfill from git history, or fix drift
- `/ws-docs write <type> <topic>` — Write a Diátaxis doc: `tutorial`, `how-to`, `explanation`, or `reference`
- `/ws-docs adr <decision>` — Create an Architecture Decision Record (MADR v4.0.0)
- `/ws-docs architecture` — Generate ARCHITECTURE.md (matklad pattern)
- `/ws-docs contributing` — Generate CONTRIBUTING.md from project analysis
- `/ws-docs changelog [version]` — Generate or update CHANGELOG.md from git history
- `/ws-docs release-notes [version]` — Generate user-facing release notes (Linear style)
- `/ws-docs explain` — Regenerate `docs/explained.md`, a generated Outline-safe onboarding page (mermaid diagrams, roles, quickstart)
- `/ws-docs publish` — Lint the Outline-safe profile, then push `docs/` to an Outline collection (docs.wsagency.io) via `outline-sync.py`
- `/ws-docs pull-back` — Pull Outline edits into a review branch + PR (git stays authoritative)

In a multi-repo hub (ws-project-hub) with a `role: docs` sub-repo, `/ws-docs` routes product-level writes (user docs, product ADRs, architecture) to that docs repo automatically.

**Agents:** `diataxis-writer`, `api-documenter`, `changelog-analyzer`, `adr-writer`, `arch-watcher`, `contributing-generator`, `architecture-documenter`, `docs-doctor`, `public-api-watcher`, `release-notes-writer`

**Skills (knowledge bases):** `diataxis`, `keep-a-changelog`, `conventional-commits`, `style-guide`, `adr`, `dual-track-docs`

#### Auto-Applying Documentation Skills

To make your agent automatically enforce documentation standards on your projects, add the following to your project's `AGENTS.md` (canonical context file — `CLAUDE.md` should be a thin `@AGENTS.md` import):

```markdown
# Documentation Standards

Always apply these docs-agent standards when working on this project:

- **Commits**: Follow Conventional Commits format (`type(scope): description`)
- **Code changes**: Update CHANGELOG.md for user-facing changes
- **New features**: Check if an ADR is needed in docs/decisions/
- **TypeScript**: Use TSDoc comments on all public APIs
- **GraphQL**: Add descriptions to every type, field, and argument in the schema
- **Writing**: Follow Google style guide (active voice, present tense, second person)
- **Definition of done**: Documentation must ship with the feature

Available commands: /ws-docs (run with no verb for discovery, or with init | audit | catchup | repair | write | adr | architecture | contributing | changelog | release-notes)
```

For **hard enforcement**, add hooks to `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Before stopping, verify: 1) Commit messages follow Conventional Commits. 2) CHANGELOG.md updated if user-facing changes were made. 3) Documentation updated for new/changed features. If anything is missing, return {\"ok\": false, \"reason\": \"what's missing\"}.",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

### ws-commit-commands

Jira-aware git workflow commands, powered by [jira-cli](https://github.com/ankitpokhrel/jira-cli). Detects ticket key from branch name (`WSC-123-feature`), composes Conventional Commits with `(WSC-123)` suffix, applies worklogs and transitions via explicit jira-cli calls, and turns brief descriptions into full Jira tickets. PR creation via [tea CLI](https://gitea.com/gitea/tea) for Gitea.

**Requires:** [tea CLI](https://gitea.com/gitea/tea) (`brew install tea && tea login add`), [jira-cli](https://github.com/ankitpokhrel/jira-cli) (`brew install ankitpokhrel/jira-cli/jira-cli` + `JIRA_API_TOKEN` + `jira init`)

**Commands:**
- `/ws-init` — Verify jira-cli setup and bind the current project to a Jira project
- `/ws-status` — Show your Jira assignments, sprint status, and a suggestion for what to pick up next
- `/ws-commit` — Jira-aware commit (Conventional Commits + ticket suffix, optional worklog and transition via jira-cli)
- `/ws-commit-push-pr` — Commit + update CHANGELOG.md + push + open PR with Jira link; optionally transitions ticket to In Review
- `/ws-ticket <description>` — Turn a brief description into a structured Jira ticket, optionally creating it via jira-cli (replaces the retired ws-jira-enhancer plugin)
- `/ws-clean-gone` — Clean up git branches marked as `[gone]`

**Changelog integration:** `/ws-commit-push-pr` auto-updates `CHANGELOG.md` (Keep a Changelog format) at PR time, mapping commit types to sections (`feat`→Added, `fix`→Fixed, etc.). Auto-creates the file if missing. Skips non-functional types (`docs, chore, test, style, build, ci`) by default — configurable per-project. Powered by the docs-agent `keep-a-changelog` skill, which auto-loads on the word "CHANGELOG".

**Hooks:** `SessionStart` — when claude opens in a folder bound to a WS project, injects a brief Jira dashboard so the user sees their workload without running `/ws-status` manually. Toggle via `hooks.session_start_dashboard: false` in `.claude/ws-project.yaml`.

**Skills:** `ws-jira-conventions` — branch naming, commit format, Smart Commit syntax; `ticket-writing` — ticket structure, Given/When/Then acceptance criteria, jira-cli creation

### ws-project-hub

Manage multi-repo projects (mobile app, marketing site, design, docs, etc.) through a single hub repo. Generates a `<project>-main` folder with a registry of all sub-repos, an auto-built `AGENTS.md` project map (with a thin `CLAUDE.md` import), and an `invoke-ai.sh` launcher with an interactive agent picker — Claude Code (mounts sub-repos via `--add-dir`) or omp (runs at the hub root). Sub-repos live as gitignored subfolders, each with its own independent git.

**Commands:**
- `/ws-hub-init` — Initialize a new project hub (interactive)
- `/ws-hub-status` — Aggregated git status report (read-only), ends with the launch hint
- `/ws-hub-repos <pull|clone>` — `git pull` across all sub-repos, or clone every registered URL into a missing subfolder
- `/ws-hub-add-repo [--scan]` — Register a new sub-repo; `--scan` first discovers unregistered repos in/near the hub
- `/ws-hub-describe` — Refresh sub-repo descriptions from their READMEs
- `/ws-hub-docs` — Generate cross-repo architecture/contracts/deployment docs (hub-architect agent; targets the `role: docs` repo's `dev-docs/` when one is registered)

One sub-repo per hub can be marked `role: docs` — the product docs repo (`<project>-docs`), single source of truth for user docs (synced to Outline via `/ws-docs publish`) and cross-repo dev docs. `/ws-hub-init` offers to scaffold it.

Launching a hub is not a command: `cd <hub> && ./invoke-ai.sh` (hinted by `/ws-hub-status`).

**Agents:** `hub-architect` (generates cross-repo architecture docs)

**Skills:** `project-hub-conventions` (vendored into each hub at init time so hubs work even without the plugin installed)

**Highlights:**
- ASCII intro animation on launch (atlas figure with rotating Earth, lightning)
- tmux session detection with attach/new/cancel prompt
- Marketplace freshness check via `git ls-remote` on every launch
- Access control via filesystem presence — no config branching by role

## Project Structure

```
ws-claude-marketplace/
├── .claude-plugin/
│   └── marketplace.json     # Plugin registry
├── docs/                    # USER docs (plugin users)
│   ├── tutorials/
│   ├── how-to/
│   ├── reference/
│   ├── explanation/
│   ├── changelog.md         # mirror of root CHANGELOG.md
│   ├── contributing.md      # how to report bugs / propose plugins
│   └── superpowers/         # brainstorming specs and plans
├── dev-docs/                # INTERNAL docs (maintainers / plugin authors)
│   ├── runbooks/            # create-plugin, add-command, add-agent
│   ├── reference/           # plugin.json + marketplace.json schemas
│   ├── decisions/           # ADRs
│   ├── architecture.md
│   └── development.md       # local setup, code style, commits
├── CHANGELOG.md             # single source (Keep a Changelog)
├── CONTRIBUTING.md          # thin router → docs/ + dev-docs/
└── plugins/
    ├── docs-agent/
    ├── ws-commit-commands/
    └── ws-project-hub/
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the thin router. Quick links:

- **Report bugs / request features** → [`docs/contributing.md`](docs/contributing.md)
- **Add a plugin** → [`dev-docs/runbooks/create-plugin.md`](dev-docs/runbooks/create-plugin.md)
- **Add a command / agent** → [`dev-docs/runbooks/add-command.md`](dev-docs/runbooks/add-command.md), [`dev-docs/runbooks/add-agent.md`](dev-docs/runbooks/add-agent.md)
- **Local setup, commit format, code style** → [`dev-docs/development.md`](dev-docs/development.md)

See [`dev-docs/runbooks/create-plugin.md`](dev-docs/runbooks/create-plugin.md) for detailed instructions.

## Using with omp

The marketplace also works in [omp](https://omp.sh) — its plugin system reads this
repo's Claude-compatible registry natively (commands, skills, agents). Jira and Outline
flows are CLI/script-based and fully agent-neutral. Context files follow the
**AGENTS.md convention**: canonical content in `AGENTS.md`, `CLAUDE.md` is a thin
`@AGENTS.md` import. See [Use the marketplace with omp](docs/how-to/use-with-omp.md)
for setup and known gaps.

## Documentation

The marketplace follows the **dual-track docs** convention:

- **[User docs](docs/index.md)** — install and use plugins
  - [Getting Started Tutorial](docs/tutorials/getting-started.md)
  - [Command Reference](docs/reference/commands.md)
  - [Troubleshooting](docs/how-to/troubleshooting.md)
- **[Contributor docs](dev-docs/index.md)** — add or modify plugins
  - [Create a plugin](dev-docs/runbooks/create-plugin.md)
  - [Add a command](dev-docs/runbooks/add-command.md)
  - [Add an agent](dev-docs/runbooks/add-agent.md)
  - [Architecture overview](dev-docs/architecture.md)
  - [Decisions (ADRs)](dev-docs/decisions/)

## Attribution

Created by [ws.agency](https://ws.agency)

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 WEB Solutions Ltd. (ws.agency) & Kristijan Lukačin
