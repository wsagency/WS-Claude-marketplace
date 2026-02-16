---
allowed-tools: Bash(python3:*), Read
description: Show sync configuration and status
---

## Your task

Show the current Claude sync configuration and status.

1. Check if sync is configured:
   ```bash
   test -f ~/.claude-sync/config.json && echo "CONFIGURED" || echo "NOT_CONFIGURED"
   ```

2. If configured, show status:
   ```bash
   python3 "SCRIPT_DIR/claude-sync-extended.py" status
   ```

3. Also read the config file for additional details:
   ```bash
   cat ~/.claude-sync/config.json
   ```

Replace SCRIPT_DIR with the absolute path to this plugin's `scripts/` directory.

Present the status in a clear, readable format. If not configured, tell the user to run `/ws-sync-setup`.
