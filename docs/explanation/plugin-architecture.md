# Plugin Architecture

Understanding how the WS Claude Marketplace plugin system works.

## Overview

The marketplace is a **plugin registry** that distributes Claude Code plugins to team members. It's not a package manager—it's a curated collection of tools specifically for WS Agency workflows.

```
┌─────────────────────────────────────────────┐
│           WS Claude Marketplace             │
├─────────────────────────────────────────────┤
│  marketplace.json (registry)                │
│    └── ws                                   │
├─────────────────────────────────────────────┤
│  plugins/                                   │
│    └── ws/                                  │
│        ├── commands/                        │
│        ├── agents/                          │
│        ├── skills/                          │
│        ├── hooks/                           │
│        ├── rules/                           │
│        ├── scripts/                         │
│        ├── templates/                       │
│        └── docs/                            │
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
- `/ws-docs changelog` - Generate a changelog
- `/ws-commit` - Create a git commit

### Agents

An **agent** is an autonomous subprocess that handles complex, multi-step tasks.

**Characteristics:**
- Spawned via the Task tool
- Runs independently with its own context
- Can make decisions and adapt
- Defined in `agents/*.md` files

**Example use cases:**
- `diataxis-writer` - Writes tutorials, how-to guides, and explanations
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
   claude plugin marketplace add git@github.com:wsagency/WS-Claude-marketplace.git

2. Install plugin
   claude plugin install ws@ws-marketplace

3. Plugin available
   /ws-help, /ws-docs, /ws-commit, etc.
```

### Command Execution

When you invoke `/ws-docs`:

```
1. Claude Code finds the command
   plugins/ws/commands/ws-docs.md

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
   Task tool with subagent_type: "ws:changelog-analyzer"

2. Claude Code finds the agent
   plugins/ws/agents/changelog-analyzer.md

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
allowed-tools: Read, Write, Bash
argument-hint: "[arg1]"
---

# Command Title

Instructions for Claude when executing this command.
The arguments the user typed are available as `$ARGUMENTS` (full string) or positional `$1`, `$2`, ....
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
description: What knowledge this skill provides, and when to use it
---

# Skill Title

Reference content, templates, guidelines, and examples.
```

Skill loading is **description-based**: Claude Code reads the `description` frontmatter and loads the skill when the conversation matches it. Write the description to say both what the skill knows and when it applies (e.g. "Use when writing or maintaining a changelog").

## The Marketplace Registry

The `marketplace.json` file serves as the central registry (the `version` value below is illustrative — it always equals the current lockstep release version):

```json
{
  "plugins": [
    {
      "name": "ws",
      "version": "4.0.0",
      "source": "./plugins/ws",
      "category": "development",
      "tags": ["docs", "changelog", "git", "jira", "tdd", "hub"]
    }
  ]
}
```

All plugins share a single version — the marketplace release version — so every `version` field in the registry is identical (lockstep versioning).

This enables:
- **Discovery**: `claude plugin marketplace list`
- **Installation**: `claude plugin install ws@ws-marketplace`
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

See [Contributing](../contributing.md) for how to get started — it routes plugin authors to the contributor runbook.
