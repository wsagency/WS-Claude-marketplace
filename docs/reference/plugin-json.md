# plugin.json Schema

The plugin metadata file that defines a plugin's identity.

## Location

`plugins/your-plugin/.claude-plugin/plugin.json`

## Schema

```json
{
  "name": "string (required)",
  "description": "string (required)",
  "author": "string (optional)",
  "version": "string (optional)",
  "repository": "string (optional)"
}
```

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Plugin identifier (must match directory name) |
| `description` | string | Yes | Brief description of the plugin's purpose |
| `author` | string | No | Author name and email |
| `version` | string | No | Plugin version (can also be in marketplace.json) |
| `repository` | string | No | Source repository URL |

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
  "name": "docs-agent",
  "description": "Documentation generation using the Diataxis framework",
  "author": "WS Agency <dev@ws.agency>",
  "version": "1.0.0",
  "repository": "https://git.wsagency.io/ws-public/WS-Claude-marketplace"
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
- Example: "Git workflows for Gitea using tea CLI"

### author

- Format: `Name <email>`
- Or just: `Name`
- Team attribution: `WS Agency <dev@ws.agency>`

### version

- Follow semantic versioning if specified
- Often managed in marketplace.json instead
- Both locations are valid

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
- `marketplace.json` defines how the plugin is **distributed**

Both files have a `name` field that should match. Version can appear in either or both.

```
marketplace.json          plugin.json
├── name ─────────────── name (must match)
├── version               version (optional)
├── source ──────────────→ points to plugin directory
├── description           description
├── category              (not in plugin.json)
└── tags                  (not in plugin.json)
```
