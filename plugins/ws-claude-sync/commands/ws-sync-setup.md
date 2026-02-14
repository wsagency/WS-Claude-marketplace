---
allowed-tools: Bash(python3:*), Read, Write
description: Configure Claude sync with a GitHub repository
---

## Your task

Set up Claude sync by configuring a GitHub repository for cross-machine synchronization.

The user should provide a GitHub repository URL. If they haven't, ask for one.

### Steps

1. Check if sync is already configured:
   ```bash
   cat ~/.claude-sync/config.json 2>/dev/null
   ```

2. Run the setup command with the provided repo URL:
   ```bash
   python3 "SCRIPT_DIR/claude-sync-extended.py" setup --git-repo "<REPO_URL>" --level essential
   ```
   Replace SCRIPT_DIR with the absolute path to this plugin's `scripts/` directory, which you can determine from this file's location.

3. Verify the configuration was saved:
   ```bash
   cat ~/.claude-sync/config.json
   ```

4. Report the configuration to the user, including their machine ID.

**Important**: Replace SCRIPT_DIR above with the actual resolved path. The script is located at the same level as this commands directory, under `scripts/claude-sync-extended.py`.
