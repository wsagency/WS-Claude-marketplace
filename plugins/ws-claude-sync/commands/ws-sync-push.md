---
allowed-tools: Bash(python3:*), Bash(git:*)
description: Push essential Claude context to remote
---

## Prerequisites

Check that sync is configured:
```bash
test -f ~/.claude-sync/config.json || echo "NOT_CONFIGURED"
```
If not configured, tell the user to run `/ws-sync-setup` first.

## Your task

Push essential Claude context (config, settings, CLAUDE.md, session data, todos) to the remote GitHub repository.

```bash
python3 "SCRIPT_DIR/claude-sync-extended.py" push --level essential
```

Replace SCRIPT_DIR with the absolute path to this plugin's `scripts/` directory.

Report what was pushed and any warnings.
