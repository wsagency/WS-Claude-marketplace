# Design — Dual-track documentation (docs/ + dev-docs/)

**Date:** 2026-05-29
**Status:** Approved, awaiting implementation plan
**Scope:** docs-agent plugin revisions + ws-claude-marketplace migration

## Problem

The marketplace's current `docs/` mixes content for two audiences:

- **Plugin users** (people who install plugins to use Claude Code) — need install instructions, command reference, conceptual overviews
- **Plugin contributors** (people who add plugins to this marketplace) — need plugin schema reference, architecture explanation, runbooks for adding commands/agents

Mixing them confuses both readers and makes it impossible to publish only the user-facing side as a public docs site. The docs-agent plugin, which is supposed to guide documentation across all WS projects, has no convention for handling this split.

## Goal

Split documentation into two parallel tracks across all projects that use docs-agent:

- **`docs/`** — external consumer (user-facing); publishable as VitePress site
- **`dev-docs/`** — internal contributor / maintainer; never published publicly

Revise docs-agent skills and commands to enforce this convention. Migrate the marketplace itself as the reference example.

## Convention

### Audience-based split

| Track | Audience | Examples |
|---|---|---|
| `docs/` | External consumer (end-users, library clients, API consumers, plugin users) | Tutorials, how-to guides, public API reference, conceptual explanations |
| `dev-docs/` | Internal contributor (maintainers, dev team) | Architecture, ADRs, runbooks, internal module reference, code conventions |

The distinction is **audience**, not technical/non-technical content. An API reference for external consumers belongs in `docs/`. A reference for internal modules touched only by maintainers belongs in `dev-docs/`.

### Directory layout

```
<project>/
├── README.md                 ← landing, links to both tracks
├── CHANGELOG.md              ← single source (Keep-a-Changelog)
├── CONTRIBUTING.md           ← thin router → docs/contributing + dev-docs/development
├── CLAUDE.md                 ← AI instructions (stays at root)
│
├── docs/                     ← USER docs (Diátaxis, VitePress-portable)
│   ├── index.md              ← auto-gen from README (do not overwrite if exists)
│   ├── tutorials/            ← learning-oriented (always user)
│   ├── how-to/               ← task-oriented (user tasks)
│   ├── reference/            ← info-oriented (public API/CLI/schema)
│   ├── explanation/          ← understanding-oriented (public concepts)
│   ├── changelog.md          ← MIRROR of root CHANGELOG.md
│   ├── contributing.md       ← user-facing: how to report bugs, request features
│   └── release-notes/        ← optional per-version stories
│
└── dev-docs/                 ← INTERNAL docs (maintainers/contributors)
    ├── index.md              ← contributor landing
    ├── architecture.md       ← from /architecture
    ├── development.md        ← setup, code style, conventional commits, conventions
    ├── decisions/            ← ADRs from /adr
    ├── runbooks/             ← internal operational how-tos
    ├── reference/            ← internal-only module reference
    └── explanation/          ← why-patterns, history, internal concepts
```

### Key rules

- `CONTRIBUTING.md` at root is a thin router (~3 lines). GitHub auto-detects it.
- `docs/changelog.md` is a build artifact, mirrored from root `CHANGELOG.md`. Single source remains root.
- `index.md` exists in every Diátaxis subfolder — VitePress sidebar-friendly.
- VitePress portability is **structure-only** (option A): clean markdown with optional YAML frontmatter, no `.vitepress/` config generated. Users add VitePress themselves if they want.

## Skill and command mapping

### Existing commands — revisions

| Command | Current behavior | Revised behavior |
|---|---|---|
| `/docs` | Generates full `docs/` content (tutorials, how-tos, reference, explanation) mixed | Generates content into the correct track per Diátaxis category; user-facing content into `docs/`, internal content into `dev-docs/`. Calls `/docs-init` first if scaffolding is missing. |
| `/docs-tutorial` | Writes to `docs/tutorials/` | Unchanged (tutorials are always user-facing) |
| `/docs-howto` | Writes to `docs/how-to/` | Prompts audience first → `docs/how-to/` or `dev-docs/runbooks/` |
| `/docs-reference` | Writes to `docs/reference/` | Prompts audience first → either track |
| `/docs-explanation` | Writes to `docs/explanation/` | Prompts audience first → either track |
| `/adr` | Writes to `docs/decisions/` | Writes to `dev-docs/decisions/` (always internal) |
| `/architecture` | Root or `docs/` | Writes to `dev-docs/architecture.md` (always internal) |
| `/contributing` | One `CONTRIBUTING.md` at root | Generates 3 files: root router, `docs/contributing.md` (user), `dev-docs/development.md` (dev) |
| `/changelog` | Writes root `CHANGELOG.md` | Unchanged + mirrors to `docs/changelog.md` |
| `/changelog-entry` | Edits root `CHANGELOG.md` | Unchanged + updates mirror |
| `/release-notes` | Unspecified location | Writes to `docs/release-notes/` |

### Existing skills — revisions

- **`diataxis`** — adds a note that it's primarily for `docs/`; `dev-docs/` uses a Diátaxis-like substructure with a different audience contract
- **`style-guide`** — splits into two clearly-labeled sections: **prose style** (for `docs/`, user-facing writing) and **code style** (for `dev-docs/development.md`)
- **`conventional-commits`** — explicitly marked as dev-doc reference; surfaced from `dev-docs/development.md`
- **`keep-a-changelog`** — content unchanged; adds note about the root→docs mirror mechanism
- **`adr`** — content unchanged; destination changes only

### New commands

- **`/docs-init`** — idempotent **structure-only** scaffold: creates both directory trees, empty `index.md` stubs in each Diátaxis subfolder, the mirror script for changelog, and the router `CONTRIBUTING.md`. Generates no actual documentation content (that's `/docs`'s job). Never overwrites existing files. Safe to re-run.
- **`/devdoc-runbook`** — guided runbook creator for `dev-docs/runbooks/`
- **`/dev-docs`** — analog of `/docs` for the dev track when the user only wants that side

### New skill

- **`dual-track-docs`** — knowledge skill documenting the convention. Trigger keywords: `user docs`, `dev docs`, `documentation structure`, `where should this go`, `split docs`. Single source of truth for the convention, referenced by all revised skills.

### Agent dopuna

Existing agents (`tutorial-writer`, `api-documenter`, `changelog-analyzer`, `adr-writer`, `contributing-generator`, `architecture-documenter`, `release-notes-writer`, `docs-architect`) get a documented `destination_track` input that the invoking command passes via the Task tool prompt. Values: `user` (write to `docs/`) or `dev` (write to `dev-docs/`). Content generation logic unchanged.

### Audience detection prompt

Ambiguous commands (`/docs-howto`, `/docs-reference`, `/docs-explanation`) prompt the user once per invocation:

> Who reads this? **External user** (consumer / end-user / library client) or **Internal contributor** (maintainer / dev team)?

The answer can be cached for the session as a default, or persisted in `.claude/docs-config.yaml`:

```yaml
docs:
  default_audience: user  # or dev, or ask
  user_track: docs
  dev_track: dev-docs
```

## Marketplace migration

The ws-claude-marketplace itself becomes the reference example.

### Move to `dev-docs/` (plugin contributors)

| Current path | New path |
|---|---|
| `docs/how-to/create-plugin.md` | `dev-docs/runbooks/create-plugin.md` |
| `docs/how-to/add-command.md` | `dev-docs/runbooks/add-command.md` |
| `docs/how-to/add-agent.md` | `dev-docs/runbooks/add-agent.md` |
| `docs/reference/plugin-json.md` | `dev-docs/reference/plugin-json.md` |
| `docs/reference/marketplace-json.md` | `dev-docs/reference/marketplace-json.md` |
| `docs/explanation/plugin-architecture.md` | `dev-docs/architecture.md` |

### Stay in `docs/` (plugin users)

- `docs/tutorials/getting-started.md`
- `docs/reference/commands.md`
- `docs/index.md` (revised — user-track landing with link to dev-docs)

### Content split

- `docs/how-to/troubleshooting.md` — inspect content; install/usage issues → `docs/how-to/`, plugin-dev debugging → `dev-docs/runbooks/`
- `CONTRIBUTING.md` (currently absent or thin) — generated as 3 files via revised `/contributing`

### New files to create

- Root `CHANGELOG.md` — generated from git history via `/changelog`
- `docs/changelog.md` — mirror
- `dev-docs/index.md` — contributor landing
- `dev-docs/development.md` — dev setup
- `docs/contributing.md` — user contributing
- `dev-docs/decisions/0001-adopt-dual-track-docs.md` — ADR for the convention

### Side-effect edits

- `README.md` — navigation section split: "User Docs (`docs/`)" and "Contributors (`dev-docs/`)"
- Root `CLAUDE.md` "Adding a New Plugin" → points to `dev-docs/runbooks/create-plugin.md`

### Untouched

- `plugins/*` (each plugin has internally-consistent docs of its own)
- `dev-docs/superpowers/specs/` (brainstorming output, not production docs)

## Rollout — three PRs

### PR 1 — Foundation + revisions of existing skills

- New skill `dual-track-docs`
- Revisions to existing skills: `diataxis`, `style-guide`, `conventional-commits`, `keep-a-changelog`, `adr`
- Revisions to existing commands: all listed above
- Agent updates: `destination_track` parameter
- `docs-agent` version bump (proposed: 2.1.0)

Outcome: existing docs-agent installs get correct behavior; legacy projects don't need to migrate yet.

### PR 2 — New commands

- `/docs-init`
- `/devdoc-runbook`
- `/dev-docs`
- Verification: run `/docs-init` in an empty repo; verify scaffold

Outcome: zero-to-full-structure via one command.

### PR 3 — Marketplace migration

Uses revised (PR1) and new (PR2) commands as dogfooding.

- Generate root `CHANGELOG.md` from git history (`/changelog`)
- Move dev artifacts to `dev-docs/`
- Create new files (`dev-docs/index`, `development.md`, etc.)
- Set up changelog mirror
- Split `CONTRIBUTING.md`
- ADR `0001-adopt-dual-track-docs.md` in `dev-docs/decisions/`
- Update `README.md` navigation
- Update root `CLAUDE.md`
- Verification: `npx vitepress dev docs` opens user site; all links resolve

Outcome: marketplace becomes the reference example of the convention in practice.

## Out of scope

- Generated VitePress config (option B/C from brainstorming — rejected, structure-only)
- Migration of other projects' docs (ws-claude-sync, ws-clamp)
- Public docs site theme/branding
- GitHub Pages deployment

## Open questions

None remaining from brainstorming. All open questions resolved during sections 1-5.

## Acceptance criteria

1. Running `/docs` in a fresh repo creates both `docs/` and `dev-docs/` skeletons, no content mixed
2. Running `/docs-howto` prompts for audience and routes to the correct folder
3. Running `/adr` always writes to `dev-docs/decisions/`
4. Running `/contributing` produces 3 files (root router + user + dev), each with appropriate content
5. Running `/changelog-entry` updates both root `CHANGELOG.md` and `docs/changelog.md` mirror
6. The marketplace's own docs follow the convention end-to-end
7. `npx vitepress dev docs` succeeds in the marketplace repo with no extra setup
8. All revised skills and commands are documented in `docs-agent/UPGRADE-NOTES.md`
