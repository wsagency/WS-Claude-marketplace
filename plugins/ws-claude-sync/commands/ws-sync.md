---
allowed-tools: Bash(python3:*), Bash(git:*)
description: Bidirectional essential sync (pull then push)
---

## Prerequisites

Check that sync is configured:
```bash
test -f ~/.claude-sync/config.json || echo "NOT_CONFIGURED"
```
If not configured, tell the user to run `/ws-sync-setup` first.

## Your task

Perform a bidirectional sync of essential Claude context — pull remote changes first, then push local changes.

```bash
python3 "SCRIPT_DIR/claude-sync-extended.py" sync --level essential
```

Replace SCRIPT_DIR with the absolute path to this plugin's `scripts/` directory.

Report what was synced and any warnings.
