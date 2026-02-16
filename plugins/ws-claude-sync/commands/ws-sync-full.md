---
allowed-tools: Bash(python3:*), Bash(git:*)
description: Bidirectional full sync (all Claude data)
---

## Prerequisites

Check that sync is configured:
```bash
test -f ~/.claude-sync/config.json || echo "NOT_CONFIGURED"
```
If not configured, tell the user to run `/ws-sync-setup` first.

## Your task

Perform a bidirectional full sync of ALL Claude data — pull remote changes first, then push local changes. This includes shell snapshots and slash commands in addition to essential data.

```bash
python3 "SCRIPT_DIR/claude-sync-extended.py" sync --level full
```

Replace SCRIPT_DIR with the absolute path to this plugin's `scripts/` directory.

Report what was synced and any warnings.
