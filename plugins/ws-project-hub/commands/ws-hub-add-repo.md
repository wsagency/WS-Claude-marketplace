---
allowed-tools: Bash, Read, Edit, Write, AskUserQuestion
description: Register a sub-repo in the current hub (clone, adopt nested, or register as sibling); --scan discovers unregistered repos first
argument-hint: [--scan]
---

## OpenWiki pointer (when the hub has one)

If `<hub>/openwiki/` exists, every newly registered sub-repo's `AGENTS.md` gets
the "Hub knowledge wiki" pointer section (same text `/ws-hub-init` step 5a
writes — pointing at `../openwiki/quickstart.md`, path adjusted for sibling
repos; create AGENTS.md + a thin CLAUDE.md if the repo has neither), AND the
repo is added to the coverage-scope list in `openwiki/INSTRUCTIONS.md`. Apply
this in the registration flow below after the repo lands in `project.yaml`.

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
   - **Mark existing as docs repo**: retro-mark an ALREADY-registered repo as the product docs repo — see "Retro-mark mode" below (skips the registration flow)

3. Run the **registration flow** below for the chosen repo (except retro-mark, which has its own steps).

### Retro-mark mode: mark an already-registered repo as `role: docs`

1. List the repos already registered in `project.yaml` and let the user pick one.
2. Max-one check: if another entry already carries `role: docs`, refuse with a message naming it (max one per hub — see the project-hub-conventions skill).
3. Add `role: docs` to the chosen entry via `Edit` (preserve formatting), then regenerate the `AGENTS.md` marker region as in registration step 4.
4. No clone, move, or `.gitignore` change — the repo is already registered. Then run "Finish" below.

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
   - Ask about the repo's role: **none** (development repo — default), **docs**
     (product docs repo — max one per hub; before writing check project.yaml and
     refuse naming the existing one if taken), or **explained** (generated
     visual product explainer — an OUTPUT repo). Output-role repos
     (docs/explained) are excluded from the OpenWiki coverage scope — when the
     hub has `openwiki/`, update `openwiki/INSTRUCTIONS.md` accordingly (add
     development repos to the scope; never add output repos).

2. Append the entry to `project.yaml` under `repos:` using `Edit` (preserve formatting and comments).

3. Update the `.gitignore` managed block as defined in the project-hub-conventions skill: nested (`./`) paths are inserted between the block markers (if the block doesn't exist, create it at the top of `.gitignore`, preserving all other rules); sibling (`../`) paths are not added.

4. Regenerate the `AGENTS.md` region between `<!-- ws-hub:repos:start -->` and `<!-- ws-hub:repos:end -->` from `project.yaml` (see the marker-pair definition in the project-hub-conventions skill).

### Finish (both modes)

- Run `git status` from the hub to confirm no new sub-repo shows up as untracked. If any does, report which file isn't filtered correctly.
- Confirm by listing all registered repos and their paths.

### Safety rules

- Do not modify sub-repo contents; only `mv` a repo's containing folder when the user chose "move", confirmed first.
- Only `project.yaml`, `AGENTS.md`, and `.gitignore` in the hub may be modified (the thin `CLAUDE.md` import is created by `/ws-hub-init` and never touched here).
- Do not commit hub changes — let the user review and commit themselves.
