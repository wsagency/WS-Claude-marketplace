---
allowed-tools: Bash, Read, Edit, AskUserQuestion
description: Find git repos in/near the hub that aren't yet registered in project.yaml
---

## Context

- Hub directory: !`pwd`
- project.yaml: !`cat ./project.yaml 2>/dev/null || echo "(missing — run /hub-init first)"`
- Nested .git directories: !`for d in */; do [ -d "$d/.git" ] && echo "./$d"; done 2>/dev/null | sed 's|/$||'`
- Sibling .git directories: !`for d in ../*/; do [ -d "$d/.git" ] && echo "../$d"; done 2>/dev/null | sed 's|/$||'`

## Your task

1. Verify we're in a hub. If not, abort.

2. Parse `project.yaml` to get registered `path` values. Normalize by stripping `./` and `../` prefixes for comparison against detected basenames.

3. Compare against detected `.git` directories (both nested and sibling). For each **unregistered** repo:
   - Print its location (nested or sibling), basename, `git remote.origin.url` if any, and first README heading as a hint
   - Mark nested ones with `[nested]` and siblings with `[sibling — consider moving in]`

4. If unregistered repos exist, ask the user (AskUserQuestion, multi-select) which to register now.

5. For each selected repo, run the same flow as `/hub-add-repo`:
   - Nested → register at `./<name>` + update `.gitignore` managed block
   - Sibling → ask whether to move into hub or register in place

6. After registration, regenerate the `CLAUDE.md` region between `<!-- ws-hub:repos:start -->` and `<!-- ws-hub:repos:end -->` (see the marker-pair definition in the project-hub-conventions skill).

7. Verify with `git status` that no unregistered nested repos pollute the hub's working tree.

8. If no unregistered repos found, report: `Hub is in sync — all nearby git repos are registered.`

Read-only with respect to sub-repo contents; only `project.yaml`, `CLAUDE.md`, and `.gitignore` in the hub may be modified.
