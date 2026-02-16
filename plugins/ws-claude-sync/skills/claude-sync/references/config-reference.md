# Config Reference

## ~/.claude-sync/config.json

```json
{
  "sync_method": "git",
  "git_repo": "git@github.com:user/claude-sync-data.git",
  "machine_id": "a1b2c3d4",
  "sync_level": "essential",
  "exclude_patterns": ["*.log", "*.tmp", "cache/*"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sync_method` | string | Sync backend (currently only `"git"`) |
| `git_repo` | string | Git repository URL for sync storage |
| `machine_id` | string | Auto-generated 8-char hex identifier for this machine |
| `sync_level` | string | Default sync level: `"essential"` or `"full"` |
| `exclude_patterns` | array | Glob patterns to exclude from sync |

## Sync Levels

### Essential
- `~/.claude.json` — Claude configuration
- `~/.claude/settings.local.json` — Local settings
- `CLAUDE.md` — Project context (current directory)
- `~/.claude/projects/` — Session data
- `~/.claude/todos/` — Todo items

### Full (Essential + Optional)
- `~/.claude/shell-snapshots/` — Shell environment snapshots
- `~/.claude-code/slash-commands/` — Custom slash commands
