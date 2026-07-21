# Plugin Architecture

Understanding how the WS Claude Marketplace plugin system works.

## Overview

The marketplace is a **plugin registry** that distributes Claude Code plugins to team members. It's not a package manager—it's a curated collection of tools specifically for WS Agency workflows.

```
┌─────────────────────────────────────────────┐
│           WS Claude Marketplace             │
├─────────────────────────────────────────────┤
│  marketplace.json (registry)                │
│    ├── docs-agent                           │
│    ├── ws-commit-commands                   │
│    ├── ws-jira-enhancer                     │
│    └── ws-project-hub                       │
├─────────────────────────────────────────────┤
│  plugins/                                   │
│    ├── docs-agent/                          │
│    │   ├── commands/                        │
│    │   ├── agents/                          │
│    │   └── skills/                          │
│    ├── ws-commit-commands/                  │
│    │   └── commands/                        │
│    ├── ws-jira-enhancer/                    │
│    │   └── commands/                        │
│    └── ws-project-hub/                      │
│        ├── commands/                        │
│        ├── agents/                          │
│        └── skills/                          │
└─────────────────────────────────────────────┘
```

## Core Concepts

### Plugins

A **plugin** is a packaged collection of commands, agents, and skills that extend Claude Code's capabilities. Each plugin:

- Has a unique name
- Lives in its own directory under `plugins/`
- Contains a `.claude-plugin/plugin.json` metadata file
- Is registered in the marketplace's `marketplace.json`

### Commands

A **command** is a slash-invocable action that runs inline in your Claude Code session.

**Characteristics:**
- Invoked with `/command-name`
- Executes in the current conversation context
- Best for straightforward, linear tasks
- Defined in `commands/*.md` files

**Example use cases:**
- `/changelog` - Generate a changelog
- `/ws-commit` - Create a git commit

### Agents

An **agent** is an autonomous subprocess that handles complex, multi-step tasks.

**Characteristics:**
- Spawned via the Task tool
- Runs independently with its own context
- Can make decisions and adapt
- Defined in `agents/*.md` files

**Example use cases:**
- `docs-architect` - Plans documentation structure
- `api-documenter` - Analyzes code and generates API docs

### Skills

A **skill** is a knowledge resource that provides context, templates, or guidelines.

**Characteristics:**
- Loaded on-demand when relevant
- Provides reference material, not actions
- Defined in `skills/skill-name/SKILL.md`

**Example use cases:**
- `diataxis` - Documentation framework guidelines
- `keep-a-changelog` - Changelog format standards

## How It Works

### Installation Flow

```
1. Add marketplace
   claude plugin marketplace add git@git.wsagency.io:...

2. Install plugin
   claude plugin install docs-agent@ws-marketplace

3. Plugin available
   /docs-tutorial, /changelog, etc.
```

### Command Execution

When you invoke `/changelog`:

```
1. Claude Code finds the command
   plugins/docs-agent/commands/changelog.md

2. Reads YAML frontmatter
   - description
   - allowed-tools
   - arguments

3. Loads command content as instructions

4. Executes with specified tools available
```

### Agent Spawning

When a command uses the Task tool:

```
1. Command requests agent
   Task tool with subagent_type: "docs-agent:changelog-analyzer"

2. Claude Code finds the agent
   plugins/docs-agent/agents/changelog-analyzer.md

3. Spawns subprocess with:
   - Agent's system prompt
   - Configured tools
   - Task-specific prompt

4. Agent works autonomously

5. Returns results to parent
```

## Component Comparison

| Aspect | Command | Agent | Skill |
|--------|---------|-------|-------|
| Invocation | `/name` | Task tool | Auto-loaded |
| Execution | Inline | Subprocess | N/A |
| Autonomy | Low | High | N/A |
| Use case | Simple tasks | Complex tasks | Knowledge |
| State | Shared | Isolated | Reference |

## File Structure

### Command File

```markdown
---
description: What this command does
allowed-tools:
  - Read
  - Write
  - Bash
arguments:
  - name: arg1
    description: What this argument is for
    required: false
---

# Command Title

Instructions for Claude when executing this command.
```

### Agent File

```markdown
---
description: What this agent does
tools:
  - Read
  - Write
  - Glob
  - Grep
  - Task
---

# Agent Title

System prompt that defines the agent's behavior and approach.
```

### Skill File

```markdown
---
name: skill-name
description: What knowledge this skill provides
trigger-keywords:
  - keyword1
  - keyword2
---

# Skill Title

Reference content, templates, guidelines, and examples.
```

## The Marketplace Registry

The `marketplace.json` file serves as the central registry:

```json
{
  "plugins": [
    {
      "name": "docs-agent",
      "version": "1.0.0",
      "source": "./plugins/docs-agent",
      "category": "documentation",
      "tags": ["docs", "changelog"]
    }
  ]
}
```

This enables:
- **Discovery**: `claude plugin marketplace list`
- **Installation**: `claude plugin install docs-agent@ws-marketplace`
- **Updates**: `claude plugin marketplace update ws-marketplace`

## Design Principles

### 1. Convention Over Configuration

Plugin structure follows predictable patterns:
- Commands in `commands/`
- Agents in `agents/`
- Skills in `skills/`

### 2. Composability

- Commands can invoke agents
- Agents can spawn sub-agents
- Skills provide shared knowledge

### 3. Isolation

- Each plugin is self-contained
- Agents run in isolated contexts
- No cross-plugin dependencies

### 4. Discoverability

- Consistent naming conventions
- Metadata in frontmatter
- Central registry

## When to Use What

**Use a Command when:**
- Task is straightforward
- Steps are predictable
- User interaction is minimal
- Execution is fast

**Use an Agent when:**
- Task requires exploration
- Multiple decisions needed
- Work is substantial
- Parallel subtasks help

**Use a Skill when:**
- Providing reference material
- Sharing templates
- Encoding standards
- Offering guidelines

## Contributing

To add to the marketplace:

1. Create your plugin under `plugins/`
2. Add commands, agents, or skills as needed
3. Register in `marketplace.json`
4. Submit a pull request

See [How to Create a Plugin](../how-to/create-plugin.md) for detailed steps.
