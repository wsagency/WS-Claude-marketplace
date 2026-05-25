---
allowed-tools: Bash, Read
description: git pull across all registered sub-repos
---

## Context

- Hub directory: !`pwd`
- project.yaml: !`cat ./project.yaml 2>/dev/null || echo "(missing — run /hub-init first)"`

## Your task

1. Verify `project.yaml` exists in the current directory. If not, abort and tell the user this command must be run from a hub repo.

2. Parse the list of repos from `project.yaml` (read the file directly).

3. For each repo, in parallel where possible:
   - Resolve absolute path relative to the hub
   - If path doesn't exist: report `skipped (no local checkout)` and continue
   - If path exists but isn't a git repo: report `skipped (not a git repo)`
   - Otherwise: run `git -C <path> pull --ff-only` and capture output
   - Tag each result with the repo name

4. Print a compact summary table:
   ```
   acme-app         ✓ Already up to date
   acme-marketing   ✓ Fast-forwarded 3 commits
   acme-design      ⊘ skipped (no local checkout)
   acme-docs        ✗ failed: <error>
   ```

Do not push, do not merge non-fast-forward, do not touch uncommitted changes. If `pull --ff-only` fails because of local changes or divergence, report it but don't try to resolve.
