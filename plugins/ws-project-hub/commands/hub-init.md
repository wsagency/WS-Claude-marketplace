---
allowed-tools: Bash, Read, Write, Edit, Glob, AskUserQuestion
description: Initialize a new project hub repo with subfolder layout, .gitignore management, and vendored conventions
---

## Context

- Current directory: !`pwd`
- Sibling directories with `.git` (potential sub-repos): !`for d in */; do [ -d "$d/.git" ] && echo "$d"; done 2>/dev/null | sed 's|/$||' && echo '---' && for d in ../*/; do [ -d "$d/.git" ] && echo "$d"; done 2>/dev/null | sed 's|^\.\./||;s|/$||'`
- Plugin templates: `${CLAUDE_PLUGIN_ROOT}/templates/`
- Plugin skill: `${CLAUDE_PLUGIN_ROOT}/skills/project-hub-conventions/SKILL.md`

## Your task

Initialize a new project hub. Sub-repos live as **subfolders of the hub**, each with its own git, kept out of the hub's git via a managed `.gitignore` block.

### 1. Gather project info via AskUserQuestion

- Project name (kebab-case, e.g. `acme`) — hub folder will be `<name>-main`
- One-line description
- Location: current dir or a custom parent path
- Show detected git repos (both subdirs of CWD and siblings); ask the user which to register initially (multi-select)

### 2. Create hub skeleton

Inside `<name>-main/`:

- `.claude/skills/project-hub-conventions/SKILL.md` — copy from `${CLAUDE_PLUGIN_ROOT}/skills/project-hub-conventions/SKILL.md` (vendored so the hub works without the marketplace plugin)
- `project.yaml` — from `${CLAUDE_PLUGIN_ROOT}/templates/project.yaml.tmpl` with substitutions
- `invoke-ai.sh` — copy from template, `chmod +x`
- `CLAUDE.md` — from template with `__REPO_SECTIONS__` filled in
- `README.md` — from template
- `.gitignore` — create with the managed block (see step 4)

Do NOT create a `docs/` subdirectory — docs is its own repo registered like any other.

### 3. Handle each selected sub-repo (ask per-repo)

For every repo the user selected, ask via AskUserQuestion what to do:

- **Move into hub**: `mv <source-path> ./<name>` then register with `path: ./<name>`. Use for sibling repos the user wants under the hub now.
- **Register in place** (as sibling): keep at original path, register with `path: ../<name>` (or whatever the relative path is). Use when the repo can't be moved (in use, etc.).
- **Clone fresh into hub**: ask for git URL, `git clone <url> ./<name>`, register with `path: ./<name>`. Use for repos not yet on disk.
- **Skip**: don't register now.

For each registered repo, gather:
- `name`: directory basename
- `path`: relative path from hub (`./<name>` for nested, `../<name>` for sibling)
- `url`: `git -C <path> config --get remote.origin.url` if available
- `description`: prompt user; default `"TODO: describe this repo"`
- `tech`: best-effort from manifest files (package.json → node, pubspec.yaml → flutter, requirements.txt → python, Cargo.toml → rust, go.mod → go)

Append each as a `- name: …` block to `project.yaml`.

### 4. `.gitignore` managed block

For repos with paths starting with `./` (nested), add them to the hub's `.gitignore` between markers:

```
# === ws-project-hub: sub-repos (auto-managed, do not edit) ===
/acme-app/
/acme-marketing/
# === /ws-project-hub ===
```

Sibling-registered repos (`../`) don't go in `.gitignore` — they're not in the hub anyway.

Also add a standard prelude (above the marker block):
```
.DS_Store
.cache/
```

### 5. Initialize hub git

```bash
cd <hub-dir>
git init -q
git add .gitignore .claude README.md CLAUDE.md project.yaml invoke-ai.sh
git commit -q -m "chore: initialize <project> hub"
```

Verify with `git status` that no sub-repo content shows up as untracked (the .gitignore should be filtering them out).

### 6. Generate `CLAUDE.md` repo sections

Replace `__REPO_SECTIONS__` with one block per registered repo:

```markdown
### <name>

<description>

- path: `<path>`
- tech: <tech>
- url: <url if present>
```

### 7. Report back

- Path to created hub
- Each registered repo: name, where it ended up (nested/sibling/cloned)
- Next steps:
  - `cd <hub> && ./invoke-ai.sh` to launch
  - `/hub-clone-all` if any registered repos aren't on disk
  - `/hub-add-repo` to register more
  - Each sub-repo can have its own `CLAUDE.md` for repo-specific rules (auto-loaded when mounted via `--add-dir`)

### Constraints

- Do NOT modify the contents of any sub-repo (besides moving its containing folder if user chose "move").
- Do NOT push to any remote.
- Do NOT clone repos the user didn't ask to clone.
- Confirm before `mv` — moves are observable side effects.
