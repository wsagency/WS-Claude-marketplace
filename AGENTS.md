# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, omp, and others) when
working with code in this repository. It is the canonical context file; `CLAUDE.md` is
a thin `@AGENTS.md` import kept for Claude Code compatibility.

## Repository Purpose

This is the WS Agency internal Claude Code-compatible marketplace - a registry of plugins, agents, prompts, MCP servers, and workflows distributed to team members. It works in Claude Code natively and in omp (omp.sh) via its Claude-compatible marketplace support.

## Architecture

**Marketplace Registry**: `.claude-plugin/marketplace.json` is the central manifest that registers all available plugins. Each plugin entry specifies name, version, source path, and metadata.

**Plugin Structure**: Each plugin under `plugins/` follows Claude Code plugin conventions:
- `.claude-plugin/plugin.json` - Plugin metadata (name, description, author)
- `commands/*.md` - Slash commands with YAML frontmatter for allowed-tools and description
- `agents/*.md` - Agent definitions with YAML frontmatter for tools and system prompts
- `skills/*/SKILL.md` - Knowledge skills with trigger keywords and reference materials

**Commands vs Agents**: Commands (invoked via `/command-name`) execute inline in the conversation. Agents are spawned as subagents via the Task tool (omp: its task agent) for autonomous multi-step work.

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

- After completing a group of code changes, append an entry to `CHANGELOG.md` under `[Unreleased]` using the `keep-a-changelog` skill (auto-loads on the word "changelog"). Map: feat→Added, fix→Fixed, perf/refactor→Changed, security→Security, breaking→**BREAKING:** prefix. Changelog timing convention for WS projects: **PR-time is canonical** (entries land via `/ws-commit-push-pr`); per-commit enforcement is opt-in.
- When introducing a new architectural pattern, framework choice, or breaking convention, propose `/ws-docs adr "<decision>"` before finishing. ADRs are **two-tier** (all in `dev-docs/decisions/`, one numbering): lightweight (1-3 sentences) by default; full MADR v4.0.0 when the decision is breaking, costly to undo, or had multiple serious options.
- Skill precedence in WS projects: **ws-matt discipline skills are authoritative** for TDD, code review, and research flows; superpowers process skills (brainstorming, systematic-debugging) remain complementary for other activities.
- Design specs and implementation plans live in `dev-docs/superpowers/` (internal track), not `docs/`.
- **Language: everything written is ENGLISH.** All development artifacts — code, comments, commands, skills, specs, ADRs, changelogs, commit messages, dev-docs, command output templates — are English only, for uniformity. User-facing documentation may be translated to other languages, but the ORIGINALS are English. Conversation with the user may be in any language; written artifacts never follow the conversation language. (Proper nouns keep their spelling.)
- When changing public surface (a plugin's commands, agents, or skills), update the matching reference in `docs/reference/` and ensure the plugin's `description` field stays in sync between `plugin.json` and `marketplace.json`.
- Versioning is lockstep (ADR 0002): all `version` fields in `marketplace.json` equal the repo release version. On release: cut `[Unreleased]` in CHANGELOG.md, mirror to `docs/changelog.md`, set all versions, tag `vX.Y.Z`. Never bump a single plugin independently.
- Context files follow the AGENTS.md convention (this file): canonical content in `AGENTS.md`, `CLAUDE.md` is only the `@AGENTS.md` import. Never add content to `CLAUDE.md` directly. Exception: tool-managed marker blocks (e.g. OpenWiki's `<!-- OPENWIKI:START/END -->`) are owned by their tool and left alone.

### On request

- `/ws-docs` — status / audit
- `/ws-docs <verb>` — init / audit / catchup / repair / write / adr / architecture / contributing / changelog / release-notes / explain / publish / pull-back
