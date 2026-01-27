# marketplace.json Schema

The marketplace registry file that defines available plugins.

## Location

`.claude-plugin/marketplace.json`

## Schema

```json
{
  "plugins": [
    {
      "name": "string (required)",
      "version": "string (required)",
      "source": "string (required)",
      "description": "string (optional)",
      "category": "string (optional)",
      "tags": ["string"]
    }
  ]
}
```

## Fields

### plugins (required)

Array of plugin entries.

### Plugin Entry Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique plugin identifier |
| `version` | string | Yes | Semantic version (e.g., "1.0.0") |
| `source` | string | Yes | Path to plugin directory relative to marketplace root |
| `description` | string | No | Brief description of the plugin |
| `category` | string | No | Plugin category for organization |
| `tags` | array | No | Keywords for discovery |

## Example

```json
{
  "plugins": [
    {
      "name": "docs-agent",
      "version": "1.0.0",
      "source": "./plugins/docs-agent",
      "description": "Documentation generation using Diataxis framework",
      "category": "documentation",
      "tags": ["docs", "changelog", "diataxis", "tutorials"]
    },
    {
      "name": "ws-commit-commands",
      "version": "1.0.0",
      "source": "./plugins/ws-commit-commands",
      "description": "Git workflows for Gitea using tea CLI",
      "category": "git",
      "tags": ["git", "commits", "pull-requests", "gitea"]
    }
  ]
}
```

## Conventions

### name

- Use lowercase with hyphens: `my-plugin`
- Must be unique within the marketplace
- Becomes part of install reference: `my-plugin@ws-marketplace`

### version

- Follow semantic versioning: `MAJOR.MINOR.PATCH`
- Increment MAJOR for breaking changes
- Increment MINOR for new features
- Increment PATCH for bug fixes

### source

- Relative path from marketplace root
- Usually `./plugins/plugin-name`
- Must point to directory containing `.claude-plugin/plugin.json`

### category

Common categories:
- `documentation` - Doc generation, changelogs
- `git` - Version control workflows
- `development` - Dev tools, linting, testing
- `utilities` - General-purpose tools

### tags

- Lowercase keywords
- Used for search and discovery
- Include relevant technologies, use cases

## Validation

To validate your marketplace.json:

```bash
# Check JSON syntax
cat .claude-plugin/marketplace.json | python -m json.tool

# Verify plugin sources exist
for source in $(cat .claude-plugin/marketplace.json | jq -r '.plugins[].source'); do
  if [ ! -d "$source" ]; then
    echo "Missing: $source"
  fi
done
```

## Adding a Plugin

1. Create the plugin in `plugins/your-plugin/`
2. Add entry to the `plugins` array:
   ```json
   {
     "name": "your-plugin",
     "version": "1.0.0",
     "source": "./plugins/your-plugin",
     "description": "What your plugin does",
     "category": "appropriate-category",
     "tags": ["relevant", "tags"]
   }
   ```
3. Commit and push changes
4. Users can install with:
   ```bash
   claude plugin marketplace update ws-marketplace
   claude plugin install your-plugin@ws-marketplace
   ```
