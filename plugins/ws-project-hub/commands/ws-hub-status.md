---
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git branch:*), Bash(git rev-list:*), Read
description: Aggregated git status across all registered sub-repos
---

## Your task

Read-only status sweep across all sub-repos registered in the current hub.

1. Read `./project.yaml` with the Read tool. If it's missing, abort with a hint to run `/ws-hub-init` first.

2. Parse the list of repos.

3. For each accessible repo, gather:
   - Current branch (`git -C <path> branch --show-current`)
   - Ahead/behind upstream (`git -C <path> rev-list --left-right --count HEAD...@{u}` — handle no upstream gracefully)
   - Uncommitted changes (`git -C <path> status --porcelain` — count the lines yourself)
   - Last 5 commits (`git -C <path> log --oneline -5`)

4. Render a per-repo report:

   ```
   ── acme-app ──────────────────────────────
   branch: feature/login (↑2 ↓0)   uncommitted: 3 files
   recent:
     a1b2c3d feat: add OTP screen
     d4e5f6a fix: token refresh race
     ...

   ── acme-marketing ────────────────────────
   skipped (no local checkout)
   ```

5. End with a one-line summary: `N repos checked · M with changes · K skipped`.

6. Finish with the launch hint:

   ```
   To launch Claude with all sub-repos mounted:  cd <hub> && ./invoke-ai.sh
   ```

Read-only command. Do not run any pulls, fetches, or modifications.
