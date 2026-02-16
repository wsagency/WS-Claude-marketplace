# WS Claude Marketplace

A curated registry of Claude Code plugins, agents, and tools built by [ws.agency](https://ws.agency).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Available Plugins

| Plugin | Description | Commands |
|--------|-------------|----------|
| [docs-agent](./plugins/docs-agent) | Documentation generation using Diátaxis framework | `/docs-tutorial`, `/docs-howto`, `/docs-explanation`, `/docs-reference`, `/changelog`, `/changelog-entry` |
| [ws-commit-commands](./plugins/ws-commit-commands) | Git workflows for Gitea using tea CLI | `/ws-commit`, `/ws-commit-push-pr`, `/ws-clean-gone` |
| [ws-jira-enhancer](./plugins/ws-jira-enhancer) | Transform task descriptions into Jira tickets | `/ws-jira-enhancer` |
| [ws-claude-sync](./plugins/ws-claude-sync) | Sync Claude contexts across machines via GitHub | `/ws-sync-setup`, `/ws-sync`, `/ws-sync-pull`, `/ws-sync-push`, `/ws-sync-full`, `/ws-sync-status` |
| [ws-clamp](./plugins/ws-clamp) | Move, archive, and manage Claude projects | `/clamp-move`, `/clamp-inspect`, `/clamp-maintain`, `/clamp-archive` |

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

Generate changelogs and documentation following Keep a Changelog and Diátaxis standards.

**Commands:**
- `/docs-tutorial` — Create a learning-oriented tutorial
- `/docs-howto` — Create a task-oriented how-to guide
- `/docs-explanation` — Write an understanding-oriented explanation
- `/docs-reference` — Generate API or technical reference documentation
- `/changelog` — Generate or update CHANGELOG.md from git history
- `/changelog-entry` — Add a single entry to CHANGELOG.md

**Agents:** `docs-architect`, `tutorial-writer`, `api-documenter`, `changelog-analyzer`

### ws-commit-commands

Git workflow commands for Gitea using tea CLI — commit, push, and create pull requests.

**Requires:** [tea CLI](https://gitea.com/gitea/tea) — `brew install tea && tea login add`

**Commands:**
- `/ws-commit` — Create a git commit with conventional commit format
- `/ws-commit-push-pr` — Commit, push, and create a pull request
- `/ws-clean-gone` — Clean up git branches marked as `[gone]`

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

## Project Structure

```
ws-claude-marketplace/
├── .claude-plugin/
│   └── marketplace.json     # Plugin registry
├── docs/                    # Documentation (Diátaxis)
│   ├── tutorials/
│   ├── how-to/
│   ├── reference/
│   └── explanation/
└── plugins/
    ├── docs-agent/
    ├── ws-commit-commands/
    ├── ws-jira-enhancer/
    ├── ws-claude-sync/
    └── ws-clamp/
```

## Contributing

1. Clone the repository
2. Add or modify plugins under `plugins/`
3. Register new plugins in `.claude-plugin/marketplace.json`
4. Submit a pull request

See [How to Create a Plugin](./docs/how-to/create-plugin.md) for detailed instructions.

## Documentation

Full documentation is available in the [`docs/`](./docs/index.md) directory:

- [Getting Started Tutorial](./docs/tutorials/getting-started.md)
- [How to Create a Plugin](./docs/how-to/create-plugin.md)
- [Command Reference](./docs/reference/commands.md)

## Attribution

Created by [ws.agency](https://ws.agency)

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 WEB Solutions Ltd. (ws.agency) & Kristijan Lukačin
