# Sync Architecture

## Data Flow

```
Machine A                    GitHub Repo                   Machine B
─────────                    ───────────                   ─────────
Local Claude data   ──push──>  a1b2c3d4/   <──pull──   Local Claude data
                               metadata.json
                               claude_config
                               session_data/
                               ...
                             c5d6e7f8/     <──push──   Local Claude data
Local Claude data   ──pull──>  metadata.json
                               claude_config
                               session_data/
                               ...
```

## Push Operation
1. Create staging directory: `~/.claude-sync/data/staging/<machine_id>/`
2. Copy sync items to staging (based on sync level)
3. Write `metadata.json` with timestamp, hostname, synced items list
4. Copy staging to Git repo under `<machine_id>/` directory
5. `git add . && git commit && git push`

## Pull Operation
1. `git pull --rebase` to get latest changes
2. Scan repo for machine directories (skip own machine_id)
3. For each remote machine's data:
   - Read `metadata.json` for context
   - Restore each synced item using appropriate merge strategy

## Merge Strategies

### Claude Config Merge
- Preserves local `userID` and `oauthAccount` (machine-specific auth)
- Merges `projects` map (adds missing projects, merges MCP servers)
- Updates other settings from remote

### Session Data Merge
- Append mode: copies files that don't exist locally
- Never overwrites existing session files

### File Merge
- Backs up existing file (`.bak` suffix)
- Copies remote file to local path

### Directory Merge
- Update mode: copies newer files, adds missing files
- Never deletes local files
