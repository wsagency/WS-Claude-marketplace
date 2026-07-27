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
| `version` | string | Yes | The marketplace release version — identical for every entry (lockstep) |
| `source` | string | Yes | Path to plugin directory relative to marketplace root |
| `description` | string | No | Brief description of the plugin (kept in sync with `plugin.json`) |
| `category` | string | No | Plugin category for organization |
| `tags` | array | No | Keywords for discovery |

**marketplace.json is the single version authority.** Per [ADR 0002](../decisions/0002-lockstep-marketplace-versioning.md), plugins do not carry a version in `plugin.json`; every `version` here equals the marketplace release version, and all entries are set together when a release is cut.

## Example

The `version` value below is illustrative — in the real file it always equals the current lockstep release version:

```json
{
  "plugins": [
    {
      "name": "ws",
      "version": "4.0.0",
      "source": "./plugins/ws",
      "description": "The WS Agency engineering suite in one plugin: ws-matt graph-engineered skills, Jira-aware git flows via jira-cli, dual-track docs with /ws-docs, and multi-repo project hubs via /ws-hub",
      "category": "development",
      "tags": ["documentation", "changelog", "git", "jira", "tdd", "multi-repo"]
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

- Semantic versioning (`MAJOR.MINOR.PATCH`), applied **lockstep across the whole marketplace**
- Every entry carries the same value — the marketplace release version
- Versions change only when a release is cut (all entries set to the new `X.Y.Z` together, tagged `vX.Y.Z`)
- Never bump a single plugin's version on its own

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
2. Add entry to the `plugins` array, using the **current** marketplace release version (copy it from the existing entries — lockstep, not a fresh `1.0.0`):
   ```json
   {
     "name": "your-plugin",
     "version": "<current release version>",
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
