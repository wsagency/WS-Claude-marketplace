---
allowed-tools: Bash(clamp:*), Bash(*/clamp:*)
description: Pack or unpack Claude project archives
---

## Your task

Create or restore portable Claude project archives (.claudepack format).

Determine the clamp script path. Try the system `clamp` first, fall back to the bundled script in this plugin's `scripts/clamp` directory.

### Operations

**Pack a project into an archive:**
```bash
clamp --pack <project-path> [archive-path]
```
If no archive path is given, creates `<project-name>.claudepack` in the current directory.

**Unpack an archive to a destination:**
```bash
clamp --unpack <archive-path> <destination>
```

### Archive Format (.claudepack)

A tar.gz archive containing:
- `manifest.json` — Metadata (version, original path, timestamp)
- `project/` — Project files including `.claude/` settings
- `sessions/` — Session JSONL files
- `history-entries.jsonl` — Relevant history entries

When unpacking, paths are automatically rewritten to match the new destination.

### Steps

1. For pack: verify the project exists and show what will be archived
2. For unpack: show the manifest info before unpacking
3. Execute the operation
4. Report results
