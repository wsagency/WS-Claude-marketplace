# Getting Started with WS Claude Marketplace

This tutorial walks you through installing the WS Claude Marketplace and using your first plugin.

## Prerequisites

Before starting, ensure you have:

- **Claude Code CLI** installed and configured
- **Git** with SSH access to `git.wsagency.io`
- **tea CLI** (required for ws-commit-commands plugin)

### Installing Dependencies

#### Claude Code

Follow the [official installation guide](https://docs.anthropic.com/en/docs/claude-code) to install Claude Code.

#### tea CLI (for Git workflow commands)

The `ws-commit-commands` plugin requires the tea CLI for Gitea integration:

```bash
# macOS (Homebrew)
brew install tea

# Or download from Gitea
# https://gitea.com/gitea/tea/releases

# Configure tea with your Gitea instance
tea login add --url https://git.wsagency.io --token YOUR_TOKEN
```

## Step 1: Add the Marketplace

Open a terminal and add the WS marketplace to Claude Code:

```bash
claude plugin marketplace add git@git.wsagency.io:ws-public/WS-Claude-marketplace.git
```

This registers the marketplace so you can install plugins from it.

## Step 2: Install a Plugin

Install the `docs-agent` plugin to try documentation generation:

```bash
claude plugin install docs-agent@ws-marketplace
```

You should see confirmation that the plugin was installed.

## Step 3: Verify Installation

List installed plugins to confirm:

```bash
claude plugin list
```

You should see `docs-agent` in the output.

## Step 4: Use Your First Command

Now let's use the plugin. Navigate to any project with a git repository:

```bash
cd /path/to/your/project
claude
```

Inside Claude Code, try generating a changelog entry:

```
/changelog-entry
```

Claude will analyze recent commits and add an entry to your CHANGELOG.md (or create one if it doesn't exist).

## Step 5: Install More Plugins

Install the git workflow plugin for commit and PR automation:

```bash
claude plugin install ws-commit-commands@ws-marketplace
```

Now you can use commands like:
- `/ws-commit` - Create a conventional commit
- `/ws-commit-push-pr` - Commit, push, and create a PR in one step

### Cross-Machine Sync

Sync your Claude contexts across machines:

```bash
claude plugin install ws-claude-sync@ws-marketplace
```

Set up with `/ws-sync-setup`, then use `/ws-sync-pull` and `/ws-sync-push` daily.

### Project Management

Move and manage Claude projects without losing session history:

```bash
claude plugin install ws-clamp@ws-marketplace
```

Use `/clamp-inspect` to list projects, `/clamp-move` to relocate them.

## What's Next?

- Browse the [Command Reference](../reference/commands.md) to discover all available commands
- Learn [How to Create a Plugin](../how-to/create-plugin.md) to contribute your own
- Read about [Plugin Architecture](../explanation/plugin-architecture.md) to understand how it works

## Troubleshooting

If you encounter issues:

- **Plugin not found**: Run `claude plugin marketplace update ws-marketplace` to refresh
- **SSH errors**: Verify your SSH key is added to git.wsagency.io
- **tea errors**: Run `tea login list` to verify your Gitea authentication

See [Troubleshooting](../how-to/troubleshooting.md) for more solutions.
