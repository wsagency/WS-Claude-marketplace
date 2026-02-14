---
allowed-tools: Bash(python3:*), Bash(git:*)
description: Push ALL Claude data to remote (full sync)
---

## Prerequisites

Check that sync is configured:
```bash
test -f ~/.claude-sync/config.json || echo "NOT_CONFIGURED"
```
If not configured, tell the user to run `/ws-sync-setup` first.

## Your task

Push ALL Claude data to the remote repository, including shell snapshots and slash commands.

```bash
python3 "SCRIPT_DIR/claude-sync-extended.py" push --level full
```

Replace SCRIPT_DIR with the absolute path to this plugin's `scripts/` directory.

Report what was pushed and any warnings. Note that full sync includes more data than essential sync.
