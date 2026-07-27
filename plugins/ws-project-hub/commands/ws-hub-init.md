---
allowed-tools: Bash, Read, Write, Edit, Glob, AskUserQuestion
description: Initialize a new project hub — or, inside an existing hub, run doctor (diagnose + repair)
---

## Context

- Current directory: !`pwd`
- Sibling directories with `.git` (potential sub-repos): !`for d in */; do [ -d "$d/.git" ] && echo "$d"; done 2>/dev/null | sed 's|/$||' && echo '---' && for d in ../*/; do [ -d "$d/.git" ] && echo "$d"; done 2>/dev/null | sed 's|^\.\./||;s|/$||'`
- Plugin templates: `${CLAUDE_PLUGIN_ROOT}/templates/`
- Plugin skill: `${CLAUDE_PLUGIN_ROOT}/skills/project-hub-conventions/SKILL.md`
  (if CLAUDE_PLUGIN_ROOT is unset — e.g. in omp — use the plugin's install directory: the plugin root containing this command file)

> If any Context value above still shows an unexpanded shell command (an exclamation mark followed by a backtick-quoted command), your runtime does not pre-execute context commands — run each one via bash now, before proceeding.

## Your task

Initialize a new project hub — or, when invoked inside an EXISTING hub, offer the doctor flow (step 0). Sub-repos live as **subfolders of the hub**, each with its own git, kept out of the hub's git via a managed `.gitignore` block.

This command is **harness-agnostic**: it behaves the same under any agent harness (Claude Code, omp, …) and never assumes which one is running. Where a step genuinely differs per harness, it is written as a "Harness notes" list with one bullet per harness — support a new harness by adding a bullet there (and an `agent_cmd_<name>()` entry in `invoke-ai.sh`), never by forking the flow.

Read the **project-hub-conventions** skill (path above) before you start — it is the single source for the `project.yaml` schema, path rules, the `.gitignore` managed block, the AGENTS.md `ws-hub:repos` marker pair, and the tech-inference table. This command defines only the interaction flow; follow the skill for every structural detail.

### 0. Existing hub? → offer doctor

If `./project.yaml` already exists (or the current `AGENTS.md` carries the `ws-hub:repos` markers), this is an already-initialized hub — do NOT re-scaffold anything. Ask (AskUserQuestion, or a plain chat question when that tool is unavailable): "This hub is already set up. What do you want?"

- **Doctor — diagnose + repair** (recommended) → run **Doctor mode** (section below) in fix posture.
- **Diagnose only** → Doctor mode in report posture: print findings, change nothing.
- **New hub elsewhere** → the invocation was intentional but for a different location; ask for the parent path and continue from step 1 there.
- **Nothing** → wrongly invoked; exit without changes.

When neither detection marker is present, skip this step silently and start at step 1.

### 1. Gather project info via AskUserQuestion (or a plain chat question when that tool is unavailable)

- Project name (kebab-case, e.g. `acme`) — hub folder will be `<name>-main`
- One-line description
- Location: current dir or a custom parent path
- Show detected git repos (both subdirs of CWD and siblings); ask the user which to register initially (multi-select)

### 2. Create hub skeleton

Inside `<name>-main/`:

- `.claude/skills/project-hub-conventions/SKILL.md` — copy from `${CLAUDE_PLUGIN_ROOT}/skills/project-hub-conventions/SKILL.md` (vendored so the hub works without the marketplace plugin)
- `project.yaml` — from `${CLAUDE_PLUGIN_ROOT}/templates/project.yaml.tmpl` with substitutions
- `invoke-ai.sh` — copy from template, `chmod +x`
- `AGENTS.md` — from `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md.tmpl` with placeholder substitutions (`__PROJECT_NAME__`, `__PROJECT_DESCRIPTION__`; `__REPO_SECTIONS__` is filled in step 6) — the canonical, agent-neutral project map
- `CLAUDE.md` — from `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md.tmpl` (thin `@AGENTS.md` import — never put content here)
- `README.md` — from `${CLAUDE_PLUGIN_ROOT}/templates/README.md.tmpl` with placeholder substitutions (`__PROJECT_NAME__`)
- `.gitignore` — standard prelude (`.DS_Store`, `.cache/`) followed by the managed block as defined in the skill's ".gitignore managed block" section

Do NOT create a `docs/` subdirectory — docs is its own repo registered like any other.

### 3. Handle each selected sub-repo (ask per-repo)

For every repo the user selected, ask via AskUserQuestion what to do:

- **Move into hub**: `mv <source-path> ./<name>` then register with `path: ./<name>`. Use for sibling repos the user wants under the hub now.
- **Register in place** (as sibling): keep at original path, register with `path: ../<name>` (or whatever the relative path is). Use when the repo can't be moved (in use, etc.).
- **Clone fresh into hub**: ask for git URL, `git clone <url> ./<name>`, register with `path: ./<name>`. Use for repos not yet on disk.
- **Skip**: don't register now.

Register each chosen repo in `project.yaml` following the skill's "project.yaml schema" section (fields, path rules) and its "Tech inference" table. Prompt the user for `description` (default `"TODO: describe this repo"`). Also ask whether the repo is the product docs repo (`role: docs`) — before writing `role: docs`, check `project.yaml`: if another repo already has `role: docs`, refuse with a message naming it (max one per hub — see the project-hub-conventions skill). If the user plans to create a fresh docs repo in step 4, they should answer No here. Add nested (`./`) repos to the `.gitignore` managed block per the skill; sibling (`../`) repos are not added.

### 4. Product docs repo

Skip this question if a repo registered in step 3 already carries `role: docs` (max one per hub) — just point at it in the report.

Ask (AskUserQuestion): "Create a product docs repo (`<project>-docs`)?"
- **Yes** → create the subfolder, `git init` it, scaffold the layout defined
  in the project-hub-conventions skill ("Product docs repo" section): README,
  AGENTS.md with the writing rules pointer (plus a thin CLAUDE.md containing
  only the `@AGENTS.md` import), docs/ tree with index.md and
  empty Diátaxis folders + assets/ + release-notes/, dev-docs/ tree
  (architecture.md placeholder, decisions/, client-materials/ with a
  `history.md` stub and the dated-folder convention note (see the skill's
  "Client materials" section), runbooks/).
  Register it in project.yaml with `role: docs` and add it to the .gitignore
  managed block. Do NOT create .outline-sync.json (created by the first
  /ws-docs publish).
- **No** → skip; note that `/ws-hub-add-repo` can later register a docs repo or retro-mark an already-registered repo as `role: docs`. Also prune or adapt the generated `AGENTS.md` "Documentation" section — the template presumes a `role: docs` repo exists, and it must not point at a repo that isn't there.

### 5. Knowledge & fleet tooling (optional)

**5a — OpenWiki (hub-level knowledge wiki).** Ask (AskUserQuestion): "Initialize OpenWiki at the hub level — one knowledge wiki covering ALL sub-repos?"

- **Yes** → verify `command -v openwiki` (missing → print `npm install -g openwiki` and let the user install first). Run `openwiki --init` at the hub root — it is interactive (provider/model onboarding); let the user drive it. It generates `openwiki/` and maintains its own `<!-- OPENWIKI:START/END -->` block in the hub's `AGENTS.md` AND `CLAUDE.md` — the CLAUDE.md block is a permitted tool-managed exception to the thin-import rule (see the skill's "Context-file cascade"). Then, immediately after init:
  1. **Write the coverage scope into `openwiki/INSTRUCTIONS.md`** (append a "Coverage scope" section): the wiki documents the product across ALL registered **development** sub-repos — enumerate from `project.yaml` every repo WITHOUT an output role (`role: docs` and `role: explained` repos are generated/authored OUTPUTS and are excluded) — each a SEPARATE git repository nested in this hub and invisible to the hub's git; always scan them all; the hub root itself is a thin meta repo. Without this, OpenWiki tends to document only the largest repo it finds.
  2. **Delete the generated CI workflow** (`.github/workflows/openwiki-update.yml`) if openwiki created one — the WS convention is AI-DRIVEN refresh (agents run a prompted refresh occasionally, before and/or after major work), not scheduled CI. Freshness is enforced softly: the plugin's Stop hook reminds when dev-docs changed since the last refresh (Claude Code), and when `.omp/` exists (or the user uses omp) copy `${CLAUDE_PLUGIN_ROOT}/rules/openwiki-freshness.md` into the hub's `.omp/rules/` (same fallback rule for the plugin root as above).

**omp preset (when the user uses omp):** write `.omp/config.yml` from `${CLAUDE_PLUGIN_ROOT}/templates/omp/config.yml.tmpl` (skip if one exists — never overwrite user config), copy `${CLAUDE_PLUGIN_ROOT}/templates/omp/hooks/openwiki-freshness.ts` into `.omp/hooks/post/` (native TS freshness hook — banner + exact update command on session settle), and copy the WS rules pack `${CLAUDE_PLUGIN_ROOT}/templates/omp/rules/*.md` into `.omp/rules/` (ws-guard-git, ws-commit-format, ws-generated-files — TTSR rules that interrupt the model's stream on dangerous git ops, non-conventional commits, and hand-edits of generated files). ASK the user (AskUserQuestion, defaults first): (1) approval posture — **yolo** (default, omp's own default) or `write` for cautious client repos; (2) bash guard patterns — **off** (default) or on; (3) whether to fill the per-project `modelRoles` block now (the template documents the WS class mapping and thinking-level suffixes — each project can run different providers). Uncomment/adjust the template blocks per their answers. Note: the TTSR `condition`/`scope` patterns may need tuning against their omp version — they are conventions-as-enforcement, verify once live.
  3. For EVERY registered sub-repo, append this pointer to the sub-repo's `AGENTS.md` (creating it, plus a thin `CLAUDE.md`, if missing; adjust the relative path for sibling repos):

  ```markdown
  ## Hub knowledge wiki

  The parent hub maintains an OpenWiki for the whole product at `../openwiki/`
  (entry point: `../openwiki/quickstart.md`). Consult it BEFORE exploring other
  sub-repos or answering cross-repo questions — it covers every repo in this hub.
  Refresh happens at hub level (see the hub's AGENTS.md; AI-driven, no CI).
  ```

  Keep the template's "Knowledge wiki (OpenWiki)" section in the hub AGENTS.md (it documents the prompted-refresh pattern — sub-repo commits are invisible to hub git, so refresh is always `openwiki --update "Refresh; re-scan sub-repos: <list>"`).
- **No** → prune the template's "Knowledge wiki (OpenWiki)" section from the hub AGENTS.md; the flow can be re-run later (documented in the skill — detection is simply the presence of `<hub>/openwiki/`).

**5b — herdr (agent fleet multiplexer).** Ask: "Set up herdr for this hub?"

- **Yes** → the recommended setup is one GLOBAL skill install per machine (covers every repo and every agent that reads `~/.claude/skills/` — Claude Code and omp): `npx skills add ogulcancelik/herdr --skill herdr -g`. Verify `command -v herdr`; if the binary is missing print the install options (`curl -fsSL https://herdr.dev/install.sh | sh`, or `brew install herdr`). Keep the template's "Herdr" section in the hub AGENTS.md (workspace-per-subrepo pattern).
- **No** → prune the template's "Herdr" section from the hub AGENTS.md.

### 6. Initialize hub git

```bash
cd <hub-dir>
git init -q
git add .gitignore .claude README.md AGENTS.md CLAUDE.md project.yaml invoke-ai.sh
git add openwiki .github 2>/dev/null || true   # present only if step 5a ran
git commit -q -m "chore: initialize <project> hub"
```

Verify with `git status` that no sub-repo content shows up as untracked (the .gitignore should be filtering them out).

### 7. Generate `AGENTS.md` repo sections

Fill the region between the `ws-hub:repos` markers (replacing the template's placeholder — see "Regenerated region (marker pair)" in the skill) with one block per registered repo:

```markdown
### <name>

<description>

- path: `<path>`
- tech: <tech>
- url: <url if present>
```

### 8. Report back

- Path to created hub
- Each registered repo: name, where it ended up (nested/sibling/cloned)
- OpenWiki / herdr status (initialized / skipped)
- Next steps:
  - `cd <hub> && ./invoke-ai.sh` to launch
  - `/ws-hub-repos clone` if any registered repos aren't on disk
  - `/ws-hub-add-repo` to register more
  - `/ws-hub-docs` to generate cross-repo docs (and refresh OpenWiki when initialized)
  - Each sub-repo should keep repo-specific rules in its own `AGENTS.md`, with a thin `CLAUDE.md` containing only `@AGENTS.md`. Harness notes:
    - Claude Code — auto-loads it when the repo is mounted via `--add-dir`
    - omp — does not auto-load sub-repo context; read it when entering the sub-repo

### Constraints

- Do NOT modify the contents of any sub-repo (besides moving its containing folder if user chose "move").
- Do NOT push to any remote.
- Do NOT clone repos the user didn't ask to clone.
- Confirm before `mv` — moves are observable side effects.

## Doctor mode (existing hub)

Entered only via step 0. Purpose: verify the hub is **ready for development** — everything pulled, registered, and up to date. Posture comes from step 0: **fix** (apply safe repairs, confirming each group before applying) or **report** (findings only, zero changes).

Hard limits in BOTH postures: never switch branches, never `reset`/`checkout` files, never force-push, never overwrite user-owned config (`project.yaml` values, `.omp/config.yml`). Anything in that category is a report-only finding, addressed to the user.

Run the checks in order:

1. **Hub repo freshness** — `git fetch` in the hub (skip gracefully when there is no remote). Clean and behind upstream → `git pull --ff-only`. Dirty, diverged, or on a non-default branch → report; touch nothing.
2. **Sub-repos on disk** — for every repo in `project.yaml`: folder missing but `url` present → offer to clone (same behavior as `/ws-hub-repos clone`); present → fetch, and when clean and behind, `git pull --ff-only`. Dirty, diverged, or detached → report with branch names; touch nothing.
3. **Registry integrity** — `project.yaml` parses; at most one `role: docs` and one `role: explained`; every nested (`./`) repo appears in the `.gitignore` managed block; the `ws-hub:repos` marker region in `AGENTS.md` matches `project.yaml` (drifted → regenerate the region, it is machine-managed); `CLAUDE.md` is the thin `@AGENTS.md` import (tool-managed marker blocks are the only permitted extras) — if fattened, move the content to `AGENTS.md`.
4. **Generated files up to date** — compare the hub's `invoke-ai.sh` against `${CLAUDE_PLUGIN_ROOT}/templates/invoke-ai.sh.tmpl` and the vendored `.claude/skills/project-hub-conventions/SKILL.md` against the plugin's copy (plugin-root fallback rule as in Context). Differences → summarize the diff and offer a refresh, warning explicitly that both files are generated and hand edits will be lost.
5. **Harness assets** — one bullet per harness; extend this list when a new harness joins:
   - Claude Code — the vendored skill from check 4 is the only hub-side asset; nothing else to verify.
   - omp — when `.omp/` exists: the rules pack (`.omp/rules/ws-*.md`, `openwiki-freshness.md`) and `.omp/hooks/post/openwiki-freshness.ts` are present and match the plugin templates (offer refresh); `.omp/config.yml` present (report-only — user config is never overwritten). When `.omp/` is absent and the user works with omp, offer the step-5a omp preset flow.
6. **Knowledge freshness** — when `openwiki/` exists: compare sub-repo `dev-docs/` mtimes (excluding `dev-docs/tickets/`) against `openwiki/.last-update.json`. Stale → print the exact prompted refresh command (`openwiki --update "Refresh; re-scan sub-repos: <list from project.yaml>"`) and ask before running it — a refresh costs tokens.
7. **Verdict** — render one line per check (`✓` ok / `~` fixed / `✗` needs the user), then: what was fixed, what was deliberately left alone and why, and a closing line — either `Ready for development — cd <hub> && ./invoke-ai.sh` or `Not ready: <blocking items>`.
