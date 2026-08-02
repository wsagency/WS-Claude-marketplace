---
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
description: "Multi-repo project hub operations: init, doctor, update, intake, status, repos, add, describe, docs, explained"
argument-hint: "<init | doctor | update | intake | status | repos <pull|clone> | add [--scan] | describe | docs | explained [topic]>"
---

# /ws-hub — Project Hub Operations

Single entry point for all hub operations. Sub-repos live as **subfolders of
the hub**, each with its own git, kept out of the hub's git via a managed
`.gitignore` block.

**Project shape.** This command operates on a hub (a directory with a
`project.yaml`). It determines the project shape via the shared procedure
documented once in the **project-hub-conventions** skill ("Project shape
detection") — see that skill for the walk-up rules; do not restate them here.
Every verb except `init` requires a hub root: when there is none, they stop and
point at `/ws-hub init` in one line (never scolding, never erroring merely
because `project.yaml` is absent). `init` creates a hub from nothing, or adopts
an existing set of repos into a new hub (step 1). Standalone repos keep their
own `dev-docs/` as the product knowledge root until a hub is chosen (ADR 0007).

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
  update              migrate hub conventions to the latest version (interactive)
  intake              process client/input deliveries into hub dev-docs knowledge
  status              read-only git sweep across all sub-repos
  repos <pull|clone>  one git operation across all registered repos
  add [--scan]        register a sub-repo (clone / adopt / sibling / mark output)
  describe            refresh description/tech fields from repo contents
  docs                cross-repo docs via hub-architect (+ wiki refresh offer)
  explained           generate the purpose: explained product artefacts
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

#### 0. Detect project shape

Run project shape detection (see the **project-hub-conventions** skill,
"Project shape detection") to decide where you are:

- **Hub root** (`./project.yaml` present, or `AGENTS.md` carries the
  `ws-hub:repos` markers) → this hub is already initialized — do NOT
  re-scaffold. Ask (AskUserQuestion, or a plain chat question when that tool
  is unavailable): "This hub is already set up. What do you want?"
  - **Doctor — diagnose + repair** (recommended) → run **Doctor mode** (section below) in fix posture.
  - **Diagnose only** → Doctor mode in report posture: print findings, change nothing.
  - **New hub elsewhere** → the invocation was intentional but for a different location; ask for the parent path and continue from step 1 there.
  - **Nothing** → wrongly invoked; exit without changes.
- **Hub sub-repo** (`project.yaml` found in an ancestor directory) → the hub
  already exists at that ancestor. Report its path in one line and stop (do not
  scaffold here); suggest re-running `/ws-hub` from the hub root.
- **Standalone repo** (no `project.yaml` anywhere up the tree) → the greenfield
  path: continue at step 1. Nothing errors — creating the first hub is exactly
  what `init` is for.

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
- `project.yaml` — from `${CLAUDE_PLUGIN_ROOT}/templates/project.yaml.tmpl` with substitutions; substitute the template's `__CONVENTIONS_VERSION__` placeholder with the current conventions version (the "Latest conventions version" in the `update` verb's migration table)
- `invoke-ai.sh` — copy from template, `chmod +x`
- `AGENTS.md` — from `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md.tmpl` with placeholder substitutions (`__PROJECT_NAME__`, `__PROJECT_DESCRIPTION__`; `__REPO_SECTIONS__` is filled in step 7) — the canonical, agent-neutral project map
- `CLAUDE.md` — from `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md.tmpl` (thin `@AGENTS.md` import — never put content here)
- `README.md` — from `${CLAUDE_PLUGIN_ROOT}/templates/README.md.tmpl` with placeholder substitutions (`__PROJECT_NAME__`)
- `dev-docs/` — the product knowledge root (see the skill's "Hub dev-docs" section): `decisions/`, `runbooks/`, `scoping/` (each with an `index.md` stub) plus an `architecture.md` placeholder noting hub-architect writes it
- `.gitignore` — standard prelude (`.DS_Store`, `.cache/`) followed by the managed block as defined in the skill's ".gitignore managed block" section

Do NOT create a `docs/` subdirectory — user docs live in the `purpose: docs` output repo, registered like any other.

#### 3. Handle each selected sub-repo (ask per-repo)

For every repo the user selected, ask via AskUserQuestion what to do:

- **Move into hub**: `mv <source-path> ./<name>` then register with `path: ./<name>`. Use for sibling repos the user wants under the hub now.
- **Register in place** (as sibling): keep at original path, register with `path: ../<name>` (or whatever the relative path is). Use when the repo can't be moved (in use, etc.).
- **Clone fresh into hub**: ask for git URL, `git clone <url> ./<name>`, register with `path: ./<name>`. Use for repos not yet on disk.
- **Skip**: don't register now.

Register each chosen repo in `project.yaml` following the skill's "project.yaml schema" section (fields, path rules) and its "Tech inference" table. Prompt the user for `description` (default `"TODO: describe this repo"`). Also ask for the repo's **type** (see the skill's "Repo types" table): `working` (development repo — default), `input` (external deliveries that feed development: client materials, design assets, data dumps), or `output` (derived artifact — then also ask the `purpose`: `docs` or `explained`; the vocabulary is open but only those two have a consumer today, so do not offer "custom" in the prompt). Before writing a known purpose, enforce the skill's known-purpose uniqueness rule (Output repos section) — check `project.yaml` and refuse with a message naming the existing entry if taken. If the user plans to create fresh input/output repos in step 4, they should answer `working` here. For an ADOPTED repo (already on disk, not cloned fresh), propose an inferred type from its signals — name suffix (`-client`/`-design` → `input`, `-docs` → `output, purpose: docs`, `-explained` → `output, purpose: explained`) and contents — and confirm; default to `working` when unclear. Add nested (`./`) repos to the `.gitignore` managed block per the skill; sibling (`../`) repos are not added.

#### 3b. Lift adopted product dev-docs (optional)

For every repo registered in step 3 that previously lived standalone and carries its OWN product-level `dev-docs/` (signature: `architecture.md`, `contracts.md`, `deployment.md`, `decisions/`, `runbooks/`), the hub is now the product knowledge root (ADR 0006), so that content belongs in the hub's `dev-docs/`. Adoption is always opt-in and never silent.

Per repo, AskUserQuestion: **lift** (move product-level content into the hub's `dev-docs/`) / **leave** (the repo keeps its `dev-docs/`; nothing moves).

- **lift** → move PER-FILE using the collision-safe procedure from the `update` verb's "Product dev-docs move" step: require clean worktrees (hub + source repo) first; for each source file, refuse to overwrite an existing destination; list every collision to the user before moving anything; renumber colliding ADRs (`decisions/NNNN-*.md`) to the next free number, or land other files under `<name>-from-<repo>.md`; confirm the full plan, then execute. Repo-level content about the repo itself stays put.
- **leave** → note it; the repo's `dev-docs/` stays as-is (it can be lifted later via `/ws-hub update`).

Do NOT touch a repo whose `dev-docs/` is absent or holds only repo-level content.

#### 4. Input & output repos

Skip an offer below if a repo registered in step 3 already covers it (a
`purpose: docs` output, a client input repo, a `purpose: explained` output)
— just point at it in the report. The two offers below (4a, 4b) are
independent AskUserQuestion prompts; each "Yes" creates + registers the repo,
each "No" is noted with the remedy (`/ws-hub add` can register or mark one
later). 4c is on request only — it has no Yes/No branch.

**4a — Client input repo.** Ask: "Create a client materials repo
(`<project>-client`, type `input`)?"
- **Yes** → create the subfolder, `git init` it, scaffold per the skill's
  "Input repos" section: README, AGENTS.md with the dated-folder convention
  note (plus a thin CLAUDE.md with only the `@AGENTS.md` import), and a
  `history.md` stub. Register with `type: input`; add to the `.gitignore`
  managed block.
- **No** → skip. If the user expects client deliveries later, note that
  `/ws-hub add` can register one at any time.

**4b — Product docs repo.** Ask: "Create a product docs repo
(`<project>-docs`, type `output`, purpose `docs`)?"
- **Yes** → create the subfolder, `git init` it, scaffold the layout defined
  in the project-hub-conventions skill ("Product docs repo" section): README,
  AGENTS.md with the writing rules pointer (plus a thin CLAUDE.md containing
  only the `@AGENTS.md` import), docs/ tree with index.md and
  empty Diátaxis folders + assets/ + release-notes/. Do NOT scaffold a
  product-level dev-docs/ here — product internal docs live in the hub's own
  `dev-docs/` (created in step 2).
  Register it in project.yaml with `type: output, purpose: docs` and add it
  to the .gitignore managed block. Do NOT create .outline-sync.json (created
  by the first /ws-docs publish).
- **No** → skip; note that the `add` verb can later register a docs repo or mark an already-registered repo as the `purpose: docs` output. Also prune or adapt the generated `AGENTS.md` "Documentation" section — the template presumes a `purpose: docs` repo exists, and it must not point at a repo that isn't there.

**4c — Explained repo.** Only if the user asked — otherwise defer to the
`/ws-hub explained` verb, which creates and registers `<project>-explained`
on first run.

#### 5. Knowledge & fleet tooling (optional)

**5a — OpenWiki (hub-level knowledge wiki).** Ask (AskUserQuestion): "Initialize OpenWiki at the hub level — one knowledge wiki covering ALL sub-repos?"

- **Yes** → verify `command -v openwiki` (missing → print `npm install -g openwiki` and let the user install first). Run `openwiki --init` at the hub root — it is interactive (provider/model onboarding); let the user drive it. It generates `openwiki/` and maintains its own `<!-- OPENWIKI:START/END -->` block in the hub's `AGENTS.md` AND `CLAUDE.md` — the CLAUDE.md block is a permitted tool-managed exception to the thin-import rule (see the skill's "Context-file cascade"). Then, immediately after init:
  1. **Write the coverage scope into `openwiki/INSTRUCTIONS.md`** (append a "Coverage scope" section): the wiki documents the product across ALL registered **`type: working`** sub-repos — enumerate them from `project.yaml` (`type: input` repos are raw external deliveries and `type: output` repos are derived artifacts — both are excluded) — each a SEPARATE git repository nested in this hub and invisible to the hub's git; always scan them all; the hub root itself is a thin meta repo (its `dev-docs/` is authored truth, not wiki input). Without this, OpenWiki tends to document only the largest repo it finds.
  2. **Delete the generated CI workflow** (`.github/workflows/openwiki-update.yml`) if openwiki created one — the WS convention is AI-DRIVEN refresh (agents run a prompted refresh occasionally, before and/or after major work), not scheduled CI. Freshness is enforced softly: the plugin's Stop hook reminds when dev-docs changed since the last refresh (Claude Code), and when `.omp/` exists (or the user uses omp) copy `${CLAUDE_PLUGIN_ROOT}/rules/openwiki-freshness.md` into the hub's `.omp/rules/` (same fallback rule for the plugin root as above; the full omp preset itself is step 5b).
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

**5b — omp preset (when the user uses omp).** Write `.omp/config.yml` from `${CLAUDE_PLUGIN_ROOT}/templates/omp/config.yml.tmpl` (skip if one exists — never overwrite user config), copy `${CLAUDE_PLUGIN_ROOT}/templates/omp/hooks/openwiki-freshness.ts` into `.omp/hooks/post/` (native TS freshness hook — banner + exact update command on session settle), and copy the WS rules pack `${CLAUDE_PLUGIN_ROOT}/templates/omp/rules/*.md` into `.omp/rules/` (ws-guard-git, ws-commit-format, ws-generated-files — TTSR rules that interrupt the model's stream on dangerous git ops, non-conventional commits, and hand-edits of generated files). ASK the user (AskUserQuestion, defaults first): (1) approval posture — **yolo** (default, omp's own default) or `write` for cautious client repos; (2) bash guard patterns — **off** (default) or on; (3) whether to fill the per-project `modelRoles` block now (the template documents the WS class mapping and thinking-level suffixes — each project can run different providers). Uncomment/adjust the template blocks per their answers. Note: the TTSR `condition`/`scope` patterns may need tuning against their omp version — they are conventions-as-enforcement, verify once live.

**5c — herdr (agent fleet multiplexer).** Ask: "Set up herdr for this hub?"

- **Yes** → the ws plugin SHIPS the vendored `herdr` skill (`plugins/ws/skills/herdr`, self-guarded by `HERDR_ENV=1`), so no per-repo or global skill install is needed where the plugin is installed. Verify `command -v herdr`; if the binary is missing print the install options (`curl -fsSL https://herdr.dev/install.sh | sh`, or `brew install herdr`). On machines WITHOUT the ws plugin, install the skill globally instead: `npx skills add ogulcancelik/herdr --skill herdr -g` (covers every repo and every agent that reads `~/.claude/skills/` — Claude Code and omp). Keep the template's "Herdr" section in the hub AGENTS.md (workspace-per-sub-repo pattern).
- **No** → prune the template's "Herdr" section from the hub AGENTS.md.

#### 6. Initialize hub git

```bash
cd <hub-dir>
git init -q
git add .gitignore .claude README.md AGENTS.md CLAUDE.md project.yaml invoke-ai.sh dev-docs
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
- type: <working | input | output> (`purpose: <purpose>` when output)
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

### verb = update

Migrate an existing hub to the latest ws-hub conventions — interactively,
never guessing. Requires `./project.yaml` (missing → abort, hint `/ws-hub
init`).

**Conventions version.** The hub's version is `project.conventions` in
`project.yaml`. Missing marker → v1 (every step below is idempotent, so
re-running on an already-migrated hub is safe).

**Migration table** (the single authoritative list — every convention change
MUST add a row here, add a matching `**Migration N→M steps:**` block, bump the
"Latest conventions version" line below, and bump the `conventions:` value in
`templates/project.yaml.tmpl` via its `__CONVENTIONS_VERSION__` placeholder):

| from→to | name | what it does |
|---|---|---|
| 1→2 | repo types + hub knowledge root (ADR 0006) | `role:`→`type:`/`purpose:` rename; scaffold hub `dev-docs/`; move product dev-docs out of the docs repo; move client materials into an input repo; refresh generated + harness files |

Latest conventions version: **2**.

**Flow:**

1. Determine the current version; list pending migrations up to the latest.
   None → report "hub conventions are current (vN)" and stop.
2. Present the plan (one line per migration: name + summary). Per migration,
   AskUserQuestion: **apply / skip / abort**.
3. Apply migrations in order, tracking whether EVERY step of each migration
   completed. Every step is idempotent — detect already-applied state and skip
   it; a re-run after abort resumes cleanly. A step whose own choice is
   **leave** or **skip** counts as NOT completed for that migration.
4. **Set the version marker only on full completion.** For each migration whose
   every step completed, set `project.conventions` to that migration's target
   version: when the `conventions:` key is absent, **insert**
   `conventions: <N>` under `project:` (a v1 hub has no key — that absence is
   how v1 is inferred; there is nothing to `Edit`); when the key is present,
   `Edit` it in place (preserve formatting). For any migration with a left or
   skipped step, do NOT bump the marker — record that migration as
   "partially applied".
5. Final report: what changed per repo, what was skipped, any **partially
   applied** migration ("partially migrated — re-run `/ws-hub update`"), and
   suggested commits (the hub and each touched sub-repo commit separately — each
   is its own git). Never commit on the user's behalf.

**Migration 1→2 steps:**

1. **Field rename** — for every repo entry: `role: docs` → `type: output` +
   `purpose: docs`; `role: explained` → `type: output` + `purpose: explained`;
   entries with neither `type` nor `role` → `type: working`. Any OTHER legacy
   `role:` value → AskUserQuestion for the type (`working` / `input` / `output`,
   and the purpose when `output`), then DROP the `role:` field — a surviving
   `role:` would leave the repo permanently non-working in the freshness
   detectors. Via `Edit`, preserve comments/formatting. After the rename,
   enforce the skill's known-purpose uniqueness rule (Output repos section): a
   malformed legacy hub with two `role: docs` must not migrate into two
   `purpose: docs` — ask the user which entry keeps it.
2. **Pre-flight cleanliness check** — before any `mv`, run
   `git status --porcelain` in the hub and in EVERY repo the move steps below
   will touch (the `purpose: docs` repo, and any repo holding client
   materials). Report any that are dirty or not a git repo and AskUserQuestion
   before proceeding: recommend committing or stashing first (the migration
   never commits, so a dirty worktree ends with the move's deletions
   interleaved with the user's WIP). This matches the posture doctor's
   hub-freshness and sub-repo checks and the `repos` verb.
3. **Product dev-docs move** (collision-safe, per-file) — if the `purpose: docs`
   repo's `dev-docs/` holds product-level content (signature of the v1 scaffold:
   `architecture.md`, `contracts.md`, `deployment.md`, `decisions/`,
   `runbooks/`), list what was found and AskUserQuestion: **move** to the hub's
   `dev-docs/` / **leave** (report-only). Repo-level content about the docs repo
   itself stays. When unsure whether a file is product- or repo-level — ask,
   never guess. **On move, this step is safe by construction:**
   - Move PER-FILE, never per-tree. `mv <docs>/dev-docs/decisions <hub>/dev-docs/`
     would silently nest as `decisions/decisions/`; `mv …/decisions/* …/decisions/`
     would overwrite same-named files — both are forbidden here.
   - For each source entry, compute its destination under the hub's `dev-docs/`
     (same relative path); create the destination parent dir (`mkdir -p`) first.
   - If the destination does NOT exist → move it. If it DOES exist → do NOT
     overwrite; add it to a collision list.
   - If the collision list is non-empty, present EVERY collision to the user
     BEFORE moving anything and resolve each: renumber ADRs
     (`decisions/NNNN-*.md`, which all start at `0001`) to the next free
     number; land other files under a disambiguated name
     (`<name>-from-docs-repo.md`). Confirm the full resolved plan, THEN execute.
     Refuse to overwrite any existing destination under all circumstances.
   - This step runs BEFORE the scaffold (step 5), so it never moves onto a path
     the scaffold pre-created.
4. **Client materials → input repo** — if `client-materials/` exists under the
   docs repo's `dev-docs/` (or the hub's): AskUserQuestion — move into an
   existing `type: input` repo (pick one) / **create `<project>-client`**
   (scaffold per the skill's "Input repos" section, then move) / leave. Moving
   preserves dated folders and `history.md` as-is. (Subject to the pre-flight
   check in step 2.)
5. **Hub dev-docs scaffold** — create the hub's `dev-docs/` skeleton for any
   path the move (step 3) did NOT already populate: `scoping/` (+ `index.md`
   stub); and only if still absent, `decisions/` + `runbooks/` (`index.md`
   stubs) and an `architecture.md` placeholder noting hub-architect writes it.
   Never overwrite a path step 3 filled.
6. **Generated + harness refresh** — offer the same refreshes as the
   vendored-skill and harness-assets doctor checks (invoke-ai.sh, vendored
   skill, `.omp/rules/` pack incl. the type-aware `openwiki-freshness` rule,
   `.omp/hooks/post/openwiki-freshness.ts`).
7. Regenerate the `AGENTS.md` `ws-hub:repos` marker region (repo blocks now
   carry the `type`/`purpose` line).

**update safety rules** — never overwrite user-authored content without an
explicit confirm; confirm every `mv` before executing; nothing is committed
or pushed; on abort, report exactly which steps applied so the user can
re-run safely. The move steps additionally require clean worktrees and a
per-file collision check (see their own rules) — the blanket rules above are
not the only protection.

### verb = intake

Process external deliveries (`type: input` repos) into product knowledge.
Requires `./project.yaml` (missing → abort, hint `/ws-hub init`).

**Conventions gate.** Intake keys off `type: input`, so it requires a migrated
hub. If `project.conventions` is below the latest (see the `update` verb's
migration table) OR any entry lacks a `type:` (a legacy `role:` field still
present), STOP and point at `/ws-hub update` — the same posture doctor's
registry-integrity check takes. Do not propose creating input repos against an
unmigrated registry (you would scaffold a duplicate beside an already-registered
client repo).

1. **Resolve input repos** — entries with `type: input`. None → offer to
   create `<project>-client` (scaffold per the skill's "Input repos"
   section: README, AGENTS.md with the dated-folder note, `history.md` stub;
   register `type: input`, `.gitignore` block, AGENTS.md marker region) or
   stop.
2. **Find unprocessed deliveries** — in each input repo, list root directories.
   Name-matching ones sort into `YYYY-MM-DD/` order; ALSO list any root
   directory that is NOT a `YYYY-MM-DD/` date folder as
   **"unrecognized — rename to `YYYY-MM-DD`"** (a delivery in `2026-1-5/`,
   `2026-01-15-v2/`, or `Jan-15-2026/` would otherwise vanish and you would
   report "all processed"). A delivery is unprocessed while no scoping doc
   carries its **structured delivery line**: grep the hub's
   `dev-docs/scoping/` for ``Delivery: `<input-repo>/YYYY-MM-DD/` `` — the exact
   repo + date together, never the bare date (the bare date collides with the
   scoping template's own `- Processed: <today ISO date>` line and is not
   repo-qualified, so it false-matches across repos). Also list any delivery
   whose `history.md` entry is still `pending`. None unprocessed → report "all
   deliveries processed" and stop.
3. **Process oldest-first** — per delivery, AskUserQuestion:
   **process / skip / stop** (stop exits the loop immediately, leaving the rest
   for a later run):
   1. **Diff** vs the previous dated folder in the same repo (added/changed/
      removed files); when this is the first delivery in the repo, note
      "initial delivery" and skip the diff. Read the delivery (sample large/
      binary files — note their presence rather than reading them).
   2. **Draft the scoping doc** from the template below (`<slug>` = kebab-case
      summary of the delivery's subject, e.g. `2026-01-15-brand-refresh`); show
      it and confirm before writing to the hub's
      `dev-docs/scoping/YYYY-MM-DD-<slug>.md`.
   3. **Offer decisions** — for each decision that crystallized, offer
      `/ws-docs adr` at product scope (hub `dev-docs/decisions/`).
   4. **Offer spec + tickets** — offer `ws-to-spec` / `ws-to-tickets` aimed
      at the WORKING repo where the change lands (its own tracker: local
      `dev-docs/tickets/` or Jira); record keys in the scoping doc.
   5. **Append `history.md`** in the input repo: date → what changed → which
      ADRs/specs/tickets it triggered — fill from sub-steps 3.3–3.4 (now that
      the data exists); write "pending" only if the user defers them, and step
      2 will re-list a `pending` delivery as unprocessed next run.
4. Report: processed deliveries, scoping docs written, ADRs/tickets raised, the
   suggested next step (`/ws-matt` flow in the target repo), and suggested
   commits (hub and input repo — each its own git).

**Scoping doc template** (`dev-docs/scoping/YYYY-MM-DD-<slug>.md`):

```markdown
# YYYY-MM-DD — <slug>

- Delivery: `<input-repo>/YYYY-MM-DD/` (<N> files, <M> new/changed vs <prev-date | initial delivery>)
- Processed: <today ISO date>

## Summary
<plain language: what arrived and what is being asked>

## Extracted requirements
- …

## Scope of work
**In scope:** …
**Out of scope:** …

## Open questions (for the client)
- …

## Decisions raised
- ADR NNNN — <title> | none

## Tickets raised
- <key> — <title> (<working repo>) | none yet
```

**intake safety rules** — input repos are immutable raw: write only
`history.md` there, never inside a dated folder; scoping docs are dated and
never edited retroactively (a new delivery → a new scoping doc); never
commit on the user's behalf.

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
   - **Mark existing as output**: mark an ALREADY-registered repo as an output with a given purpose (docs / explained) — see "Mark-as-output mode" below (skips the registration flow)

3. Run the **registration flow** below for the chosen repo (except mark-as-output, which has its own steps).

#### Mark-as-output mode: give an already-registered repo an output purpose

1. List the repos already registered in `project.yaml` and let the user pick one.
2. Ask the purpose: **docs** (product user-docs repo) or **explained** (generated visual explainer). For known purposes, enforce the skill's known-purpose uniqueness rule (Output repos section) — refuse with a message naming the existing entry if taken.
3. Set `type: output` + `purpose: <chosen>` on the chosen entry via `Edit` (preserve formatting), then regenerate the `AGENTS.md` marker region as in registration step 4.
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
   - Ask about the repo's **type**: **working** (development repo — default),
     **input** (external deliveries feeding development: client materials,
     design assets, data dumps), or **output** (derived artifact — then also
     the `purpose`: **docs** or **explained**; before writing a known purpose,
     enforce the skill's known-purpose uniqueness rule (Output repos section)).
     Input and output repos are excluded from the OpenWiki coverage scope —
     when the hub has `openwiki/`, update `openwiki/INSTRUCTIONS.md`
     accordingly (add working repos to the scope; never add input/output
     repos).

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

2. Spawn the `hub-architect` agent via the Task tool (omp: its task agent), running from the hub directory. Its job is defined in its own prompt: analyze every accessible **`type: working`** sub-repo registered in `project.yaml` (legacy hubs: entries with neither `type` nor `role` — `type: input` and `type: output` repos are excluded, per ADR 0006) and produce/refresh the cross-repo docs — `architecture.md`, plus `contracts.md` (only if shared contracts exist) and `deployment.md` (only if deployment files are found). Pass along any focus the user asked for (e.g. "just refresh deployment").

3. **Confirm before overwriting `architecture.md`.** `dev-docs/architecture.md` is curated authored truth (see the skill's "Hub dev-docs"). Before hub-architect's writes land, show a diff vs the current `dev-docs/architecture.md` (if it exists) and AskUserQuestion: **proceed | cancel** — the same gate `/ws-docs architecture` applies. On proceed, write; on cancel, leave it untouched and say so. (`contracts.md` / `deployment.md` are regenerated in full when their trigger exists.)

4. Relay the agent's report to the user: files written, key cross-repo findings, and anything flagged for human attention.

After the cross-repo docs are generated: if `<hub>/openwiki/` exists, offer to
refresh the hub knowledge wiki. Refresh MUST use an explicit prompt (sub-repo
commits are invisible to hub git, so plain `--update` would skip as "no
changes"): build the **`type: working`** sub-repo list from `project.yaml` (legacy hubs: entries with neither `type` nor `role`) and run
`openwiki --update "Refresh the wiki; re-scan these sub-repos for changes: <name>, <name>, ..."`.
Report what OpenWiki changed (it prints its own summary) and remind that the
`<!-- OPENWIKI:START/END -->` context-file blocks are tool-managed. Refresh is
AI-driven by convention (no CI): also offer it proactively when the wiki is
stale before major cross-repo work (`openwiki/.last-update.json` vs recent
sub-repo commits), and after any significant dev-docs change — not only after
doc-generation runs.

Docs placement note: outputs ALWAYS go to the hub's own `dev-docs/` — the product knowledge root beside `openwiki/` (ADR 0006). Never into a sub-repo (the `purpose: docs` repo is an output, not a destination for internal docs), and never a hub `docs/` (hubs must not have one).

Scope note: this verb owns the cross-repo SYNTHESIS layer in the hub's `dev-docs/architecture.md` (and the optional `contracts.md` / `deployment.md`). Per-repo docs maintenance across the whole hub (status, catchup, repair — one subagent per sub-repo) is `/ws-docs` invoked at the hub root (hub sweep); `/ws-docs architecture` at the hub root edits the same `architecture.md` through the same diff+confirm gate (step 3), so the two commands no longer overlap ungated.

### verb = explained

Not to be confused with `/ws-docs explain` (the `docs/explained.md` onboarding page).

Generate or refresh the product-explained artefacts in this hub's
`type: output, purpose: explained` repo — human-facing visual documentation
of the whole
product for the product owner and dev team, consumed by the ws-artefacts
platform (artefacts.wsagency.io). Run from a hub. `$2` = optional topic.

#### 1. Resolve the explained repo

Read `./project.yaml` with the Read tool. If it's missing, abort with a hint
to run `/ws-hub init` first. Locate the entry carrying `type: output,
purpose: explained` (max ONE per hub — see the `ws-artefacts-explained`
skill; legacy hubs spell it `role: explained`).

If no entry qualifies, ask the user via AskUserQuestion (or a
plain chat question when that tool is unavailable) how to proceed:

- **Register an existing repo** — run the `add` verb's mark-as-output flow
  with purpose `explained` (enforce max one), then continue below.
- **Create `<project>-explained`** — `mkdir ./<project>-explained` and
  `git -C ./<project>-explained init`, then register it with
  `type: output, purpose: explained` following the registration flow defined
  in the `add` verb (project.yaml entry, `.gitignore` managed block,
  `AGENTS.md` marker region). Leave `url` empty until a remote exists; hint
  to create one on git.wsagency.io.
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
  hub's own `dev-docs/` (architecture, product ADRs), per-`type: working` repo
  (legacy hubs: entries with neither `type` nor `role`) `dev-docs/` and READMEs,
  and `CONTEXT.md` for the glossary.
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
3. **Registry integrity** — `project.yaml` parses; every entry carries a `type` (entries without one, or with a legacy `role:` field, are pre-v2 — report and point at `/ws-hub update`); enforce the skill's known-purpose uniqueness rule (Output repos section); every nested (`./`) repo appears in the `.gitignore` managed block; the `ws-hub:repos` marker region in `AGENTS.md` matches `project.yaml` (drifted → regenerate the region, it is machine-managed); `CLAUDE.md` is the thin `@AGENTS.md` import (tool-managed marker blocks are the only permitted extras) — if fattened, move the content to `AGENTS.md`.
4. **Conventions version** — compare `project.conventions` in `project.yaml` against the latest conventions version in the `update` verb's migration table. Behind (or missing) → report: "hub conventions are vN, latest is vM — run `/ws-hub update`". Never apply migrations from doctor.
5. **Generated files up to date** — compare the hub's `invoke-ai.sh` against `${CLAUDE_PLUGIN_ROOT}/templates/invoke-ai.sh.tmpl` and the vendored `.claude/skills/project-hub-conventions/SKILL.md` against the plugin's copy (plugin-root fallback rule as in Context). Differences → summarize the diff and offer a refresh, warning explicitly that both files are generated and hand edits will be lost.
6. **Harness assets** — one bullet per harness; extend this list when a new harness joins:
   - Claude Code — the vendored skill (compared in the vendored-skill check) is the only hub-side asset; nothing else to verify.
   - omp — when `.omp/` exists: the rules pack (`.omp/rules/ws-*.md`, `openwiki-freshness.md`) and `.omp/hooks/post/openwiki-freshness.ts` are present and match the plugin templates (offer refresh); `.omp/config.yml` present (report-only — user config is never overwritten). When `.omp/` is absent and the user works with omp, offer the init verb's step-5b omp preset flow. Also check for the `@wsagency/omp-ws` native extension (`omp plugin list`); when absent, mention it (guard + enforcement parity — see docs/how-to/omp-setup.md) without treating it as a failure.
7. **Knowledge freshness** — when `openwiki/` exists: compare `type: working` (legacy hubs: entries with neither `type` nor `role`) sub-repo `dev-docs/` mtimes (excluding `dev-docs/tickets/`; input/output repos and the hub's own `dev-docs/` are never compared — the wiki does not index them) against `openwiki/.last-update.json`. Stale → print the exact prompted refresh command (`openwiki --update "Refresh; re-scan sub-repos: <working-repo list from project.yaml>"`) and ask before running it — a refresh costs tokens.
8. **Verdict** — render one line per check (`✓` ok / `~` fixed / `✗` needs the user), then: what was fixed, what was deliberately left alone and why, and a closing line — either `Ready for development — cd <hub> && ./invoke-ai.sh` or `Not ready: <blocking items>`.

## When you finish

A multi-step verb ends by telling the user, in two or three sentences, what
landed and where it went, then the single most likely next move plus one
alternative — each a real entry point (`/ws-*` command or `ws-*` skill). Never
a bullet dump, never "let me know how you'd like to proceed". Route by the verb
just run (ADR 0008):

- **`init`** → hub created at `<path>` with N repos registered (and any adopted
  product dev-docs lifted). Next: `/ws-docs init` to scaffold each repo's
  dual-track docs; alternative `/ws-hub doctor` to verify the new hub.
- **`doctor`** → reported the checks, fixed/skipped counts, and the verdict.
  Next, only if `Not ready`: re-run `/ws-hub doctor` in fix posture after
  addressing the blocking items; alternative `/ws-hub update` when the
  conventions-version check was the blocker.
- **`update`** → migrated to vN with per-repo changes listed (or "partially
  migrated" naming the unfinished steps). Next: `/ws-hub doctor` to confirm the
  hub is consistent post-migration; alternative `/ws-docs init` if the move
  brought fresh product dev-docs to document.
- **`intake`** → processed M deliveries into `dev-docs/scoping/` and raised K
  ADRs/tickets. Next: `/ws-docs adr` (product scope) for decisions that still
  need a record; alternative `ws-to-spec` for the change in the target working
  repo.
- **`repos` / `add` / `describe` / `status` / `docs` / `explained`** → state
  what changed and where, then point at the natural follow-up for that verb
  (`/ws-hub status` after `repos`/`add`; `/ws-hub doctor` after `describe`; the
  OpenWiki refresh offer after `docs`; the ws-artefacts registration block after
  `explained`).
