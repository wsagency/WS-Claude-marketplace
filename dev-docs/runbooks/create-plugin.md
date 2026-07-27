# How to Create a Plugin

This guide walks you through creating a new plugin for the WS Claude Marketplace.

## Prerequisites

- Marketplace repository cloned locally
- Familiarity with Claude Code and markdown
- Understanding of what commands/agents you want to create

## Step 1: Create the Plugin Directory

Create your plugin under the `plugins/` directory:

```bash
mkdir -p plugins/my-plugin/.claude-plugin
mkdir -p plugins/my-plugin/commands
mkdir -p plugins/my-plugin/agents  # optional
mkdir -p plugins/my-plugin/skills  # optional
```

## Step 2: Create plugin.json

Create the plugin metadata file at `plugins/my-plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "my-plugin",
  "description": "Brief description of what the plugin does",
  "author": { "name": "Your Name", "email": "your.email@ws.agency" }
}
```

Note: `plugin.json` carries **no version field** — the marketplace registry is the single version authority (see [ADR 0002](../decisions/0002-lockstep-marketplace-versioning.md)). The `description` here must stay in sync with the plugin's `description` in `marketplace.json`.

See [plugin.json Schema](../reference/plugin-json.md) for all available fields.

## Step 3: Add a Command

Create your first command at `plugins/my-plugin/commands/my-command.md`:

```markdown
---
description: Brief description shown in command list
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
---

# My Command

Instructions for Claude when this command is invoked.

## Context

- Current directory: The user's working directory
- Purpose: What this command should accomplish

## Steps

1. First, do this
2. Then do that
3. Finally, complete the task
```

See [How to Add a Command](add-command.md) for detailed guidance.

## Step 4: Register in Marketplace

Add your plugin to `.claude-plugin/marketplace.json`:

```json
{
  "plugins": [
    {
      "name": "my-plugin",
      "version": "<current release version>",
      "source": "./plugins/my-plugin",
      "category": "utilities",
      "tags": ["tag1", "tag2"],
      "description": "Brief description of the plugin"
    }
  ]
}
```

**Versioning is lockstep** ([ADR 0002](../decisions/0002-lockstep-marketplace-versioning.md)): a new plugin enters at the **current** marketplace release version (the same `version` every other entry already has — check the existing entries). Do not invent a fresh `1.0.0`. At the next release, all entries are bumped together to the new version. Keep the `description` here in sync with the plugin's `plugin.json`.

See [marketplace.json Schema](../reference/marketplace-json.md) for all fields.

## Step 5: Test Locally

Before committing, test your plugin:

1. Install it locally:
   ```bash
   claude plugin install ./plugins/my-plugin
   ```

2. Try your command:
   ```
   /my-command
   ```

3. Verify it works as expected

## Step 6: Submit Your Plugin

1. Create a branch:
   ```bash
   git checkout -b add-my-plugin
   ```

2. Commit your changes:
   ```bash
   git add plugins/my-plugin .claude-plugin/marketplace.json
   git commit -m "feat: add my-plugin with my-command"
   ```

3. Push and create a PR:
   ```bash
   git push -u origin add-my-plugin
   ```

## Plugin Structure Reference

Complete plugin structure:

```
plugins/my-plugin/
├── .claude-plugin/
│   └── plugin.json           # Plugin metadata (required)
├── commands/
│   ├── command-one.md        # Slash command
│   └── command-two.md        # Another command
├── agents/
│   └── my-agent.md           # Autonomous agent (optional)
└── skills/
    └── my-skill/
        ├── SKILL.md          # Skill entry point (optional)
        └── references/       # Supporting materials
```

## Tips

- **Keep commands focused**: One command should do one thing well
- **Use descriptive names**: Command names become `/command-name`
- **Document prerequisites**: Note any dependencies in your command
- **Test thoroughly**: Try your commands in different scenarios
- **Follow conventions**: Look at existing plugins for patterns

## What's Next?

- [How to Add a Command](add-command.md) - Detailed command authoring
- [How to Add an Agent](add-agent.md) - Create autonomous agents
- [Plugin Architecture](../explanation/plugin-architecture.md) - Understand the system
