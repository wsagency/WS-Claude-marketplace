# Getting Started with WS Claude Marketplace

This tutorial walks you through installing the WS Claude Marketplace and using your first plugin.

## Prerequisites

Before starting, ensure you have:

- **Claude Code CLI** installed and configured
- **Git** with SSH access to `github.com`
- **tea CLI** (required for the ws plugin's git flows)
- **jira-cli** (required for the ws plugin's git flows)

### Installing Dependencies

#### Claude Code

Follow the [official installation guide](https://docs.anthropic.com/en/docs/claude-code) to install Claude Code.

#### tea CLI (for Git workflow commands)

The ws plugin's git flows require the tea CLI for Gitea integration:

```bash
# macOS (Homebrew)
brew install tea

# Or download from Gitea
# https://gitea.com/gitea/tea/releases

# Configure tea with your Gitea instance
tea login add --url https://git.wsagency.io --token YOUR_TOKEN
```

#### jira-cli (for Jira-aware workflows)

The ws plugin's git flows use [jira-cli](https://github.com/ankitpokhrel/jira-cli) for all Jira access:

```bash
# macOS (Homebrew)
brew install ankitpokhrel/jira-cli/jira-cli

# Export your Jira API token
export JIRA_API_TOKEN=<your-token>

# Initialize jira-cli with your Jira site
jira init
```

## Step 1: Add the Marketplace

Open a terminal and add the WS marketplace to Claude Code:

```bash
claude plugin marketplace add git@github.com:wsagency/WS-Claude-marketplace.git
```

This registers the marketplace so you can install plugins from it.

## Step 2: Install the Plugin

Install the `ws` plugin — the whole WS engineering suite ships in this one plugin:

```bash
claude plugin install ws@ws-marketplace
```

You should see confirmation that the plugin was installed.

## Step 3: Verify Installation

List installed plugins to confirm:

```bash
claude plugin list
```

You should see `ws` in the output.

## Step 4: Use Your First Command

Now let's use the plugin. Navigate to any project with a git repository:

```bash
cd /path/to/your/project
claude
```

Inside Claude Code, try updating the changelog:

```
/ws-docs changelog
```

Claude will analyze recent commits and add an entry to your CHANGELOG.md (or create one if it doesn't exist).

## Step 5: Explore More Commands

The same install already includes the git workflow commands for commit and PR automation:

- `/ws-commit` - Create a conventional commit
- `/ws-commit pr` - Commit, push, and create a PR in one step

### Using omp instead of (or alongside) Claude Code

The marketplace works in [omp](https://omp.sh) too — plugins installed via
Claude Code are auto-visible there, or add directly inside omp:

```
/marketplace add git@github.com:wsagency/WS-Claude-marketplace.git
/plugin install ws@ws-marketplace
```

See [Use the marketplace with omp](../how-to/use-with-omp.md) and
[Set up omp for the WS stack](../how-to/omp-setup.md).

### Your first command

Run **`/ws-help`** — a one-screen guide that adapts to your project and tells
you where to start (spoiler: `/ws-matt grill`).

The ws plugin also ships Matt Pocock's engineering skill graph: run `/ws-matt`
for a graph status, or `/ws-matt setup` to bootstrap a project.

## What's Next?

- Browse the [Command Reference](../reference/commands.md) to discover all available commands
- See [Contributing](../contributing.md) for how to propose or add your own plugin (routes to the contributor runbook)
- Read about [Plugin Architecture](../explanation/plugin-architecture.md) to understand how it works

## Troubleshooting

If you encounter issues:

- **Plugin not found**: Run `claude plugin marketplace update ws-marketplace` to refresh
- **SSH errors**: Verify your SSH key is added to github.com
- **tea errors**: Run `tea login list` to verify your Gitea authentication
- **jira errors**: Run `jira me` to verify jira-cli authentication (see `/ws-init`)

See [Troubleshooting](../how-to/troubleshooting.md) for more solutions.
