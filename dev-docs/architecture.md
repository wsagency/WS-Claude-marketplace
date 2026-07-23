# Marketplace Architecture (Internal)

This document describes the internal structure, plugin discovery, registration, and maintenance model for the WS Claude Marketplace.

## High-Level Structure

The marketplace is organized around a **central registry** (`marketplace.json`) that points to **plugin source directories** under `plugins/`. Claude Code discovers plugins via the registry, installs them to `~/.claude/plugins/cache/ws-marketplace/<plugin>/<version>/`, and loads components (commands, agents, skills) from the installed location.

```
marketplace.json (registry)
  ├─ plugin metadata (name, version, source, category, tags)
  └─ static → plugins/ (discoverable components)
  
plugins/ (source directories)
  ├── docs-agent/
  │   ├── .claude-plugin/plugin.json
  │   ├── commands/*.md (slash-invocable)
  │   ├── agents/*.md (Task-spawned)
  │   ├── skills/*/SKILL.md (knowledge bases)
  │   ├── hooks/ (optional: PreToolUse, Stop)
  │   ├── scripts/ (optional: setup/init)
  │   └── templates/ (optional: scaffolding)
  └── ... (other plugins)

~/.claude/plugins/cache/ws-marketplace/
  └── <plugin>/<version>/ (installed copies)
```

## Plugin Anatomy

Each plugin directory contains standardized subdirectories:

### `.claude-plugin/plugin.json` (Required)

Plugin metadata file in the plugin's root. Minimal schema:

```json
{
  "name": "plugin-name",
  "description": "What the plugin does",
  "author": { "name": "Author Name" }
}
```

This is distinct from the registry entry in `marketplace.json` (which includes version and source path). The plugin.json is shipped with the plugin and loaded at runtime.

### `commands/*.md` (Slash-invocable)

Markdown files with YAML frontmatter defining slash commands. Executed inline in the session.

**Frontmatter schema:**
```yaml
description: Brief description
allowed-tools: [Tool1, Tool2, ...]
arguments:
  - name: arg-name
    description: What the argument does
    required: false
```

**Example:** `commands/ws-docs.md` defines `/ws-docs` (unified entry point for documentation tasks).

**Execution model:** Command is loaded as inline instructions; user can pass arguments via the slash interface.

### `agents/*.md` (Task-spawned subagents)

Markdown files with YAML frontmatter defining autonomous agents. Spawned via the Task tool as subprocesses with isolated context.

**Frontmatter schema:**
```yaml
description: What the agent does
tools: [Tool1, Tool2, ...]
```

The agent's content is the system prompt. Agents are identified by dotted paths like `docs-agent:changelog-analyzer` (plugin-name:agent-file-name).

**Execution model:** Task tool spawns subprocess with the agent's system prompt and specified tools. Agent works autonomously and returns results to parent.

### `skills/skill-name/SKILL.md` (Knowledge bases)

Markdown files providing reference material, templates, or guidelines. Loaded on-demand when trigger keywords match.

**Frontmatter schema:**
```yaml
name: skill-name
description: Brief description
trigger-keywords: [keyword1, keyword2, ...]
```

**Structure:** `skills/skill-name/` contains:
- `SKILL.md` - Entry point with overview
- `references/` - Reference materials (guides, standards)
- `examples/` - Concrete examples and templates

**Loading model:** Claude Code inspects trigger keywords and loads skills into context when relevant. Unlike commands/agents, skills are passive knowledge resources.

### `hooks/` (Optional)

JSON-based hook configurations for PreToolUse and Stop callbacks. Enables plugins to intercept tool calls or session state changes.

**Example:** `docs-agent/hooks/hooks.json` registers background watchers (arch-watcher, public-api-watcher) that trigger autonomously on session events.

### `templates/` (Optional)

Scaffolding and boilerplate for plugin-specific workflows. Used during initialization or project setup.

**Example:** `ws-project-hub/templates/` contains AGENTS.md/CLAUDE.md templates and hub initialization scripts.

### `scripts/` (Optional)

Shell scripts for plugin setup, installation, or maintenance tasks.

**Example:** `docs-agent/scripts/` contains initialization and upgrade logic.

## Registration Mechanics

The `marketplace.json` at the repository root is the single source of truth for plugin discovery.

**Schema:**
```json
{
  "name": "ws-marketplace",
  "description": "...",
  "owner": { "name": "...", "email": "..." },
  "plugins": [
    {
      "name": "unique-plugin-name",
      "description": "What it does",
      "version": "x.y.z",
      "source": "./plugins/relative/path",
      "category": "development|utilities|...",
      "author": { "name": "..." },
      "tags": ["tag1", "tag2"]
    }
  ]
}
```

**Key constraints:**
- `name` must be unique within the marketplace
- `version` follows semantic versioning
- `source` is a relative path from the marketplace root
- `category` and `tags` aid discovery via `claude plugin marketplace list`

**Adding a plugin:**
1. Create `plugins/<plugin-name>/` with `.claude-plugin/plugin.json` and component directories
2. Add entry to `plugins` array in `marketplace.json`
3. Commit and push; Claude Code discovers via marketplace URL

## Discovery & Loading

### Installation Flow

```
1. Register marketplace
   claude plugin marketplace add https://github.com/wsagency/ws-claude-marketplace

2. Discover plugins
   claude plugin marketplace list
   → Reads marketplace.json, lists all plugins with descriptions

3. Install plugin
   claude plugin install docs-agent@ws-marketplace
   → Clones marketplace repo, copies plugins/docs-agent/ to
     ~/.claude/plugins/cache/ws-marketplace/docs-agent/<version>/

4. Session reload
   Claude Code session must reload for new commands/agents to be available
```

### Component Discovery

After installation, Claude Code discovers components from the cached plugin directory:

- **Commands:** Scans `commands/*.md`, registers `/name` with metadata from frontmatter
- **Agents:** Scans `agents/*.md`, enables spawning via Task tool with `plugin-name:agent-name`
- **Skills:** Scans `skills/*/SKILL.md`, registers trigger keywords for contextual loading
- **Hooks:** Loads `hooks/hooks.json`, configures event listeners

## Commands vs Agents vs Skills

| Aspect | Command | Agent | Skill |
|--------|---------|-------|-------|
| **Invocation** | `/command-name` | Task tool with `plugin-name:agent-name` | Auto-loaded by keyword |
| **Execution** | Inline in session | Subprocess (isolated context) | Reference/knowledge only |
| **Autonomy** | Low (follows instructions) | High (makes decisions) | N/A (passive) |
| **State** | Shared with session | Isolated | Reference material |
| **Use case** | Simple, linear tasks | Multi-step exploration | Shared standards/templates |
| **Example** | `/ws-commit` (create commit) | `changelog-analyzer` (analyze history, propose changes) | `diataxis` (documentation framework) |

## Cross-Plugin Dependencies

Plugins can reference or depend on capabilities from other plugins:

### MCP Tool References
- `ws-commit-commands` references Atlassian MCP tools (Jira) in its allowed-tools
- Commands can invoke MCP servers registered globally

### Vendored Skills
- `ws-project-hub` imports the `dual-track-docs` skill from `docs-agent` at init time
- Enables consistent documentation practices across hub projects

### Subagent Spawning
- Commands can spawn agents from any plugin via Task tool
- Agents can spawn other agents (subagent chains)

**Design principle:** Plugins are self-contained but can compose via explicit tool declarations and Task-based spawning. No implicit dependencies; all capabilities are declared in frontmatter.

## Dual-Track Docs Adoption

The marketplace itself uses the **dual-track documentation convention** (see `docs-agent` skill `dual-track-docs`):

- **`docs/`** - User-facing documentation (how to use plugins, install, troubleshoot)
- **`dev-docs/`** - Maintainer-facing documentation (architecture, decisions, runbooks)

Organization of `dev-docs/`:
- `index.md` - Start here; overview of developer workflows
- `decisions/` - Architecture Decision Records (ADRs)
- `explanation/` - Deep-dive explanations (e.g., plugin-architecture.md)
- `reference/` - Standards, schemas, checklists
- `runbooks/` - Step-by-step contributor how-tos

This structure ensures new maintainers can quickly understand system design and contributor expectations.

## Maintainer Navigation

**Where to find what:**

- **Plugin code:** `plugins/<plugin-name>/` - Each plugin is self-contained; start with `commands/` for entry points, then explore `agents/` and `skills/` for complex workflows.
- **Registry:** `.claude-plugin/marketplace.json` - Canonical list of plugins, versions, and metadata. Update when adding/removing plugins.
- **Maintainer docs:** `dev-docs/runbooks/` - Step-by-step guides for adding plugins, updating registry, versioning, and releases.
- **Decisions:** `dev-docs/decisions/` - Why certain architectural choices were made (e.g., why skills use trigger keywords, why hooks are optional).

**Quick start for contributors:** Read `dev-docs/index.md`, then the relevant runbook (e.g., `add-plugin.md` or `update-plugin.md`).

## Install Path Conventions

After installation, plugins are cached at:
```
~/.claude/plugins/cache/ws-marketplace/<plugin-name>/<version>/
```

This follows Claude Code's standard plugin cache structure, enabling:
- **Multiple versions:** Different projects can use different plugin versions simultaneously
- **Offline work:** Once cached, plugins remain available without network access
- **Clean updates:** `claude plugin marketplace update ws-marketplace` refreshes the cache

## Session Reload Requirement

After installing a new plugin or updating an existing one, **the Claude Code session must be reloaded** for new commands/agents/skills to become available. This is a limitation of the current Claude Code plugin architecture—plugins are discovered and loaded at session start, not dynamically during the session.

