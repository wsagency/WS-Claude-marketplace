---
allowed-tools: Bash(clamp:*), Bash(*/clamp:*)
description: Verify, fix, or prune Claude project references
---

## Your task

Perform maintenance operations on Claude Code project references.

Determine the clamp script path. Try the system `clamp` first, fall back to the bundled script in this plugin's `scripts/clamp` directory.

### Operations

**Verify all project references (health check):**
```bash
clamp --verify
```

**Fix broken references after a manual move:**
```bash
# Auto-detect broken references
clamp --fix

# Fix a specific project (auto-detect old path)
clamp --fix <new-project-path>

# Explicit: specify both old and new paths
clamp --fix --from <old-path> --to <new-path>
```

**Prune orphaned session folders:**
```bash
# Always dry-run first
clamp --prune --dry-run

# Execute prune
clamp --prune
```

### Steps

1. **Always dry-run first** for `--fix` and `--prune`:
   ```bash
   clamp <operation> --dry-run
   ```

2. Show the user what will happen.

3. Execute after confirmation.

### Common Scenarios
- After `mv`-ing a project manually, use `--fix` to repair references
- Use `--verify` to check if all projects are healthy
- Use `--prune` to clean up orphaned session data after project deletion
