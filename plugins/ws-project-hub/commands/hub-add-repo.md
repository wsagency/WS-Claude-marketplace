---
allowed-tools: Bash, Read, Edit, Write, AskUserQuestion
description: Register a new sub-repo in the current hub (clone, adopt nested, or register as sibling)
---

## Context

- Hub directory: !`pwd`
- project.yaml exists: !`[ -f ./project.yaml ] && echo yes || echo no`
- Nested .git directories: !`for d in */; do [ -d "$d/.git" ] && echo "$d"; done 2>/dev/null | sed 's|/$||'`
- Sibling .git directories: !`for d in ../*/; do [ -d "$d/.git" ] && echo "$d"; done 2>/dev/null | sed 's|^\.\./||;s|/$||'`

## Your task

1. Verify we're in a hub (`project.yaml` exists). If not, abort with hint to run `/hub-init`.

2. Ask the user (AskUserQuestion) how to add the new repo:
   - **Clone from URL**: prompt for git URL, clone into `./<name>` subfolder
   - **Adopt nested**: pick from detected nested .git directories (already in the hub)
   - **Register sibling**: pick from detected sibling .git directories — register at `../<name>` without moving
   - **Move sibling in**: pick a sibling, `mv ../<name> ./<name>`, register at `./<name>` (confirm before move)

3. For the chosen repo, gather:
   - `name`: directory basename
   - `path`: relative to hub
   - `url`: `git -C <path> config --get remote.origin.url`
   - `description`: prompt user
   - `tech`: best-effort from manifest files

4. Append the entry to `project.yaml` under `repos:` using `Edit` (preserve formatting and comments).

5. **Update `.gitignore` managed block**: if the new path starts with `./` (nested), insert the path into the block bounded by:
   ```
   # === ws-project-hub: sub-repos (auto-managed, do not edit) ===
   ...
   # === /ws-project-hub ===
   ```
   If the block doesn't exist, create it at the top of `.gitignore` (preserve all other rules). If the path is sibling (`../`), no .gitignore update needed.

6. Regenerate the `CLAUDE.md` region between `<!-- ws-hub:repos:start -->` and `<!-- ws-hub:repos:end -->` to include the new repo (see the marker-pair definition in the project-hub-conventions skill).

7. Run `git status` from the hub to confirm the new sub-repo doesn't show up as untracked. If it does, report which file isn't filtered correctly.

8. Confirm by listing all registered repos and their paths.

Do not modify the sub-repo. Do not commit hub changes — let the user review and commit themselves.
