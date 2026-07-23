---
allowed-tools: Bash, Read, Edit, Write, AskUserQuestion
description: Register a sub-repo in the current hub (clone, adopt nested, or register as sibling); --scan discovers unregistered repos first
argument-hint: [--scan]
---

## Context

- Hub directory: !`pwd`
- Arguments: `$ARGUMENTS`
- project.yaml: !`cat ./project.yaml 2>/dev/null || echo "(missing — run /ws-hub-init first)"`
- Nested .git directories: !`for d in */; do [ -d "$d/.git" ] && echo "./$d"; done 2>/dev/null | sed 's|/$||'`
- Sibling .git directories: !`for d in ../*/; do [ -d "$d/.git" ] && echo "../$d"; done 2>/dev/null | sed 's|/$||'`

> If any Context value above still shows an unexpanded shell command (an exclamation mark followed by a backtick-quoted command), your runtime does not pre-execute context commands — run each one via bash now, before proceeding.

## Your task

Register one or more sub-repos in the current hub. Without arguments, register a single repo the user points at. With `--scan`, discover unregistered repos first, then feed each selection through the same registration flow below.

1. Verify we're in a hub (`project.yaml` exists). If not, abort with hint to run `/ws-hub-init`.

### Without `--scan`: pick one repo

2. Ask the user via AskUserQuestion (or a plain chat question when that tool is unavailable) how to add the new repo:
   - **Clone from URL**: prompt for git URL, clone into `./<name>` subfolder
   - **Adopt nested**: pick from detected nested .git directories (already in the hub)
   - **Register sibling**: pick from detected sibling .git directories — register at `../<name>` without moving
   - **Move sibling in**: pick a sibling, `mv ../<name> ./<name>`, register at `./<name>` (confirm before move)

3. Run the **registration flow** below for the chosen repo.

### With `--scan`: discover, then register

2. Parse `project.yaml` to get registered `path` values. Normalize by stripping `./` and `../` prefixes for comparison against detected basenames.

3. Compare against detected `.git` directories (both nested and sibling). For each **unregistered** repo:
   - Print its location (nested or sibling), basename, `git remote.origin.url` if any, and first README heading as a hint
   - Mark nested ones with `[nested]` and siblings with `[sibling — consider moving in]`

4. If no unregistered repos exist, report: `Hub is in sync — all nearby git repos are registered.` and stop.

5. Ask the user (AskUserQuestion, multi-select) which to register now. Run the **registration flow** below for each selection:
   - Nested → register at `./<name>`
   - Sibling → ask whether to move into the hub (`mv`, confirm before move) or register in place at `../<name>`

### Registration flow (single definition — both modes use this)

For each repo to register:

1. Gather the `project.yaml` entry fields — `name`, `path`, `url` (`git -C <path> config --get remote.origin.url`), `description` (prompt user), `tech` — following the skill's "project.yaml schema" section and "Tech inference" table.
   - Ask whether this repo is the product docs repo (`role: docs`). Before
     writing, check project.yaml: if another repo already has `role: docs`,
     refuse with a message naming it (max one per hub — see the
     project-hub-conventions skill).

2. Append the entry to `project.yaml` under `repos:` using `Edit` (preserve formatting and comments).

3. Update the `.gitignore` managed block as defined in the project-hub-conventions skill: nested (`./`) paths are inserted between the block markers (if the block doesn't exist, create it at the top of `.gitignore`, preserving all other rules); sibling (`../`) paths are not added.

4. Regenerate the `AGENTS.md` region between `<!-- ws-hub:repos:start -->` and `<!-- ws-hub:repos:end -->` from `project.yaml` (see the marker-pair definition in the project-hub-conventions skill).

### Finish (both modes)

- Run `git status` from the hub to confirm no new sub-repo shows up as untracked. If any does, report which file isn't filtered correctly.
- Confirm by listing all registered repos and their paths.

### Safety rules

- Do not modify sub-repo contents; only `mv` a repo's containing folder when the user chose "move", confirmed first.
- Only `project.yaml`, `AGENTS.md`, `CLAUDE.md`, and `.gitignore` in the hub may be modified.
- Do not commit hub changes — let the user review and commit themselves.
