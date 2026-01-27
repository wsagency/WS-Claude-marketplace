# WS Claude Marketplace

Internal Claude Code plugins, agents, and tools for WS Agency team members.

## Installation

### Add the Marketplace

```bash
# Add WS marketplace (one-time setup)
claude plugin marketplace add git@git.wsagency.io:ws-public/WS-Claude-marketplace.git
```

### Install Plugins

```bash
# Install individual plugins
claude plugin install docs-agent@ws-marketplace
claude plugin install ws-commit-commands@ws-marketplace
```

### Other Useful Commands

```bash
# List available plugins in the marketplace
claude plugin marketplace list

# Update the marketplace to get latest plugins
claude plugin marketplace update ws-marketplace

# Uninstall a plugin
claude plugin uninstall docs-agent@ws-marketplace
```

## Available Plugins

| Plugin | Description | Commands |
|--------|-------------|----------|
| [docs-agent](./plugins/docs-agent) | Documentation generation using Diataxis framework | `/docs-tutorial`, `/docs-howto`, `/docs-explanation`, `/docs-reference`, `/changelog`, `/changelog-entry` |
| [ws-commit-commands](./plugins/ws-commit-commands) | Git workflows for Gitea using tea CLI | `/ws-commit`, `/ws-commit-push-pr`, `/ws-clean-gone` |

## Plugin Details

### docs-agent

Generate changelogs and documentation following Keep a Changelog and Diataxis standards.

**Commands:**
- `/docs-tutorial` - Create a learning-oriented tutorial
- `/docs-howto` - Create a task-oriented how-to guide
- `/docs-explanation` - Write an understanding-oriented explanation
- `/docs-reference` - Generate API or technical reference documentation
- `/changelog` - Generate or update CHANGELOG.md from git history
- `/changelog-entry` - Add a single entry to CHANGELOG.md

**Agents:**
- `docs-architect` - Plans documentation structure
- `tutorial-writer` - Writes hands-on tutorials
- `api-documenter` - Generates API reference docs
- `changelog-analyzer` - Analyzes git commits for changelog generation

### ws-commit-commands

Git workflow commands for Gitea using tea CLI - commit, push, and create pull requests.

**Commands:**
- `/ws-commit` - Create a git commit with conventional commit format
- `/ws-commit-push-pr` - Commit, push, and create a pull request
- `/ws-clean-gone` - Clean up git branches marked as [gone]

## Directory Structure

```
ws-claude-marketplace/
├── .claude-plugin/
│   └── marketplace.json    # Marketplace registry
├── plugins/                # Claude Code plugins
│   ├── docs-agent/
│   └── ws-commit-commands/
├── agents/                 # Standalone agents (future)
├── prompts/                # Reusable prompts (future)
├── mcp-servers/            # MCP server configs (future)
└── workflows/              # Multi-step workflows (future)
```

## Contributing

To add a new plugin or update an existing one:

1. Clone this repository
2. Add/modify content in the appropriate directory
3. Update `.claude-plugin/marketplace.json` if adding a new plugin
4. Submit a pull request

## Support

Contact the development team at dev@ws.agency for questions or issues.
