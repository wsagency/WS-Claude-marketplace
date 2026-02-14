---
allowed-tools: Bash(clamp:*), Bash(*/clamp:*)
description: List Claude projects or show project details
---

## Your task

Inspect Claude Code projects — list all projects or show detailed info about a specific project.

Determine the clamp script path. Try the system `clamp` first, fall back to the bundled script in this plugin's `scripts/clamp` directory.

### Operations

**List all projects:**
```bash
clamp --list
```

**List in JSON format (for programmatic use):**
```bash
clamp --list --json
```

**Show detailed info about a specific project:**
```bash
clamp --info <project-path>
```

### Interpreting Output

- Projects marked as "OK" have valid references
- Projects marked as "BROKEN" have missing files or mismatched references
- Suggest `/clamp-maintain` for broken projects

Present the output in a clear, readable format.
