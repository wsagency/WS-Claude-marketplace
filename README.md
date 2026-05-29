# WS Claude Marketplace

A curated registry of Claude Code plugins, agents, and tools built by [ws.agency](https://ws.agency).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Available Plugins

| Plugin | Description | Commands |
|--------|-------------|----------|
| [docs-agent](./plugins/docs-agent) | Comprehensive documentation suite (Diátaxis, ADRs, changelogs, style guide) | `/docs`, `/adr`, `/contributing`, `/architecture`, `/release-notes`, `/changelog` |
| [ws-commit-commands](./plugins/ws-commit-commands) | Jira-aware git workflows: Conventional Commits + ticket suffix, Smart Commit worklogs, PR via tea | `/ws-init`, `/ws-status`, `/ws-commit`, `/ws-commit-push-pr`, `/ws-clean-gone` |
| [ws-jira-enhancer](./plugins/ws-jira-enhancer) | Transform task descriptions into Jira tickets | `/ws-jira-enhancer` |
| [ws-claude-sync](./plugins/ws-claude-sync) | Sync Claude contexts across machines via GitHub | `/ws-sync-setup`, `/ws-sync`, `/ws-sync-pull`, `/ws-sync-push`, `/ws-sync-full`, `/ws-sync-status` |
| [ws-clamp](./plugins/ws-clamp) | Move, archive, and manage Claude projects | `/clamp-move`, `/clamp-inspect`, `/clamp-maintain`, `/clamp-archive` |
| [ws-project-hub](./plugins/ws-project-hub) | Multi-repo project hubs with auto-generated CLAUDE.md and Claude launcher | `/hub-init`, `/hub-launch`, `/hub-sync`, `/hub-status`, `/hub-add-repo`, `/hub-scan`, `/hub-describe`, `/hub-clone-all` |

## Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [Git](https://git-scm.com/)
- [tea CLI](https://gitea.com/gitea/tea) (required for ws-commit-commands) — `brew install tea`
- [Python 3](https://python.org/) (required for ws-claude-sync)

## Installation

```bash
# Add the marketplace (one-time setup)
claude plugin marketplace add git@github.com:wsagency/WS-Claude-marketplace.git

# Install individual plugins
claude plugin install docs-agent@ws-marketplace
claude plugin install ws-commit-commands@ws-marketplace
claude plugin install ws-jira-enhancer@ws-marketplace
claude plugin install ws-claude-sync@ws-marketplace
claude plugin install ws-clamp@ws-marketplace
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

Comprehensive documentation generation suite covering the full docs-as-code lifecycle: Diátaxis framework docs, Keep a Changelog, Architecture Decision Records (MADR v4.0.0), CONTRIBUTING.md, ARCHITECTURE.md, release notes, Conventional Commits, style guide enforcement, and TSDoc/GraphQL API reference.

**Commands:**
- `/docs` — Generate a complete documentation suite following Diátaxis
- `/docs-tutorial` — Create a learning-oriented tutorial
- `/docs-howto` — Create a task-oriented how-to guide
- `/docs-explanation` — Write an understanding-oriented explanation
- `/docs-reference` — Generate API or technical reference documentation
- `/adr` — Create an Architecture Decision Record (MADR v4.0.0)
- `/contributing` — Generate CONTRIBUTING.md from project analysis
- `/architecture` — Generate ARCHITECTURE.md (matklad pattern)
- `/release-notes` — Generate user-facing release notes (Linear style)
- `/changelog` — Generate or update CHANGELOG.md from git history
- `/changelog-entry` — Add a single entry to CHANGELOG.md

**Agents:** `docs-architect`, `tutorial-writer`, `api-documenter`, `changelog-analyzer`, `adr-writer`, `contributing-generator`, `architecture-documenter`, `release-notes-writer`

**Skills (knowledge bases):** `diataxis`, `keep-a-changelog`, `conventional-commits`, `style-guide`, `adr`

#### Auto-Applying Documentation Skills

To make Claude Code automatically enforce documentation standards on your projects, add the following to your project's `.claude/CLAUDE.md`:

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

Available commands: /docs, /adr, /contributing, /architecture, /release-notes, /changelog
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

Jira-aware git workflow commands. Detects ticket key from branch name (`WSC-123-feature`), composes Conventional Commits with `(WSC-123)` suffix, optionally adds Smart Commit `#time` worklog (using elapsed time on the branch as the default), and optionally transitions the Jira issue. PR creation via [tea CLI](https://gitea.com/gitea/tea) for Gitea.

**Requires:** [tea CLI](https://gitea.com/gitea/tea) (`brew install tea && tea login add`), Atlassian MCP server (auto-installed via the `atlassian` plugin)

**Commands:**
- `/ws-init` — Connect Jira via OAuth and bind the current project to a Jira project
- `/ws-status` — Show your Jira assignments, sprint status, and a suggestion for what to pick up next
- `/ws-commit` — Jira-aware commit (Conventional Commits + ticket suffix, optional Smart Commit worklog and transition)
- `/ws-commit-push-pr` — Commit + update CHANGELOG.md + push + open PR with Jira link; optionally transitions ticket to In Review
- `/ws-clean-gone` — Clean up git branches marked as `[gone]`

**Changelog integration:** `/ws-commit-push-pr` auto-updates `CHANGELOG.md` (Keep a Changelog format) at PR time, mapping commit types to sections (`feat`→Added, `fix`→Fixed, etc.). Auto-creates the file if missing. Skips non-functional types (`docs, chore, test, style, build, ci`) by default — configurable per-project. Powered by the docs-agent `keep-a-changelog` skill, which auto-loads on the word "CHANGELOG".

**Hooks:** `SessionStart` — when claude opens in a folder bound to a WS project, injects a brief Jira dashboard so the user sees their workload without running `/ws-status` manually. Toggle via `hooks.session_start_dashboard: false` in `.claude/ws-project.yaml`.

**Skills:** `ws-jira-conventions` — branch naming, commit format, Smart Commit syntax

### ws-jira-enhancer

Transform brief task descriptions into well-structured Jira tickets with user stories and acceptance criteria.

**Commands:**
- `/ws-jira-enhancer <task>` — Generate a complete Jira ticket from a brief description

### ws-claude-sync

Sync Claude Code contexts, settings, and sessions across machines via a private GitHub repository.

**Requires:** [Python 3](https://python.org/), a private GitHub repository for sync storage

**Commands:**
- `/ws-sync-setup` — Configure sync with a GitHub repository
- `/ws-sync-pull` — Pull essential context from remote
- `/ws-sync-push` — Push essential context to remote
- `/ws-sync` — Bidirectional essential sync (pull + push)
- `/ws-sync-pull-full` — Pull ALL Claude data from remote
- `/ws-sync-push-full` — Push ALL Claude data to remote
- `/ws-sync-full` — Bidirectional full sync
- `/ws-sync-status` — Show sync configuration and status

**Agents:** `sync-troubleshooter`

### ws-clamp

Move, archive, fix, and manage Claude Code projects while preserving session history. Based on [clamp](https://github.com/wsagency/claude-move-project) v1.4.1.

**Commands:**
- `/clamp-move` — Move, relocate, or remove a project
- `/clamp-inspect` — List projects or show project details
- `/clamp-maintain` — Verify, fix, or prune project references
- `/clamp-archive` — Pack or unpack portable `.claudepack` archives

**Agents:** `project-manager`

### ws-project-hub

Manage multi-repo projects (mobile app, marketing site, design, docs, etc.) through a single hub repo. Generates a `<project>-main` folder with a registry of all sub-repos, an auto-built `CLAUDE.md` project map, and an `invoke-ai.sh` script that launches Claude with every accessible sub-repo mounted via `--add-dir`. Sub-repos live as gitignored subfolders, each with its own independent git.

**Commands:**
- `/hub-init` — Initialize a new project hub (interactive)
- `/hub-launch` — Show how to launch the current hub (`./invoke-ai.sh`)
- `/hub-clone-all` — Clone every registered sub-repo URL into a missing subfolder
- `/hub-sync` — `git pull` across all sub-repos
- `/hub-status` — Aggregated git status report
- `/hub-add-repo` — Register a new sub-repo (clone, adopt, or sibling)
- `/hub-scan` — Find unregistered repos in/near the hub
- `/hub-describe` — Refresh sub-repo descriptions from their READMEs

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
    ├── ws-jira-enhancer/
    ├── ws-claude-sync/
    ├── ws-clamp/
    └── ws-project-hub/
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the thin router. Quick links:

- **Report bugs / request features** → [`docs/contributing.md`](docs/contributing.md)
- **Add a plugin** → [`dev-docs/runbooks/create-plugin.md`](dev-docs/runbooks/create-plugin.md)
- **Add a command / agent** → [`dev-docs/runbooks/add-command.md`](dev-docs/runbooks/add-command.md), [`dev-docs/runbooks/add-agent.md`](dev-docs/runbooks/add-agent.md)
- **Local setup, commit format, code style** → [`dev-docs/development.md`](dev-docs/development.md)

See [`dev-docs/runbooks/create-plugin.md`](dev-docs/runbooks/create-plugin.md) for detailed instructions.

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
