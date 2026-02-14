# Claude Code Path Encoding

## Encoding Rules

Claude Code encodes absolute project paths for use as directory names under `~/.claude/projects/`:

1. Take the absolute path of the project
2. Replace all `/` characters with `-`
3. Use the result as the directory name

### Examples

| Absolute Path | Encoded Name |
|--------------|--------------|
| `/Users/john/projects/my-app` | `-Users-john-projects-my-app` |
| `/home/dev/work/api-server` | `-home-dev-work-api-server` |
| `/Users/john/my project` | `-Users-john-my project` |

Note: Spaces and special characters (except `/`) are preserved as-is.

## Finding the Encoded Path

To find the encoded path for a project:

```bash
# Get the absolute path
PROJ_PATH=$(cd /path/to/project && pwd)

# Encode it (replace / with -)
ENCODED=$(echo "$PROJ_PATH" | sed 's|/|-|g')

# Check if session data exists
ls ~/.claude/projects/"$ENCODED"/
```

## Impact of Moving Projects

When a project at `/Users/john/old-location/app` is moved to `/Users/john/new-location/app`:

- **Old encoded path**: `-Users-john-old-location-app`
- **New encoded path**: `-Users-john-new-location-app`

The session folder must be renamed, and all references in `history.jsonl` must be updated. This is what `clamp` automates.
