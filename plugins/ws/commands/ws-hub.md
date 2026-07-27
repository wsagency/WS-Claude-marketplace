---
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
description: "Multi-repo project hub operations: init, doctor, status, repos, add, describe, docs, explained"
argument-hint: "<init | doctor | status | repos <pull|clone> | add [--scan] | describe | docs | explained [topic]>"
---

# /ws-hub — Project Hub Operations

Single entry point for all hub operations. Sub-repos live as **subfolders of
the hub**, each with its own git, kept out of the hub's git via a managed
`.gitignore` block.

This command is **harness-agnostic**: it behaves the same under any agent
harness (Claude Code, omp, …) and never assumes which one is running. Where a
step genuinely differs per harness, it is written as a "Harness notes" list
with one bullet per harness — support a new harness by adding a bullet there
(and an `agent_cmd_<name>()` entry in `invoke-ai.sh`), never by forking the
flow.

## Context

- Hub directory: !`pwd`
- project.yaml: !`cat ./project.yaml 2>/dev/null || echo "(missing — not an initialized hub)"`
- Plugin templates: `${CLAUDE_PLUGIN_ROOT}/templates/`
- Plugin skill: `${CLAUDE_PLUGIN_ROOT}/skills/project-hub-conventions/SKILL.md`
  (if CLAUDE_PLUGIN_ROOT is unset — e.g. in omp — use the plugin's install directory: the plugin root containing this command file)

> If any Context value above still shows an unexpanded shell command (an exclamation mark followed by a backtick-quoted command), your runtime does not pre-execute context commands — run each one via bash now, before proceeding.

## Routing

The verb is `$1`; anything after it is the verb argument. No verb → print the
verb list and stop (write nothing):

```
/ws-hub <verb>
  init                initialize a new hub (offers doctor when one exists)
  doctor              diagnose + repair an existing hub
  status              read-only git sweep across all sub-repos
  repos <pull|clone>  one git operation across all registered repos
  add [--scan]        register a sub-repo (clone / adopt / sibling / retro-mark docs)
  describe            refresh description/tech fields from repo contents
  docs                cross-repo docs via hub-architect (+ wiki refresh offer)
  explained           generate the role: explained product artefacts
```

Before any structural verb (`init`, `doctor`, `add`, `describe`), read the
**project-hub-conventions** skill (path above) — it is the single source for
the `project.yaml` schema, path rules, the `.gitignore` managed block, the
AGENTS.md `ws-hub:repos` marker pair, and the tech-inference table. Verbs
define only the interaction flow; follow the skill for every structural
detail.

### verb = init

Initialize a new project hub — or, when invoked inside an EXISTING hub, offer
the doctor flow (step 0).

#### 0. Existing hub? → offer doctor

If `./project.yaml` already exists (or the current `AGENTS.md` carries the `ws-hub:repos` markers), this is an already-initialized hub — do NOT re-scaffold anything. Ask (AskUserQuestion, or a plain chat question when that tool is unavailable): "This hub is already set up. What do you want?"

- **Doctor — diagnose + repair** (recommended) → run **Doctor mode** (section below) in fix posture.
- **Diagnose only** → Doctor mode in report posture: print findings, change nothing.
- **New hub elsewhere** → the invocation was intentional but for a different location; ask for the parent path and continue from step 1 there.
- **Nothing** → wrongly invoked; exit without changes.

When neither detection marker is present, skip this step silently and start at step 1.

#### 1. Gather project info via AskUserQuestion (or a plain chat question when that tool is unavailable)

First detect candidate repos by running (Bash) a scan for git directories among subdirectories of the CWD and among siblings:

```bash
for d in */; do [ -d "$d/.git" ] && echo "./$d"; done
for d in ../*/; do [ -d "$d/.git" ] && echo "../$d"; done
```

Then ask:

- Project name (kebab-case, e.g. `acme`) — hub folder will be `<name>-main`
- One-line description
- Location: current dir or a custom parent path
- Show detected git repos (both subdirs of CWD and siblings); ask the user which to register initially (multi-select)

#### 2. Create hub skeleton

Inside `<name>-main/`:

- `.claude/skills/project-hub-conventions/SKILL.md` — copy from `${CLAUDE_PLUGIN_ROOT}/skills/project-hub-conventions/SKILL.md` (vendored so the hub works without the marketplace plugin)
- `project.yaml` — from `${CLAUDE_PLUGIN_ROOT}/templates/project.yaml.tmpl` with substitutions
- `invoke-ai.sh` — copy from template, `chmod +x`
- `AGENTS.md` — from `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md.tmpl` with placeholder substitutions (`__PROJECT_NAME__`, `__PROJECT_DESCRIPTION__`; `__REPO_SECTIONS__` is filled in step 7) — the canonical, agent-neutral project map
- `CLAUDE.md` — from `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md.tmpl` (thin `@AGENTS.md` import — never put content here)
- `README.md` — from `${CLAUDE_PLUGIN_ROOT}/templates/README.md.tmpl` with placeholder substitutions (`__PROJECT_NAME__`)
- `.gitignore` — standard prelude (`.DS_Store`, `.cache/`) followed by the managed block as defined in the skill's ".gitignore managed block" section

Do NOT create a `docs/` subdirectory — docs is its own repo registered like any other.

#### 3. Handle each selected sub-repo (ask per-repo)

For every repo the user selected, ask via AskUserQuestion what to do:

- **Move into hub**: `mv <source-path> ./<name>` then register with `path: ./<name>`. Use for sibling repos the user wants under the hub now.
- **Register in place** (as sibling): keep at original path, register with `path: ../<name>` (or whatever the relative path is). Use when the repo can't be moved (in use, etc.).
- **Clone fresh into hub**: ask for git URL, `git clone <url> ./<name>`, register with `path: ./<name>`. Use for repos not yet on disk.
- **Skip**: don't register now.

Register each chosen repo in `project.yaml` following the skill's "project.yaml schema" section (fields, path rules) and its "Tech inference" table. Prompt the user for `description` (default `"TODO: describe this repo"`). Also ask whether the repo is the product docs repo (`role: docs`) — before writing `role: docs`, check `project.yaml`: if another repo already has `role: docs`, refuse with a message naming it (max one per hub — see the project-hub-conventions skill). If the user plans to create a fresh docs repo in step 4, they should answer No here. Add nested (`./`) repos to the `.gitignore` managed block per the skill; sibling (`../`) repos are not added.

#### 4. Product docs repo

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
- **No** → skip; note that the `add` verb can later register a docs repo or retro-mark an already-registered repo as `role: docs`. Also prune or adapt the generated `AGENTS.md` "Documentation" section — the template presumes a `role: docs` repo exists, and it must not point at a repo that isn't there.

#### 5. Knowledge & fleet tooling (optional)

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

#### 6. Initialize hub git

```bash
cd <hub-dir>
git init -q
git add .gitignore .claude README.md AGENTS.md CLAUDE.md project.yaml invoke-ai.sh
git add openwiki .github 2>/dev/null || true   # present only if step 5a ran
git commit -q -m "chore: initialize <project> hub"
```

Verify with `git status` that no sub-repo content shows up as untracked (the .gitignore should be filtering them out).

#### 7. Generate `AGENTS.md` repo sections

Fill the region between the `ws-hub:repos` markers (replacing the template's placeholder — see "Regenerated region (marker pair)" in the skill) with one block per registered repo:

```markdown
### <name>

<description>

- path: `<path>`
- tech: <tech>
- url: <url if present>
```

#### 8. Report back

- Path to created hub
- Each registered repo: name, where it ended up (nested/sibling/cloned)
- OpenWiki / herdr status (initialized / skipped)
- Next steps:
  - `cd <hub> && ./invoke-ai.sh` to launch
  - `/ws-hub repos clone` if any registered repos aren't on disk
  - `/ws-hub add` to register more
  - `/ws-hub docs` to generate cross-repo docs (and refresh OpenWiki when initialized)
  - Each sub-repo should keep repo-specific rules in its own `AGENTS.md`, with a thin `CLAUDE.md` containing only `@AGENTS.md`. Harness notes:
    - Claude Code — auto-loads it when the repo is mounted via `--add-dir`
    - omp — does not auto-load sub-repo context; read it when entering the sub-repo

#### init constraints

- Do NOT modify the contents of any sub-repo (besides moving its containing folder if user chose "move").
- Do NOT push to any remote.
- Do NOT clone repos the user didn't ask to clone.
- Confirm before `mv` — moves are observable side effects.

### verb = doctor

Requires an initialized hub (`./project.yaml`; missing → abort with a hint to
run `/ws-hub init`). Ask the posture (AskUserQuestion): **fix** (diagnose +
repair, recommended) or **report** (diagnose only). Then run **Doctor mode**
(section below).

### verb = status

Read-only status sweep across all sub-repos registered in the current hub.

1. Read `./project.yaml` with the Read tool. If it's missing, abort with a hint to run `/ws-hub init` first.

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

6. Finish with the launch hint (harness-agnostic — the launcher has its own agent picker):

   ```
   To launch an agent across all sub-repos:  cd <hub> && ./invoke-ai.sh
   ```

   If the sweep surfaced problems (behind upstream, missing checkouts, dirty repos), add one more line: `For diagnosis + repair, run /ws-hub doctor.`

Read-only verb. Do not run any pulls, fetches, or modifications.

### verb = repos

One traversal of the registered repos; the verb argument picks the git
operation. `$2` must be `pull` or `clone`:

- **pull** — `git pull --ff-only` every registered repo that's on disk
- **clone** — clone every registered `url` into its missing path

Anything else (or no argument): abort and print usage: `/ws-hub repos <pull|clone>`.

1. Verify the hub: `project.yaml` must exist in the current directory. If not, abort and tell the user this verb must be run from a hub repo (hint: `/ws-hub init`).

2. Traverse. Parse the list of repos from `project.yaml` (read the file directly). For each repo, resolve its absolute path relative to the hub, then apply the operation:

   **pull** (in parallel where possible):
   - Path doesn't exist → report `⊘ skipped (no local checkout)` and continue
   - Path exists but isn't a git repo → report `⊘ skipped (not a git repo)`
   - Otherwise → run `git -C <path> pull --ff-only`, capture output, tag the result with the repo name

   **clone** (one at a time — don't parallelize, to keep output legible and credentials prompts working):
   - Path exists and is a git repo → `✓ already present`
   - Path missing and `url` registered → `git clone <url> <path>`; on success `✓ cloned <name>`
   - Path missing and no `url` in yaml → `⊘ no url registered — cannot clone`
   - On clone failure (no access, bad URL, network) → `✗ <name>: <one-line error>` and continue with the next. Do NOT prompt for credentials beyond what git itself does; if git fails, fail this repo and move on.

3. Verify hub cleanliness (clone only): after all clones, run `git status` in the hub. Sub-repos registered with `./` paths should be filtered by `.gitignore`. If any show up as untracked, report which.

4. Summary table:

   ```
   acme-app         ✓ Fast-forwarded 3 commits
   acme-marketing   ✓ already present
   acme-design      ⊘ skipped (no local checkout)
   acme-docs        ✗ failed: <error>
   ```

Safety rules: do not push, do not merge non-fast-forward, do not touch
uncommitted changes. If `pull --ff-only` fails because of local changes or
divergence, report it but don't try to resolve. Read-only with respect to the
hub's git — `clone` creates folders but doesn't commit. `/ws-hub repos clone`
is the natural follow-up after cloning the hub on a new machine.

### verb = add

Register one or more sub-repos in the current hub. Without further arguments,
register a single repo the user points at. With `--scan` (`$2`), discover
unregistered repos first, then feed each selection through the same
registration flow below.

First detect candidate repos by running (Bash):

```bash
for d in */; do [ -d "$d/.git" ] && echo "./$d"; done     # nested
for d in ../*/; do [ -d "$d/.git" ] && echo "../$d"; done  # siblings
```

**OpenWiki pointer (when the hub has one):** if `<hub>/openwiki/` exists,
every newly registered sub-repo's `AGENTS.md` gets the "Hub knowledge wiki"
pointer section (same text the init verb's step 5a writes — pointing at
`../openwiki/quickstart.md`, path adjusted for sibling repos; create AGENTS.md
+ a thin CLAUDE.md if the repo has neither), AND the repo is added to the
coverage-scope list in `openwiki/INSTRUCTIONS.md`. Apply this in the
registration flow below after the repo lands in `project.yaml`.

1. Verify we're in a hub (`project.yaml` exists). If not, abort with hint to run `/ws-hub init`.

#### Without `--scan`: pick one repo

2. Ask the user via AskUserQuestion (or a plain chat question when that tool is unavailable) how to add the new repo:
   - **Clone from URL**: prompt for git URL, clone into `./<name>` subfolder
   - **Adopt nested**: pick from detected nested .git directories (already in the hub)
   - **Register sibling**: pick from detected sibling .git directories — register at `../<name>` without moving
   - **Move sibling in**: pick a sibling, `mv ../<name> ./<name>`, register at `./<name>` (confirm before move)
   - **Mark existing as docs repo**: retro-mark an ALREADY-registered repo as the product docs repo — see "Retro-mark mode" below (skips the registration flow)

3. Run the **registration flow** below for the chosen repo (except retro-mark, which has its own steps).

#### Retro-mark mode: mark an already-registered repo as `role: docs`

1. List the repos already registered in `project.yaml` and let the user pick one.
2. Max-one check: if another entry already carries `role: docs`, refuse with a message naming it (max one per hub — see the project-hub-conventions skill).
3. Add `role: docs` to the chosen entry via `Edit` (preserve formatting), then regenerate the `AGENTS.md` marker region as in registration step 4.
4. No clone, move, or `.gitignore` change — the repo is already registered. Then run "Finish" below.

#### With `--scan`: discover, then register

2. Parse `project.yaml` to get registered `path` values. Normalize by stripping `./` and `../` prefixes for comparison against detected basenames.

3. Compare against detected `.git` directories (both nested and sibling). For each **unregistered** repo:
   - Print its location (nested or sibling), basename, `git remote.origin.url` if any, and first README heading as a hint
   - Mark nested ones with `[nested]` and siblings with `[sibling — consider moving in]`

4. If no unregistered repos exist, report: `Hub is in sync — all nearby git repos are registered.` and stop.

5. Ask the user (AskUserQuestion, multi-select) which to register now. Run the **registration flow** below for each selection:
   - Nested → register at `./<name>`
   - Sibling → ask whether to move into the hub (`mv`, confirm before move) or register in place at `../<name>`

#### Registration flow (single definition — both modes use this)

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

#### Finish (both modes)

- Run `git status` from the hub to confirm no new sub-repo shows up as untracked. If any does, report which file isn't filtered correctly.
- Confirm by listing all registered repos and their paths.

#### add safety rules

- Do not modify sub-repo contents; only `mv` a repo's containing folder when the user chose "move", confirmed first.
- Only `project.yaml`, `AGENTS.md`, and `.gitignore` in the hub may be modified (the thin `CLAUDE.md` import is created by the init verb and never touched here).
- Do not commit hub changes — let the user review and commit themselves.

### verb = describe

1. Verify `project.yaml` exists.

2. For each registered repo with an accessible local path:
   - Read its `README.md` (or `README` / first `.md` file at root)
   - Check the repo root for the manifest files listed in the project-hub-conventions skill's "Tech inference" table — that table is the single source for the manifest → tech mapping
   - Glance at top-level directory structure

3. Propose updates to `description` and `tech` fields. Show the user a diff (current vs proposed) and ask for confirmation before writing.

4. After confirmation, update `project.yaml` (preserve formatting — use Edit for targeted replacements).

5. Regenerate the `AGENTS.md` region between `<!-- ws-hub:repos:start -->` and `<!-- ws-hub:repos:end -->` from the updated yaml (see the marker-pair definition in the project-hub-conventions skill).

6. For projects with 4+ sub-repos, optionally delegate the per-repo analysis to the `hub-architect` agent via the Task tool (omp: its task agent) in parallel to keep it fast.

Be conservative — only overwrite a `description` if the new one is clearly better than the existing one (e.g. existing is `"TODO"` or empty).

### verb = docs

Produce or refresh the hub's cross-repo documentation by dispatching the `hub-architect` agent.

1. Read `./project.yaml` with the Read tool. If it's missing, abort with a hint to run `/ws-hub init` first.

2. Spawn the `hub-architect` agent via the Task tool (omp: its task agent), running from the hub directory. Its job is defined in its own prompt: analyze every accessible sub-repo registered in `project.yaml` and produce/refresh the cross-repo docs — `architecture.md`, plus `contracts.md` (only if shared contracts exist) and `deployment.md` (only if deployment files are found). Pass along any focus the user asked for (e.g. "just refresh deployment").

3. Relay the agent's report to the user: files written, key cross-repo findings, and anything flagged for human attention.

After the cross-repo docs are generated: if `<hub>/openwiki/` exists, offer to
refresh the hub knowledge wiki. Refresh MUST use an explicit prompt (sub-repo
commits are invisible to hub git, so plain `--update` would skip as "no
changes"): build the sub-repo list from `project.yaml` and run
`openwiki --update "Refresh the wiki; re-scan these sub-repos for changes: <name>, <name>, ..."`.
Report what OpenWiki changed (it prints its own summary) and remind that the
`<!-- OPENWIKI:START/END -->` context-file blocks are tool-managed. Refresh is
AI-driven by convention (no CI): also offer it proactively when the wiki is
stale before major cross-repo work (`openwiki/.last-update.json` vs recent
sub-repo commits), and after any significant dev-docs change — not only after
doc-generation runs.

Docs placement note: outputs go to the `role: docs` repo's `dev-docs/` when `project.yaml` registers one, otherwise to the hub's `dev-docs/` (never a hub `docs/` — hubs must not have one).

Scope note: this verb produces the cross-repo SYNTHESIS layer only. Per-repo docs maintenance across the whole hub (status, catchup, repair — one subagent per sub-repo) is `/ws-docs` invoked at the hub root (hub sweep).

### verb = explained

Generate or refresh the product-explained artefacts in this hub's
`role: explained` repo — human-facing visual documentation of the whole
product for the product owner and dev team, consumed by the ws-artefacts
platform (artefacts.wsagency.io). Run from a hub. `$2` = optional topic.

#### 1. Resolve the explained repo

Read `./project.yaml` with the Read tool. If it's missing, abort with a hint
to run `/ws-hub init` first. Locate the entry carrying `role: explained`
(max ONE per hub — see the `ws-artefacts-explained` skill).

If no entry has `role: explained`, ask the user via AskUserQuestion (or a
plain chat question when that tool is unavailable) how to proceed:

- **Register an existing repo** — run the `add` verb's flow and mark
  the chosen entry `role: explained` (enforce max one), then continue below.
- **Create `<project>-explained`** — `mkdir ./<project>-explained` and
  `git -C ./<project>-explained init`, then register it with
  `role: explained` following the registration flow defined in the `add`
  verb (project.yaml entry, `.gitignore` managed block, `AGENTS.md` marker
  region). Leave `url` empty until a remote exists; hint to create one on
  git.wsagency.io.
- **Cancel** — stop.

#### 2. Generate the artefact(s)

Load the `ws-artefacts-explained` skill first — it defines the artefact HTML
contract (self-contained, inline-SVG diagrams, WS chrome palette, minimal
head), the `meta.json` shape, and the registration YAML. Everything written
below must satisfy it.

Gather sources:

- If `<hub>/openwiki/` exists and looks stale (`openwiki/.last-update.json`
  vs recent sub-repo commits), offer to refresh it first — refresh MUST use
  an explicit prompt, per the hub convention:
  `openwiki --update "Refresh the wiki; re-scan these sub-repos for changes: <name>, <name>, ..."`.
- Synthesize from: `project.yaml`, `openwiki/` (primary derived map), the
  `role: docs` repo's `dev-docs/` (decisions, architecture), per-sub-repo
  `dev-docs/` and READMEs, and `CONTEXT.md` for the glossary.
- If the product is large (many sub-repos), fan out per-repo content
  gathering via the Task tool (omp: its task agent) — one gatherer per
  sub-repo returning purpose, tech, key flows, and notable decisions.

Write into the explained repo:

- The artefact HTML — default file `<project>-explained.html` covering the
  whole product; when the user asked for a specific topic (`$2`), write a
  kebab-case `<topic>.html` instead. Regenerate existing files in full rather
  than patching them — explained output is never hand-edited.
- `meta.json` — create or update the entry for each file written
  (`file`, `title`, `date`, `description`). Never write `token` fields;
  tokens are minted on the ws-artefacts side.

#### 3. Verify standalone

Grep each generated HTML file for external references: any `src=` or
`href=` pointing at `http(s)` other than plain outbound `<a href>` links is
a contract violation, as are `<link rel="stylesheet">`, external
`<script src>`, mermaid markup, or robots/favicon meta in the head. Fix and
re-check until clean, then report what was verified.

#### 4. Report and print the registration next step

Report the files written, then print the exact ws-artefacts registration
block for this repo, filling `repo` from the explained repo's remote
(`git -C <explained-path> config --get remote.origin.url`, or a
`<ssh-url-once-remote-exists>` placeholder when there is none):

```yaml
# ws-artefacts repo → projects/<project>/git-source.yml
name: <project>
repo: <ssh url of this explained repo>
ref: main
token: <minted on the ws-artefacts side — never set here>
# optional: path, password, description
```

Note alongside it: tokens are minted and committed on the ws-artefacts side
by its `add.mjs`; and the open item — ws-artefacts CI still needs cross-repo
pull auth (a deploy key or Gitea token for this repo in its Actions secrets)
before it can pull the explained repo.

#### explained safety rules

- Write only inside the explained repo, except when registering a new repo
  in step 1 (which touches `project.yaml`, `.gitignore`, and `AGENTS.md` via
  the `add` verb's flow).
- Do not commit — leave the generated changes in the explained repo for the
  user to review and push (its own git; the hub ignores it).

## Doctor mode (existing hub)

Entered via the `doctor` verb, or from the init verb's step 0. Purpose: verify the hub is **ready for development** — everything pulled, registered, and up to date. Posture: **fix** (apply safe repairs, confirming each group before applying) or **report** (findings only, zero changes).

Hard limits in BOTH postures: never switch branches, never `reset`/`checkout` files, never force-push, never overwrite user-owned config (`project.yaml` values, `.omp/config.yml`). Anything in that category is a report-only finding, addressed to the user.

Run the checks in order:

1. **Hub repo freshness** — `git fetch` in the hub (skip gracefully when there is no remote). Clean and behind upstream → `git pull --ff-only`. Dirty, diverged, or on a non-default branch → report; touch nothing.
2. **Sub-repos on disk** — for every repo in `project.yaml`: folder missing but `url` present → offer to clone (same behavior as the `repos clone` verb); present → fetch, and when clean and behind, `git pull --ff-only`. Dirty, diverged, or detached → report with branch names; touch nothing.
3. **Registry integrity** — `project.yaml` parses; at most one `role: docs` and one `role: explained`; every nested (`./`) repo appears in the `.gitignore` managed block; the `ws-hub:repos` marker region in `AGENTS.md` matches `project.yaml` (drifted → regenerate the region, it is machine-managed); `CLAUDE.md` is the thin `@AGENTS.md` import (tool-managed marker blocks are the only permitted extras) — if fattened, move the content to `AGENTS.md`.
4. **Generated files up to date** — compare the hub's `invoke-ai.sh` against `${CLAUDE_PLUGIN_ROOT}/templates/invoke-ai.sh.tmpl` and the vendored `.claude/skills/project-hub-conventions/SKILL.md` against the plugin's copy (plugin-root fallback rule as in Context). Differences → summarize the diff and offer a refresh, warning explicitly that both files are generated and hand edits will be lost.
5. **Harness assets** — one bullet per harness; extend this list when a new harness joins:
   - Claude Code — the vendored skill from check 4 is the only hub-side asset; nothing else to verify.
   - omp — when `.omp/` exists: the rules pack (`.omp/rules/ws-*.md`, `openwiki-freshness.md`) and `.omp/hooks/post/openwiki-freshness.ts` are present and match the plugin templates (offer refresh); `.omp/config.yml` present (report-only — user config is never overwritten). When `.omp/` is absent and the user works with omp, offer the init verb's step-5a omp preset flow. Also check for the `@wsagency/omp-ws` native extension (`omp plugin list`); when absent, mention it (guard + enforcement parity — see docs/how-to/omp-setup.md) without treating it as a failure.
6. **Knowledge freshness** — when `openwiki/` exists: compare sub-repo `dev-docs/` mtimes (excluding `dev-docs/tickets/`) against `openwiki/.last-update.json`. Stale → print the exact prompted refresh command (`openwiki --update "Refresh; re-scan sub-repos: <list from project.yaml>"`) and ask before running it — a refresh costs tokens.
7. **Verdict** — render one line per check (`✓` ok / `~` fixed / `✗` needs the user), then: what was fixed, what was deliberately left alone and why, and a closing line — either `Ready for development — cd <hub> && ./invoke-ai.sh` or `Not ready: <blocking items>`.
