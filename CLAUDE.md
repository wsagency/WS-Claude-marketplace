# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is the WS Agency internal Claude Code marketplace - a registry of plugins, agents, prompts, MCP servers, and workflows distributed to team members.

## Architecture

**Marketplace Registry**: `.claude-plugin/marketplace.json` is the central manifest that registers all available plugins. Each plugin entry specifies name, version, source path, and metadata.

**Plugin Structure**: Each plugin under `plugins/` follows Claude Code plugin conventions:
- `.claude-plugin/plugin.json` - Plugin metadata (name, description, author)
- `commands/*.md` - Slash commands with YAML frontmatter for allowed-tools and description
- `agents/*.md` - Agent definitions with YAML frontmatter for tools and system prompts
- `skills/*/SKILL.md` - Knowledge skills with trigger keywords and reference materials

**Commands vs Agents**: Commands (invoked via `/command-name`) execute inline in the conversation. Agents are spawned as subagents via the Task tool for autonomous multi-step work.

## Adding a New Plugin

1. Create `plugins/<plugin-name>/.claude-plugin/plugin.json`
2. Add commands, agents, or skills directories as needed
3. Register in `.claude-plugin/marketplace.json` under the `plugins` array with name, version, source path, category, and tags

## Key Files

- `.claude-plugin/marketplace.json` - Marketplace plugin registry (must be updated when adding plugins)
- `plugins/*/commands/*.md` - Executable slash commands
- `plugins/*/agents/*.md` - Task tool subagent definitions
- `plugins/*/skills/*/SKILL.md` - Knowledge/skill entry points with references and examples subdirectories
