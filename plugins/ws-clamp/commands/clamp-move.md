---
allowed-tools: Bash(clamp:*), Bash(*/clamp:*)
description: Move, relocate, or remove a Claude Code project
---

## Your task

Move, relocate, or remove a Claude Code project while preserving all session history.

The user should describe what they want to do. Interpret their intent and map to the right clamp operation:

- **Move project**: `clamp <source> <destination>`
- **Move here**: `clamp --here <source>` (move into current directory)
- **Remove project**: `clamp --remove <project-path>`

### Steps

1. Determine the clamp script path. Try the system `clamp` first, fall back to the bundled script in this plugin's `scripts/clamp` directory.

2. **Always dry-run first** for any mutative operation:
   ```bash
   clamp <args> --dry-run
   ```

3. Show the user what will happen based on the dry-run output.

4. If the user confirms (or the dry-run looks safe), execute the actual operation:
   ```bash
   clamp <args>
   ```

5. Report the results.

### Options
- `-p` / `--parents`: Create parent directories as needed
- `-f` / `--force`: Skip confirmation prompt
- `-v` / `--verbose`: Detailed output
- `--no-backup`: Skip backup of history.jsonl (not recommended)

### Notes
- clamp has built-in rollback if any step fails
- Always recommend `--dry-run` first for safety
- The `--remove` operation is destructive — always confirm with the user
