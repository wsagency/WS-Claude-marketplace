---
description: Knowledge about Claude Code's project data model, storage locations, and path encoding
triggers:
  - project
  - session
  - history
  - claude data
  - project move
  - clamp
  - claudepack
---

# Claude Project Data Model

This skill provides knowledge about how Claude Code stores project data, session history, and settings.

## Overview

Claude Code maintains project data in three interconnected locations:

| Location | Purpose | Format |
|----------|---------|--------|
| Project directory | Your code + `.claude/` settings | Directory with config files |
| `~/.claude/projects/[encoded-path]/` | Session history per project | JSONL session files |
| `~/.claude/history.jsonl` | Global project index | Line-delimited JSON |

## Data Stores

When you work with Claude Code in a project, it creates and maintains data across these locations. Moving a project with `mv` breaks the references because the encoded path changes.

## Path Encoding

Claude encodes project paths by replacing `/` with `-` for the folder name in `~/.claude/projects/`. For example:
- `/Users/john/projects/my-app` → `~/.claude/projects/-Users-john-projects-my-app/`

## The clamp Tool

The `clamp` utility handles all three locations atomically when moving projects, with rollback on failure.

## References

- See `references/data-stores.md` for detailed data store documentation
- See `references/encoded-paths.md` for path encoding details
- See `examples/common-workflows.md` for usage patterns
