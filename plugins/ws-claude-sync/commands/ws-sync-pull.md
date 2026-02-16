---
allowed-tools: Bash(python3:*), Bash(git:*)
description: Pull essential Claude context from remote
---

## Prerequisites

Check that sync is configured:
```bash
test -f ~/.claude-sync/config.json || echo "NOT_CONFIGURED"
```
If not configured, tell the user to run `/ws-sync-setup` first.

## Your task

Pull essential Claude context (config, settings, CLAUDE.md, session data, todos) from the remote GitHub repository.

```bash
python3 "SCRIPT_DIR/claude-sync-extended.py" pull --level essential
```

Replace SCRIPT_DIR with the absolute path to this plugin's `scripts/` directory.

Report what was pulled and any warnings.
