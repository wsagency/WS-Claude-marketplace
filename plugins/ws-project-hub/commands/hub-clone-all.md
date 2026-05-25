---
allowed-tools: Bash, Read
description: Clone every registered sub-repo URL into a missing subfolder of the hub
---

## Context

- Hub directory: !`pwd`
- project.yaml: !`cat ./project.yaml 2>/dev/null || echo "(missing)"`

## Your task

1. Verify `project.yaml` exists. If not, abort with hint to run `/hub-init`.

2. Parse all registered repos. For each repo with a `url` field, check if its `path` (resolved relative to the hub) exists and is a git repo:
   - **Already exists**: skip, report `✓ already present`
   - **Missing**: `git clone <url> <path>` (one at a time — don't parallelize, to keep output legible and credentials prompts working)
   - **Missing but no URL in yaml**: report `⊘ no url registered — cannot clone`

3. For each clone attempt:
   - On success: report `✓ cloned <name>`
   - On failure (no access, bad URL, network): report `✗ <name>: <one-line error>` and continue with the next
   - Do NOT prompt for credentials beyond what git itself does; if git fails, fail this repo and move on

4. After all clones, run `git status` in the hub. Sub-repos registered with `./` paths should be filtered by `.gitignore`. If any show up as untracked, report which.

5. Summary table:
   ```
   acme-app          ✓ cloned
   acme-marketing    ✓ already present
   acme-design       ✗ Permission denied (likely no access)
   acme-docs         ⊘ no url registered
   ```

This command is the natural follow-up after cloning the hub on a new machine. Read-only with respect to the hub's git (creates folders but doesn't commit).
