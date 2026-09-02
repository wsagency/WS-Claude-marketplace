# Getting Started with WS Claude Marketplace

This tutorial walks you through installing the WS Claude Marketplace and using your first plugin.

## Prerequisites

Before starting, ensure you have:

- **Claude Code CLI** installed and configured
- **Git** with SSH access to `github.com`
- **tea CLI** (required only for Gitea pull-request flows)
- **jira-cli** (required only when the repository selects Jira behavior)

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

## Step 4: Configure the Project

Navigate to a Git repository and start Claude Code:

```bash
cd /path/to/your/project
claude
```

Run the sole setup command:

```text
/ws-setup
```

Review the complete plan, then select **Apply plan**. New repositories default to Local Markdown tickets and can optionally select GitHub, GitLab, Jira, Local/Jira synchronization, and documentation. Existing pre-5 repositories receive a migration plan. Run `/ws-setup` once more to verify the prompt-free `No changes required` result.

## Step 5: Explore More Commands

The same install already includes the git workflow commands for commit and PR automation:

- `/ws-commit` - Create a conventional commit
- `/ws-commit pr` - Commit, push, and create a PR in one step

### Using omp instead of (or alongside) Claude Code

On omp, install the native `@wsagency/omp-ws` package. It contains the same generated commands, skills, agents, schema, templates, and migration support plus the native runtime layer:

```bash
omp plugin install @wsagency/omp-ws
```

Do not also enable `ws@ws-marketplace` in omp because the complete surface would load twice. The Claude-format marketplace remains a compatibility alternative:

```text
/marketplace add git@github.com:wsagency/WS-Claude-marketplace.git
/plugin install ws@ws-marketplace
```

See [Use the marketplace with omp](../how-to/use-with-omp.md), [Set up omp for the WS stack](../how-to/omp-setup.md), and [Migrate an existing project to WS 5](../how-to/migrate-to-ws-5.md).

### Your first engineering command

Run `/ws-help` for a project-aware orientation, then use `/ws-matt grill` to stress-test an idea. Project setup remains owned by `/ws-setup`; it is not an engineering graph route.

### One repo, or many? A hub is optional

You don't need a hub to use the WS stack. A single repo — or several loose repos — works fully standalone: each repo's own `dev-docs/` is its knowledge root, using the same layout a hub would. When a project grows into multiple repos, run `/ws-hub init` in the parent directory — it adopts the existing repos (registering each with an inferred type) and offers to lift their product-level `dev-docs/` into a shared hub knowledge root. Nothing nags you to create a hub, and no command requires one. See the README's [Project hubs](../../README.md#project-hubs-ws-hub) section and ADR 0007.

## What's Next?

- Browse the [Command Reference](../reference/commands.md) to discover all available commands
- See [Contributing](../contributing.md) for how to propose or add your own plugin (routes to the contributor runbook)
- Read about [Plugin Architecture](../explanation/plugin-architecture.md) to understand how it works

## Troubleshooting

If you encounter issues:

- **Plugin not found**: Run `claude plugin marketplace update ws-marketplace` to refresh
- **SSH errors**: Verify your SSH key is added to github.com
- **tea errors**: Run `tea login list` to verify your Gitea authentication
- **jira errors**: Run `jira me` to verify jira-cli authentication, then rerun `/ws-setup`

See [Troubleshooting](../how-to/troubleshooting.md) for more solutions.
