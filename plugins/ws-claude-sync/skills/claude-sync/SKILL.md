---
description: Knowledge about Claude Code sync architecture and cross-machine context sharing
triggers:
  - sync
  - cross-machine
  - claude-sync
  - context sharing
  - settings sync
---

# Claude Sync

This skill provides knowledge about syncing Claude Code contexts, settings, and sessions across machines using Git.

## Overview

Claude Sync enables cross-machine synchronization of Claude Code data via a private GitHub repository. It supports two sync levels:

| Level | What's Synced | Use Case |
|-------|--------------|----------|
| **Essential** | Config, settings, CLAUDE.md, sessions, todos | Daily sync between machines |
| **Full** | Essential + shell snapshots, slash commands | Complete environment replication |

## Architecture

The sync system uses a staging-based approach:
1. **Prepare**: Copy local Claude data to a staging area tagged with machine ID
2. **Push**: Commit staged data to Git repository
3. **Pull**: Fetch remote data and merge into local Claude directories
4. **Merge**: Intelligently merge configs (preserving local auth), append sessions, update files

## Key Paths

| Item | Path | Description |
|------|------|-------------|
| Config | `~/.claude-sync/config.json` | Sync configuration |
| Staging | `~/.claude-sync/data/staging/` | Prepared data for sync |
| Repo | `~/.claude-sync/data/repo/` | Cloned Git repository |
| Claude config | `~/.claude.json` | Main Claude configuration |
| Settings | `~/.claude/settings.local.json` | Local settings |
| Sessions | `~/.claude/projects/` | Project session data |
| Todos | `~/.claude/todos/` | Todo items |

## Merge Strategy

- **Claude config** (`~/.claude.json`): Merge projects/MCP servers, preserve local `userID` and `oauthAccount`
- **CLAUDE.md**: Append unique sections from remote
- **Session data**: Append mode (never overwrite existing sessions)
- **Other files**: Update if remote is newer, backup existing

## References

- See `references/config-reference.md` for config file format
- See `references/sync-architecture.md` for detailed architecture
- See `examples/common-workflows.md` for usage patterns
