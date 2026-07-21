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

## Documentation maintenance

This project uses the WS dual-track-docs convention (docs-agent plugin v3.0.0+).

- `docs/` — user-facing (VitePress-publishable)
- `dev-docs/` — internal contributor (maintainers, plugin authors)
- Single `CHANGELOG.md` at root, mirrored to `docs/changelog.md`
- ADRs in `dev-docs/decisions/`
- `dev-docs/runbooks/` holds the create-plugin / add-command / add-agent guides

### Always do

- After completing a group of code changes, append an entry to `CHANGELOG.md` under `[Unreleased]` using the `keep-a-changelog` skill (auto-loads on the word "changelog"). Map: feat→Added, fix→Fixed, perf/refactor→Changed, security→Security, breaking→**BREAKING:** prefix.
- When introducing a new architectural pattern, framework choice, or breaking convention, propose `/ws-docs adr "<decision>"` before finishing.
- When changing public surface (a plugin's commands, agents, or skills), update the matching reference in `docs/reference/` and ensure the plugin's `description` field stays in sync between `plugin.json` and `marketplace.json`.
- Versioning is lockstep (ADR 0002): all `version` fields in `marketplace.json` equal the repo release version. On release: cut `[Unreleased]` in CHANGELOG.md, mirror to `docs/changelog.md`, set all versions, tag `vX.Y.Z`. Never bump a single plugin independently.

### On request

- `/ws-docs` — status / audit
- `/ws-docs <verb>` — init / audit / catchup / repair / write / adr / architecture / contributing / changelog / release-notes
