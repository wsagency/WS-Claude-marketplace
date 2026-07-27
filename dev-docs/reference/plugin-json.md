# plugin.json Schema

The plugin metadata file that defines a plugin's identity.

## Location

`plugins/your-plugin/.claude-plugin/plugin.json`

## Schema

```json
{
  "name": "string (required)",
  "description": "string (required)",
  "author": "object (optional)",
  "repository": "string (optional)"
}
```

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Plugin identifier (must match directory name) |
| `description` | string | Yes | Brief description of the plugin's purpose (kept in sync with the `marketplace.json` entry) |
| `author` | object | No | `{ "name": "...", "email": "..." }` |
| `repository` | string | No | Source repository URL |

**No `version` field.** Per [ADR 0002](../decisions/0002-lockstep-marketplace-versioning.md), `marketplace.json` is the single version authority — every plugin's version is the marketplace release version, and `plugin.json` carries no version at all.

## Examples

### Minimal

```json
{
  "name": "my-plugin",
  "description": "Brief description of what the plugin does"
}
```

### Complete

```json
{
  "name": "ws",
  "description": "The WS Agency engineering suite in one plugin: ws-matt graph-engineered skills, Jira-aware git flows via jira-cli, dual-track docs with /ws-docs, and multi-repo project hubs via /ws-hub",
  "author": { "name": "WS Agency AI suite", "email": "ai@ws.agency" },
  "repository": "https://github.com/wsagency/WS-Claude-marketplace"
}
```

## Conventions

### name

- Must match the plugin directory name
- Use lowercase with hyphens: `my-plugin`
- Keep it short but descriptive

### description

- One sentence explaining the plugin's purpose
- Start with what it does, not "This plugin..."
- Example: "Jira-aware git workflows via jira-cli"
- Must stay in sync with the plugin's `description` in `marketplace.json`

### author

- Object form: `{ "name": "...", "email": "..." }`
- Email is optional
- Team attribution: `{ "name": "WS Agency", "email": "dev@ws.agency" }`

## Plugin Directory Structure

The plugin.json sits within a standard structure:

```
plugins/my-plugin/
├── .claude-plugin/
│   └── plugin.json      # This file
├── commands/
│   └── *.md             # Slash commands
├── agents/
│   └── *.md             # Autonomous agents
└── skills/
    └── skill-name/
        └── SKILL.md     # Knowledge skills
```

## Validation

Verify your plugin.json:

```bash
# Check JSON syntax
cat plugins/my-plugin/.claude-plugin/plugin.json | python -m json.tool

# Verify required fields
cat plugins/my-plugin/.claude-plugin/plugin.json | jq '.name, .description'
```

## Relationship to marketplace.json

- `plugin.json` defines the plugin's **identity**
- `marketplace.json` defines how the plugin is **distributed** and carries the **version**

Both files have a `name` field that must match. The version lives **only** in `marketplace.json` (lockstep, ADR 0002).

```
marketplace.json          plugin.json
├── name ─────────────── name (must match)
├── version               (no version here)
├── source ──────────────→ points to plugin directory
├── description ──────── description (kept in sync)
├── category              (not in plugin.json)
└── tags                  (not in plugin.json)
```
