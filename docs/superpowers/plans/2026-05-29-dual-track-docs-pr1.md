# Dual-Track Docs — PR 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revise the docs-agent plugin to support dual-track documentation (user-facing `docs/` + internal `dev-docs/`) without creating any new commands or migrating the marketplace yet.

**Architecture:** One new knowledge skill (`dual-track-docs`) acts as the single source of truth. All existing docs-agent skills get a short cross-reference to it. Existing commands hard-code their new destinations (e.g. `/adr` → `dev-docs/decisions/`) or prompt the user for audience (`/docs-howto`, `/docs-reference`, `/docs-explanation`) and route accordingly. Agents accept a documented `destination_track` input. Marketplace version bumps to docs-agent 2.1.0.

**Tech Stack:** Markdown skill/command files with YAML frontmatter, JSON plugin manifests. No code execution — verification is by grep and JSON validation.

---

## File Structure

**New files (1):**

- `plugins/docs-agent/skills/dual-track-docs/SKILL.md` — convention single-source-of-truth

**Modified skill files (5):**

- `plugins/docs-agent/skills/diataxis/SKILL.md` — note that it's primarily for `docs/` track
- `plugins/docs-agent/skills/style-guide/SKILL.md` — split prose vs code style sections
- `plugins/docs-agent/skills/conventional-commits/SKILL.md` — mark as dev-doc reference
- `plugins/docs-agent/skills/keep-a-changelog/SKILL.md` — document root→docs mirror
- `plugins/docs-agent/skills/adr/SKILL.md` — note destination is `dev-docs/decisions/`

**Modified command files (10):**

- `plugins/docs-agent/commands/docs.md` — content router across both tracks
- `plugins/docs-agent/commands/docs-howto.md` — audience prompt
- `plugins/docs-agent/commands/docs-reference.md` — audience prompt
- `plugins/docs-agent/commands/docs-explanation.md` — audience prompt
- `plugins/docs-agent/commands/adr.md` — hard-coded `dev-docs/decisions/`
- `plugins/docs-agent/commands/architecture.md` — hard-coded `dev-docs/architecture.md`
- `plugins/docs-agent/commands/contributing.md` — 3-file generator
- `plugins/docs-agent/commands/changelog.md` — root + mirror
- `plugins/docs-agent/commands/changelog-entry.md` — root + mirror
- `plugins/docs-agent/commands/release-notes.md` — `docs/release-notes/`

**Modified agent files (8):**

- `plugins/docs-agent/agents/tutorial-writer.md`
- `plugins/docs-agent/agents/api-documenter.md`
- `plugins/docs-agent/agents/changelog-analyzer.md`
- `plugins/docs-agent/agents/adr-writer.md`
- `plugins/docs-agent/agents/contributing-generator.md`
- `plugins/docs-agent/agents/architecture-documenter.md`
- `plugins/docs-agent/agents/release-notes-writer.md`
- `plugins/docs-agent/agents/docs-architect.md`

**Modified manifests (2):**

- `plugins/docs-agent/.claude-plugin/plugin.json` — description tweak
- `.claude-plugin/marketplace.json` — version bump

**Modified docs (1):**

- `plugins/docs-agent/UPGRADE-NOTES.md` — append v2.1.0 section

---

### Task 1: Create `dual-track-docs` skill

**Files:**
- Create: `plugins/docs-agent/skills/dual-track-docs/SKILL.md`

- [ ] **Step 1: Write the skill file**

Content:

```markdown
---
description: Convention for splitting documentation into user-facing (docs/) and internal contributor (dev-docs/) tracks. Use when scaffolding documentation, deciding where a new doc belongs, or migrating an existing single-track docs layout.
triggers:
  - user docs
  - dev docs
  - documentation structure
  - where should this go
  - split docs
  - docs/ vs dev-docs/
  - dual-track
---

# Dual-Track Documentation Convention

Documentation belongs in one of two parallel tracks based on audience:

| Track | Folder | Audience | Examples |
|---|---|---|---|
| User | `docs/` | External consumer — end-users, library clients, API consumers, plugin users | Tutorials, how-to guides, public API reference, conceptual explanations |
| Internal | `dev-docs/` | Internal contributor — maintainers, dev team | Architecture, ADRs, runbooks, internal module reference, code conventions |

The distinction is **audience**, not technical complexity. An API reference for external consumers belongs in `docs/`. A reference for internal modules belongs in `dev-docs/`.

## Standard layout

\`\`\`
<project>/
├── README.md                 ← landing, links to both tracks
├── CHANGELOG.md              ← single source (Keep-a-Changelog)
├── CONTRIBUTING.md           ← thin router → docs/contributing + dev-docs/development
├── CLAUDE.md                 ← AI instructions (stays at root)
│
├── docs/                     ← USER docs (Diátaxis, VitePress-portable)
│   ├── index.md
│   ├── tutorials/
│   ├── how-to/
│   ├── reference/
│   ├── explanation/
│   ├── changelog.md          ← MIRROR of root CHANGELOG.md
│   ├── contributing.md
│   └── release-notes/
│
└── dev-docs/                 ← INTERNAL docs
    ├── index.md
    ├── architecture.md
    ├── development.md
    ├── decisions/            ← ADRs
    ├── runbooks/
    ├── reference/
    └── explanation/
\`\`\`

## Routing rules for docs-agent commands

| Command | Destination |
|---|---|
| `/docs` | Both tracks per Diátaxis category and audience |
| `/docs-tutorial` | `docs/tutorials/` (always user) |
| `/docs-howto` | Prompts audience → `docs/how-to/` or `dev-docs/runbooks/` |
| `/docs-reference` | Prompts audience → `docs/reference/` or `dev-docs/reference/` |
| `/docs-explanation` | Prompts audience → `docs/explanation/` or `dev-docs/explanation/` |
| `/adr` | `dev-docs/decisions/` (always internal) |
| `/architecture` | `dev-docs/architecture.md` (always internal) |
| `/contributing` | 3 files: root router, `docs/contributing.md`, `dev-docs/development.md` |
| `/changelog`, `/changelog-entry` | Root `CHANGELOG.md` + mirror to `docs/changelog.md` |
| `/release-notes` | `docs/release-notes/` |

## Audience prompt

For commands that span both tracks, prompt the user once per invocation:

> Who reads this? **External user** (consumer / end-user / library client) **or Internal contributor** (maintainer / dev team)?

The answer can be cached for the session as a default, or persisted in `.claude/docs-config.yaml`:

\`\`\`yaml
docs:
  default_audience: user    # user | dev | ask
  user_track: docs
  dev_track: dev-docs
\`\`\`

If the config file exists and `default_audience` is `user` or `dev`, skip the prompt.

## Changelog mirror

The canonical changelog lives at the repo root (`CHANGELOG.md`) for GitHub's auto-detection. The user-facing site needs the same content under `docs/`. Commands that touch the changelog (`/changelog`, `/changelog-entry`) always update both:

1. Write or edit `CHANGELOG.md` at the root
2. Copy the full contents to `docs/changelog.md` (overwrites — single source remains root)

## CONTRIBUTING split

`/contributing` produces three files:

1. **`CONTRIBUTING.md` (root)** — thin router (~5 lines):
   \`\`\`markdown
   # Contributing

   Thanks for your interest in this project.

   - **Reporting bugs or requesting features?** See [docs/contributing.md](docs/contributing.md).
   - **Setting up the project to contribute code?** See [dev-docs/development.md](dev-docs/development.md).
   \`\`\`
2. **`docs/contributing.md`** — user-side: how to file issues, propose features, ask questions
3. **`dev-docs/development.md`** — dev-side: local setup, code style, test commands, conventional commits

## VitePress portability

`docs/` is structured to work as a VitePress source directory with no additional config (option A from the design spec). Each Diátaxis subfolder has an `index.md`. Markdown uses YAML frontmatter only where useful. No `.vitepress/` config is generated — users add VitePress themselves if they want.

## When NOT to use this convention

- Single-audience projects (purely internal tools, or purely user-facing libraries with no maintainers expected to read internal docs)
- Truly tiny projects with one or two doc pages — overhead of two folders is not worth it
- Wikis or external docs platforms that already enforce their own structure
```

- [ ] **Step 2: Verify frontmatter and structure**

Run:

```bash
head -15 plugins/docs-agent/skills/dual-track-docs/SKILL.md | grep -E '^(description|triggers):' && echo "frontmatter OK"
wc -l plugins/docs-agent/skills/dual-track-docs/SKILL.md
```

Expected: `frontmatter OK` and approximately 90-120 lines.

- [ ] **Step 3: Commit**

```bash
git add plugins/docs-agent/skills/dual-track-docs/
git commit -m "feat(docs-agent): add dual-track-docs convention skill"
```

---

### Task 2: Revise existing skills (5 files)

Each existing skill gets a short cross-reference to `dual-track-docs` plus any track-specific notes from the design spec.

**Files:**
- Modify: `plugins/docs-agent/skills/diataxis/SKILL.md`
- Modify: `plugins/docs-agent/skills/style-guide/SKILL.md`
- Modify: `plugins/docs-agent/skills/conventional-commits/SKILL.md`
- Modify: `plugins/docs-agent/skills/keep-a-changelog/SKILL.md`
- Modify: `plugins/docs-agent/skills/adr/SKILL.md`

- [ ] **Step 1: Append note to `diataxis/SKILL.md`**

Append at the end of the file:

```markdown

## Relationship to the dual-track docs convention

This skill describes the Diátaxis framework in general. In the WS Agency convention (see the `dual-track-docs` skill), Diátaxis is primarily applied to the user track (`docs/`). The internal track (`dev-docs/`) uses a Diátaxis-like substructure (`runbooks/`, `reference/`, `explanation/`) but with the maintainer audience instead of the external user.

When picking a Diátaxis quadrant for a new doc, decide audience first:
- **External user** → goes in `docs/<quadrant>/`
- **Internal contributor** → goes in `dev-docs/<quadrant-or-runbook>/`
```

- [ ] **Step 2: Update `style-guide/SKILL.md` — split into two sections**

Open the file and find the existing top-level structure. After the first heading (`# Style Guide` or similar), insert a "Two scopes" preamble at the top of the body content:

```markdown
## Two scopes — prose vs code

This skill covers two different style guides:

1. **Prose style** — for user-facing documentation in `docs/`. Active voice, present tense, second person, Google/Microsoft writing standards. Use this when writing tutorials, how-tos, reference, and explanations for external consumers.

2. **Code style** — for internal code conventions documented in `dev-docs/development.md`. Naming, formatting, language-specific patterns. Use this when generating or updating the contributor development guide.

Sections below are clearly labeled "[Prose]" or "[Code]". When neither label is present, the guidance applies to both.

---
```

If the file already has top-level sections, label each existing section as `[Prose]` or `[Code]` based on its content. If a section applies to both, leave it unlabeled.

- [ ] **Step 3: Update `conventional-commits/SKILL.md`**

Append at the end of the file:

```markdown

## Where this lives in the dual-track convention

Conventional Commits is a developer-facing convention. In projects using the `dual-track-docs` convention, the commit format documentation belongs in `dev-docs/development.md`, not in user-facing `docs/`. The `/contributing` command places it there automatically.
```

- [ ] **Step 4: Update `keep-a-changelog/SKILL.md`**

Append at the end of the file:

```markdown

## Single source + mirror

In the dual-track-docs convention, the canonical `CHANGELOG.md` lives at the repo root for GitHub's auto-detection. A copy is mirrored to `docs/changelog.md` for inclusion in the VitePress user-facing site. The `/changelog` and `/changelog-entry` commands always update both — the root file is the source of truth, the mirror is a build artifact.
```

- [ ] **Step 5: Update `adr/SKILL.md`**

Find every occurrence of `docs/decisions/` and replace with `dev-docs/decisions/`. Then append:

```markdown

## Destination in the dual-track convention

ADRs are internal contributor documentation. They live in `dev-docs/decisions/`, never in user-facing `docs/`. The `/adr` command always writes there.
```

- [ ] **Step 6: Commit**

```bash
git add plugins/docs-agent/skills/
git commit -m "docs(docs-agent): cross-reference dual-track-docs from existing skills"
```

---

### Task 3: Revise `/docs` command

**Files:**
- Modify: `plugins/docs-agent/commands/docs.md`

- [ ] **Step 1: Read the current command**

```bash
cat plugins/docs-agent/commands/docs.md
```

- [ ] **Step 2: Rewrite the "Your Task" section**

The full revised command file should be:

```markdown
---
description: Generate a complete documentation suite following Diátaxis and the dual-track docs convention
arguments:
  - name: scope
    description: "Scope: 'user' (only docs/), 'dev' (only dev-docs/), or 'both' (default)"
    required: false
allowed_tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Task
---

# Generate Documentation Suite

Generate a complete dual-track documentation suite for this project. Follows the `dual-track-docs` convention: user-facing content goes into `docs/`, internal contributor content goes into `dev-docs/`.

## Your Task

1. **Load the convention** — read the `dual-track-docs` skill for the full rules.
2. **Determine scope** — default to both tracks if `{{ scope }}` is unset; otherwise honor `user` or `dev`.
3. **Scaffold missing structure** — ensure `docs/{tutorials,how-to,reference,explanation}/` and `dev-docs/{decisions,runbooks,reference,explanation}/` exist (with `index.md` stubs in each). Never overwrite existing files.
4. **Analyze the project** — read README, package manifests, top-level source structure to understand what to document.
5. **Generate content per audience**:
   - **User track (`docs/`)** — tutorials for external consumers, how-tos for user tasks, reference for public APIs/CLIs, explanations of user-facing concepts.
   - **Dev track (`dev-docs/`)** — architecture overview, runbooks for contributor tasks (e.g. adding a feature, releasing), reference for internal modules, explanations of internal patterns.
6. **Wire the changelog mirror** — if `CHANGELOG.md` exists at the root, ensure `docs/changelog.md` is a current copy.
7. **Generate the router `CONTRIBUTING.md`** — only if missing — pointing to `docs/contributing.md` and `dev-docs/development.md`.

## Routing decisions

When a topic is ambiguous (could go in either track), default to **dev** track for anything maintenance-related, **user** track for anything an external consumer would search for.

## Skills to Use

- `dual-track-docs` — convention single source of truth
- `diataxis` — quadrant definitions
- `style-guide` — prose (user) vs code (dev) style
- `keep-a-changelog` — for the mirror

## Agents

- `docs-architect` — high-level structure planning
- `tutorial-writer` — writes tutorials (always user track)
- `api-documenter` — writes reference (audience determined by command)
- `architecture-documenter` — writes `dev-docs/architecture.md`
- `contributing-generator` — writes the 3-file CONTRIBUTING set

Pass `destination_track: user` or `destination_track: dev` to agents whose audience is ambiguous.
```

Write this exact content to `plugins/docs-agent/commands/docs.md`.

- [ ] **Step 3: Verify frontmatter parses**

Run:

```bash
head -20 plugins/docs-agent/commands/docs.md | grep -E '^(description|arguments|allowed_tools):' && echo "frontmatter OK"
```

Expected: `frontmatter OK`.

- [ ] **Step 4: Commit**

```bash
git add plugins/docs-agent/commands/docs.md
git commit -m "feat(docs-agent): /docs scaffolds and writes across both tracks"
```

---

### Task 4: Add audience prompt to `/docs-howto`, `/docs-reference`, `/docs-explanation`

These three commands share the same audience-routing logic. Each gets the same prompt template inserted.

**Files:**
- Modify: `plugins/docs-agent/commands/docs-howto.md`
- Modify: `plugins/docs-agent/commands/docs-reference.md`
- Modify: `plugins/docs-agent/commands/docs-explanation.md`

- [ ] **Step 1: Define the shared audience-routing snippet**

This text will be inserted into each of the three commands (with the destination paths swapped per quadrant):

```markdown
## Audience routing

Before writing anything, determine the audience:

1. Read `.claude/docs-config.yaml` if it exists. If `docs.default_audience` is `user` or `dev`, use that without prompting.
2. Otherwise, ask the user via AskUserQuestion:
   > Who reads this? **External user** (consumer / end-user / library client) **or Internal contributor** (maintainer / dev team)?
3. Cache the answer in the session for any further docs commands.

Destination based on the answer:
- **user** → `<USER_DESTINATION>`
- **dev** → `<DEV_DESTINATION>`
```

For each command, `<USER_DESTINATION>` and `<DEV_DESTINATION>` are:

| Command | User destination | Dev destination |
|---|---|---|
| `/docs-howto` | `docs/how-to/<slug>.md` | `dev-docs/runbooks/<slug>.md` |
| `/docs-reference` | `docs/reference/<slug>.md` | `dev-docs/reference/<slug>.md` |
| `/docs-explanation` | `docs/explanation/<slug>.md` | `dev-docs/explanation/<slug>.md` |

- [ ] **Step 2: Update `/docs-howto`**

Open `plugins/docs-agent/commands/docs-howto.md`. Find the section that describes where the file is written (typically a "Your Task" or "Process" section mentioning `docs/how-to/`). Replace the destination references with the audience-routing snippet (paths filled in for how-to: `docs/how-to/<slug>.md` and `dev-docs/runbooks/<slug>.md`).

Also update `allowed_tools` to include `AskUserQuestion` if not already present.

- [ ] **Step 3: Update `/docs-reference`**

Same as Step 2, but with reference paths: `docs/reference/<slug>.md` and `dev-docs/reference/<slug>.md`.

- [ ] **Step 4: Update `/docs-explanation`**

Same as Step 2, but with explanation paths: `docs/explanation/<slug>.md` and `dev-docs/explanation/<slug>.md`.

- [ ] **Step 5: Verify all three contain the audience routing**

Run:

```bash
for f in plugins/docs-agent/commands/docs-howto.md plugins/docs-agent/commands/docs-reference.md plugins/docs-agent/commands/docs-explanation.md; do
  grep -q "Audience routing" "$f" && echo "$f: OK" || echo "$f: MISSING"
done
```

Expected: all three lines end with `OK`.

- [ ] **Step 6: Commit**

```bash
git add plugins/docs-agent/commands/docs-howto.md plugins/docs-agent/commands/docs-reference.md plugins/docs-agent/commands/docs-explanation.md
git commit -m "feat(docs-agent): audience prompt routes howto/reference/explanation to correct track"
```

---

### Task 5: Hard-code dev destinations in `/adr` and `/architecture`

**Files:**
- Modify: `plugins/docs-agent/commands/adr.md`
- Modify: `plugins/docs-agent/commands/architecture.md`

- [ ] **Step 1: Update `/adr`**

In `plugins/docs-agent/commands/adr.md`, find every occurrence of `docs/decisions/` and replace with `dev-docs/decisions/`. There are two known occurrences in the current file (paths around lines 18 and 30 in the version checked in).

Use:

```bash
sed -i.bak 's|docs/decisions/|dev-docs/decisions/|g' plugins/docs-agent/commands/adr.md && rm plugins/docs-agent/commands/adr.md.bak
```

Then verify:

```bash
grep -n 'docs/decisions/' plugins/docs-agent/commands/adr.md && echo "STALE PATH FOUND" || echo "clean"
grep -n 'dev-docs/decisions/' plugins/docs-agent/commands/adr.md
```

Expected: `clean`, and at least 2 lines matching the new path.

- [ ] **Step 2: Update `/architecture`**

In `plugins/docs-agent/commands/architecture.md`, find references to the output path. The current command writes to either `ARCHITECTURE.md` at root or `docs/ARCHITECTURE.md`. Replace these with `dev-docs/architecture.md`.

Read the file first:

```bash
cat plugins/docs-agent/commands/architecture.md
```

Then do targeted replacements (the exact `old_string` depends on what's in the file — apply Edit to replace the output path lines, leaving the rest of the command's instructions intact). After editing, verify:

```bash
grep -n 'dev-docs/architecture.md' plugins/docs-agent/commands/architecture.md
grep -nE 'ARCHITECTURE\.md|docs/ARCHITECTURE' plugins/docs-agent/commands/architecture.md && echo "OLD PATH STILL PRESENT" || echo "clean"
```

Expected: at least one match for `dev-docs/architecture.md`, and `clean` for the second check.

- [ ] **Step 3: Commit**

```bash
git add plugins/docs-agent/commands/adr.md plugins/docs-agent/commands/architecture.md
git commit -m "feat(docs-agent): /adr and /architecture write to dev-docs/"
```

---

### Task 6: Convert `/contributing` into a 3-file generator

**Files:**
- Modify: `plugins/docs-agent/commands/contributing.md`

- [ ] **Step 1: Rewrite the "Your Task" section**

The full revised command file should be:

```markdown
---
description: Generate a 3-file CONTRIBUTING set: thin root router, user-facing docs/contributing.md, and internal dev-docs/development.md
arguments:
  - name: output-path
    description: Override the default routing (rarely needed)
    required: false
allowed_tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
---

# Generate Contributing Guide (3 files)

Per the `dual-track-docs` convention, contributing information lives in three files: a thin router at the repo root, user-facing guidance in `docs/contributing.md`, and internal dev-setup guidance in `dev-docs/development.md`.

## Your Task

1. **Scan the project** for tooling, configuration, conventions, package manager, linting tools, test framework, CI setup, and git hooks. Use the `contributing-generator` agent.
2. **Generate three files**:

   **Root `CONTRIBUTING.md`** — exactly the following content (no project-specific text):

   \`\`\`markdown
   # Contributing

   Thanks for your interest in this project.

   - **Reporting bugs or requesting features?** See [docs/contributing.md](docs/contributing.md).
   - **Setting up the project to contribute code?** See [dev-docs/development.md](dev-docs/development.md).
   \`\`\`

   **`docs/contributing.md`** (user-facing) — covers:
   - How to file a bug report (link to issues, what to include)
   - How to propose a feature
   - How to ask a question / get support
   - Code of Conduct reference (if present)

   **`dev-docs/development.md`** (internal) — covers:
   - Local setup steps (from package manager / lockfile detection)
   - Test commands (from project's actual test config)
   - Lint and format commands
   - Conventional Commits requirement (link to `conventional-commits` skill content)
   - PR workflow (branch naming, review process, CI gates)
   - Code style notes (from `style-guide` skill, code section)

3. **Verify** that any commands documented in `dev-docs/development.md` actually exist in the project (e.g. if you write `npm test`, ensure `test` is a script in `package.json`).
4. **Do not overwrite** existing files without warning the user. If any of the three target files already exist, show a diff and ask before writing.

## Skills to Use

- `dual-track-docs` — convention rules
- `conventional-commits` — commit format reference for `dev-docs/development.md`
- `style-guide` — prose style for user file, code style for dev file

## Agents

- `contributing-generator` — pass `destination_track` per file as needed; the agent splits content by audience.
```

Write this content to `plugins/docs-agent/commands/contributing.md`.

- [ ] **Step 2: Verify**

```bash
grep -E 'docs/contributing\.md|dev-docs/development\.md|root router' plugins/docs-agent/commands/contributing.md
```

Expected: at least 3 matching lines.

- [ ] **Step 3: Commit**

```bash
git add plugins/docs-agent/commands/contributing.md
git commit -m "feat(docs-agent): /contributing generates 3 files (root router + user + dev)"
```

---

### Task 7: Add mirror logic to `/changelog` and `/changelog-entry`

**Files:**
- Modify: `plugins/docs-agent/commands/changelog.md`
- Modify: `plugins/docs-agent/commands/changelog-entry.md`

- [ ] **Step 1: Add mirror step to `/changelog`**

Open `plugins/docs-agent/commands/changelog.md`. After the existing instructions that write to `CHANGELOG.md`, append a new section:

```markdown
## Mirror to docs/

After writing or updating the root `CHANGELOG.md`, also mirror its contents to `docs/changelog.md` so the user-facing site has the same version history. The mirror is a build artifact — never edit it directly; always write through the root file first.

Implementation:
1. Read the final contents of `CHANGELOG.md`.
2. Ensure `docs/` exists (create if missing).
3. Write the same contents to `docs/changelog.md` (overwriting).

If the project doesn't use the dual-track-docs convention (no `docs/` directory and no `.claude/docs-config.yaml`), skip the mirror step silently.
```

- [ ] **Step 2: Add mirror step to `/changelog-entry`**

Open `plugins/docs-agent/commands/changelog-entry.md`. Append the same "Mirror to docs/" section as in Step 1.

- [ ] **Step 3: Verify**

```bash
for f in plugins/docs-agent/commands/changelog.md plugins/docs-agent/commands/changelog-entry.md; do
  grep -q "Mirror to docs" "$f" && echo "$f: OK" || echo "$f: MISSING"
done
```

Expected: both `OK`.

- [ ] **Step 4: Commit**

```bash
git add plugins/docs-agent/commands/changelog.md plugins/docs-agent/commands/changelog-entry.md
git commit -m "feat(docs-agent): changelog commands mirror to docs/changelog.md"
```

---

### Task 8: Point `/release-notes` at `docs/release-notes/`

**Files:**
- Modify: `plugins/docs-agent/commands/release-notes.md`

- [ ] **Step 1: Read current command**

```bash
cat plugins/docs-agent/commands/release-notes.md
```

- [ ] **Step 2: Update output destination**

Find any reference to the output location (typically `docs/release-notes/` or unspecified) and ensure it's set to `docs/release-notes/<version>.md` for the user-facing track. If the current command's instructions are vague about location, insert this section near the top of "Your Task":

```markdown
## Destination

Release notes are user-facing. Always write to `docs/release-notes/<version>.md` (where `<version>` is e.g. `v1.2.0`). If the `docs/` directory doesn't exist yet, create it. Do not write release notes to `dev-docs/` — that's for internal contributor docs only.
```

- [ ] **Step 3: Verify**

```bash
grep -n 'docs/release-notes/' plugins/docs-agent/commands/release-notes.md
grep -n 'dev-docs' plugins/docs-agent/commands/release-notes.md && echo "DEV-DOCS REFERENCED — verify intent" || echo "user-only as expected"
```

Expected: at least one match for `docs/release-notes/`, and `user-only as expected`.

- [ ] **Step 4: Commit**

```bash
git add plugins/docs-agent/commands/release-notes.md
git commit -m "feat(docs-agent): /release-notes writes to docs/release-notes/"
```

---

### Task 9: Document `destination_track` input on agents

Each agent gets a short "## Inputs" section explaining the new optional parameter. No content-generation logic changes — agents read the parameter from their invoking prompt.

**Files:**
- Modify: `plugins/docs-agent/agents/tutorial-writer.md`
- Modify: `plugins/docs-agent/agents/api-documenter.md`
- Modify: `plugins/docs-agent/agents/changelog-analyzer.md`
- Modify: `plugins/docs-agent/agents/adr-writer.md`
- Modify: `plugins/docs-agent/agents/contributing-generator.md`
- Modify: `plugins/docs-agent/agents/architecture-documenter.md`
- Modify: `plugins/docs-agent/agents/release-notes-writer.md`
- Modify: `plugins/docs-agent/agents/docs-architect.md`

- [ ] **Step 1: Define the shared snippet**

The following section gets appended to each of the 8 agent files:

```markdown

## Inputs

The invoking command may pass these structured inputs in your prompt:

- **`destination_track`** — `user` (write into `docs/`) or `dev` (write into `dev-docs/`). Required for agents whose audience is ambiguous; ignored by agents that always target one track (e.g. `adr-writer` always writes to `dev-docs/decisions/`).
- **`destination_path`** — an explicit output path that overrides the track default. Use this when the command has already resolved the exact target.

If neither is supplied, default per the routing rules in the `dual-track-docs` skill.
```

For `adr-writer`, modify the wording slightly to:

```markdown

## Inputs

ADRs always live in `dev-docs/decisions/` — no `destination_track` is needed. The invoking command may pass:

- **`destination_path`** — explicit output path that overrides the default (rarely needed).
```

- [ ] **Step 2: Append the snippet to each agent file**

Apply to the 7 generic agents (everyone except `adr-writer`):

```bash
for f in plugins/docs-agent/agents/tutorial-writer.md \
         plugins/docs-agent/agents/api-documenter.md \
         plugins/docs-agent/agents/changelog-analyzer.md \
         plugins/docs-agent/agents/contributing-generator.md \
         plugins/docs-agent/agents/architecture-documenter.md \
         plugins/docs-agent/agents/release-notes-writer.md \
         plugins/docs-agent/agents/docs-architect.md; do
  cat >> "$f" <<'EOF'

## Inputs

The invoking command may pass these structured inputs in your prompt:

- **`destination_track`** — `user` (write into `docs/`) or `dev` (write into `dev-docs/`). Required for agents whose audience is ambiguous; ignored by agents that always target one track.
- **`destination_path`** — an explicit output path that overrides the track default. Use this when the command has already resolved the exact target.

If neither is supplied, default per the routing rules in the `dual-track-docs` skill.
EOF
done
```

Then append the ADR-specific variant to `adr-writer`:

```bash
cat >> plugins/docs-agent/agents/adr-writer.md <<'EOF'

## Inputs

ADRs always live in `dev-docs/decisions/` — no `destination_track` is needed. The invoking command may pass:

- **`destination_path`** — explicit output path that overrides the default (rarely needed).
EOF
```

- [ ] **Step 3: Verify all 8 files have the new section**

```bash
for f in plugins/docs-agent/agents/*.md; do
  grep -q "^## Inputs" "$f" && echo "$f: OK" || echo "$f: MISSING"
done
```

Expected: 8 `OK` lines.

- [ ] **Step 4: Commit**

```bash
git add plugins/docs-agent/agents/
git commit -m "feat(docs-agent): document destination_track input on agents"
```

---

### Task 10: Append v2.1.0 section to UPGRADE-NOTES, bump versions, update plugin description

**Files:**
- Modify: `plugins/docs-agent/UPGRADE-NOTES.md`
- Modify: `plugins/docs-agent/.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Append v2.1.0 section to UPGRADE-NOTES**

Prepend (not append) to `plugins/docs-agent/UPGRADE-NOTES.md` so the newest version is first. Specifically, insert this block right after the file's existing `#` heading and before the first `## What Changed in v2.0.0`:

```markdown
# docs-agent v2.1.0 — Dual-track docs convention

## What Changed in v2.1.0

### New Skill
- **dual-track-docs** — Single source of truth for the user-facing (`docs/`) vs internal contributor (`dev-docs/`) split. All other skills and commands cross-reference it.

### Revised Skills
- **diataxis** — Notes that the framework is primarily for the user track; `dev-docs/` uses a parallel substructure.
- **style-guide** — Now labeled into two scopes: prose style (for `docs/`) and code style (for `dev-docs/development.md`).
- **conventional-commits** — Explicitly marked as dev-doc reference.
- **keep-a-changelog** — Documents the root→`docs/changelog.md` mirror.
- **adr** — Destination updated to `dev-docs/decisions/`.

### Revised Commands
- `/docs` — Scaffolds and generates content across both tracks.
- `/docs-howto`, `/docs-reference`, `/docs-explanation` — Prompt the user for audience (or read `.claude/docs-config.yaml`), then route to the correct track.
- `/adr`, `/architecture` — Always write to `dev-docs/`.
- `/contributing` — Generates 3 files: root router, `docs/contributing.md`, `dev-docs/development.md`.
- `/changelog`, `/changelog-entry` — Mirror to `docs/changelog.md` after writing the root file.
- `/release-notes` — Writes to `docs/release-notes/`.

### Agent updates
All 8 agents now document a `destination_track` input (`user` or `dev`) that the invoking command may pass.

## Migrating Existing Projects

If you adopt v2.1.0 on a project that already has docs in a single `docs/` folder:

1. Decide which existing files belong to the user track vs. dev track.
2. Create `dev-docs/` and move contributor-only docs (architecture, ADRs, internal runbooks) there.
3. Run `/contributing` to regenerate the 3-file CONTRIBUTING set.
4. If `CHANGELOG.md` exists at the root, copy it to `docs/changelog.md` to seed the mirror.

This is intentionally manual for PR 1. A `/docs-init` scaffold command (PR 2) and migration tooling (PR 3 for the marketplace itself) follow in subsequent releases.

---
```

- [ ] **Step 2: Bump version in plugin.json**

The existing `plugins/docs-agent/.claude-plugin/plugin.json` doesn't carry a version field (per WS convention versions live in marketplace.json). Update only the `description`:

Read current:

```bash
cat plugins/docs-agent/.claude-plugin/plugin.json
```

Then edit the `description` field to:

```
Dual-track documentation generation suite (user docs in docs/, contributor docs in dev-docs/): Diátaxis framework, Keep a Changelog with mirror, Architecture Decision Records (MADR v4.0.0), CONTRIBUTING 3-file set, ARCHITECTURE.md, release notes, Conventional Commits, style guide enforcement, TSDoc/GraphQL API reference, and docs-as-code workflows
```

Use Edit tool to replace only the `description` line; preserve `name` and `author`.

- [ ] **Step 3: Bump version in marketplace.json**

Edit `.claude-plugin/marketplace.json`. Find the `docs-agent` plugin entry. Change `"version": "2.0.0"` to `"version": "2.1.0"`. Update its `description` to match the new plugin.json description.

Verify the JSON is still valid:

```bash
python3 -c "import json; json.load(open('.claude-plugin/marketplace.json')); print('OK')"
```

- [ ] **Step 4: Final verification — file integrity sweep**

Run all sanity checks together:

```bash
echo "=== JSON validity ==="
python3 -c "import json; json.load(open('.claude-plugin/marketplace.json')); json.load(open('plugins/docs-agent/.claude-plugin/plugin.json')); print('JSON OK')"

echo "=== Version bumped ==="
grep -A1 '"name": "docs-agent"' .claude-plugin/marketplace.json | grep '"version": "2.1.0"' && echo "version OK" || echo "VERSION NOT BUMPED"

echo "=== New skill present ==="
test -f plugins/docs-agent/skills/dual-track-docs/SKILL.md && echo "skill OK" || echo "SKILL MISSING"

echo "=== No stale docs/decisions/ in adr command ==="
grep -n 'docs/decisions/' plugins/docs-agent/commands/adr.md && echo "STALE" || echo "adr OK"

echo "=== Audience routing in all three ambiguous commands ==="
for f in plugins/docs-agent/commands/docs-howto.md plugins/docs-agent/commands/docs-reference.md plugins/docs-agent/commands/docs-explanation.md; do
  grep -q "Audience routing" "$f" && echo "$f: OK" || echo "$f: MISSING"
done

echo "=== Mirror logic in changelog commands ==="
for f in plugins/docs-agent/commands/changelog.md plugins/docs-agent/commands/changelog-entry.md; do
  grep -q "Mirror to docs" "$f" && echo "$f: OK" || echo "$f: MISSING"
done

echo "=== destination_track on all 8 agents ==="
for f in plugins/docs-agent/agents/*.md; do
  grep -q "^## Inputs" "$f" && echo "$f: OK" || echo "$f: MISSING"
done
```

Expected: every line ends with `OK`. No `STALE`, `MISSING`, or `VERSION NOT BUMPED`.

- [ ] **Step 5: Commit and push**

```bash
git add plugins/docs-agent/UPGRADE-NOTES.md \
        plugins/docs-agent/.claude-plugin/plugin.json \
        .claude-plugin/marketplace.json
git commit -m "$(cat <<'EOF'
feat(docs-agent): bump to v2.1.0 with dual-track docs convention

Bumps version, updates plugin description, and prepends v2.1.0 section
to UPGRADE-NOTES.md describing the new dual-track-docs skill, revised
existing skills, revised commands, and the destination_track input
on agents.

Refs: docs/superpowers/specs/2026-05-29-dual-track-docs-design.md
Refs: docs/superpowers/plans/2026-05-29-dual-track-docs-pr1.md

Co-Authored-By: WS Agency AI suite <ai@ws.agency>
EOF
)"

git push
```

Expected: push succeeds; no merge conflicts.

---

## Self-Review Notes

**Spec coverage:**
- New `dual-track-docs` skill → Task 1 ✓
- All 5 skill revisions → Task 2 ✓
- `/docs` revision → Task 3 ✓
- 3 audience-prompt commands → Task 4 ✓
- `/adr`, `/architecture` → Task 5 ✓
- `/contributing` 3-file → Task 6 ✓
- `/changelog`, `/changelog-entry` mirror → Task 7 ✓
- `/release-notes` destination → Task 8 ✓
- Agent `destination_track` → Task 9 ✓
- Version bump + UPGRADE-NOTES → Task 10 ✓

**Out of scope (explicitly deferred):**
- `/docs-init`, `/devdoc-runbook`, `/dev-docs` — PR 2
- Marketplace migration — PR 3
- VitePress config generation — out of scope per spec

**Verification approach:**
Plugin markdown files have no executable tests. Verification is grep-based assertions (content patterns present) and JSON validity. End-to-end testing happens informally after install — covered in PR 2 verification.

**Commits:** One commit per task — 10 commits in PR 1. Final commit pushes.
