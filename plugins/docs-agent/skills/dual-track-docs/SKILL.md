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

```
<project>/
├── README.md                 ← landing, links to both tracks
├── CHANGELOG.md              ← single source (Keep-a-Changelog)
├── CONTRIBUTING.md           ← thin router → docs/contributing + dev-docs/development
├── AGENTS.md                 ← agent instructions (canonical, agent-neutral)
├── CLAUDE.md                 ← thin @AGENTS.md import
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
    ├── architecture.md       ← THIN when an OpenWiki exists: curated boundaries
    │                           + contracts + pointer to openwiki/ (the map)
    ├── development.md
    ├── decisions/            ← ADRs (two-tier: lightweight default, MADR for big)
    ├── client-materials/     ← DATED folders YYYY-MM-DD/ (latest = truth,
    │                           older = history) + history.md request trail
    ├── runbooks/
    ├── reference/
    └── explanation/
```

### Why AGENTS.md

`AGENTS.md` is the canonical, agent-neutral context file: omp and Codex read `AGENTS.md` (walk-up from cwd), and omp never reads a root `CLAUDE.md`. `CLAUDE.md` is kept as a thin import containing nothing but `@AGENTS.md` (plus a comment) so Claude Code loads the same content on every version — and it cannot double-load, because the file holds only the import. Sub-repos and projects follow the same pattern: per-repo rules live in that repo's own `AGENTS.md`, with a thin `CLAUDE.md` import beside it.

## Routing rules for docs-agent

As of v3.0.0, all docs operations route through `/ws-docs <verb>`:

| Verb | Destination |
|---|---|
| (no verb) | Discovery — prints the artifact status table, no writes |
| `init` | Scaffolds both tracks, writes `.claude/docs-config.yaml`, appends the AGENTS.md maintenance section + thin `CLAUDE.md` import (offers migration when a real CLAUDE.md exists), generates CHANGELOG.md, 3-file CONTRIBUTING |
| `audit` | Verbose dijagnoza; optionally writes `docs-audit-<date>.md` |
| `catchup` | Proposes CHANGELOG entries, reference updates, ADRs; user triages; one big commit |
| `repair` | Creates missing artifacts only (never deletes) |
| `write <type> [topic]` | One Diátaxis doc; `type` = `tutorial \| howto \| reference \| explanation` |
| `adr "<decision>"` | New ADR in `dev-docs/decisions/` |
| `architecture` | Regenerate `dev-docs/architecture.md` (diff + confirm) |
| `contributing` | Regenerate 3-file CONTRIBUTING set (diff + confirm) |
| `changelog [version]` | Update `[Unreleased]` or cut version; mirrors to `docs/changelog.md` |
| `release-notes [version]` | Linear-style notes → `docs/release-notes/<version>.md` |
| `explain` | Regenerate `docs/explained.md` — Outline-safe product onboarding page (in `DOCS_REPO` when in hub mode) |
| `publish` | Lint + push `docs/` to Outline via `outline-sync.py`; commits `.outline-sync.json`. One-way: Outline edits are never synced back |

## Product docs repo (hub mode)

In a WS project hub, `project.yaml` may register at most one sub-repo with
`role: docs` — the product docs repo (see ws-project-hub's
project-hub-conventions skill). When `/ws-docs` finds one, it runs in **hub
mode** and routes product-level writes to that repo (`DOCS_REPO`).

Split rule: **concerns more than one repo, the client, or any end user → docs
repo.** Sub-repos keep only repo-specific `dev-docs/`; user docs are always
product-level. `CHANGELOG.md` stays per-repo.

Scope routing in hub mode (repo-level behavior is unchanged outside hubs):

| Verb | Hub-mode routing |
|---|---|
| `write` (user audience) | ALWAYS `DOCS_REPO/docs/` — user docs are product-level by definition |
| `write` (dev audience) | Ask scope: **this repo** (local `dev-docs/`) or **product** (`DOCS_REPO/dev-docs/`) |
| `adr` | Ask scope: repo ADR (local `dev-docs/decisions/`) or product ADR (`DOCS_REPO/dev-docs/decisions/`) |
| `architecture` | Ask scope; product scope targets `DOCS_REPO/dev-docs/architecture.md` (delegate to ws-project-hub's hub-architect agent when available) |
| `changelog`, `release-notes` | Repo-level, unchanged |

The scope answer may be cached in `.claude/docs-config.yaml` as
`default_scope: repo | product | ask` (honored like `default_audience`).

## Audience prompt

For commands that span both tracks, prompt the user once per invocation:

> Who reads this? **External user** (consumer / end-user / library client) **or Internal contributor** (maintainer / dev team)?

The answer can be cached for the session as a default, or persisted in `.claude/docs-config.yaml`:

```yaml
docs:
  default_audience: user    # user | dev | ask
  default_scope: ask        # repo | product | ask — hub mode only
  user_track: docs
  dev_track: dev-docs
```

If the config file exists and `default_audience` is `user` or `dev`, skip the prompt. `default_scope` works the same way for the hub-mode scope question (repo vs product).

## Changelog mirror

The canonical changelog lives at the repo root (`CHANGELOG.md`) for GitHub's auto-detection. The user-facing site needs the same content under `docs/`. `/ws-docs changelog` always updates both:

1. Write or edit `CHANGELOG.md` at the root
2. Copy the full contents to `docs/changelog.md` (overwrites — single source remains root)

## CONTRIBUTING split

`/contributing` produces three files:

1. **`CONTRIBUTING.md` (root)** — thin router (~5 lines):
   ```markdown
   # Contributing

   Thanks for your interest in this project.

   - **Reporting bugs or requesting features?** See [docs/contributing.md](docs/contributing.md).
   - **Setting up the project to contribute code?** See [dev-docs/development.md](dev-docs/development.md).
   ```
2. **`docs/contributing.md`** — user-side: how to file issues, propose features, ask questions
3. **`dev-docs/development.md`** — dev-side: local setup, code style, test commands, conventional commits

## VitePress portability

`docs/` is structured to work as a VitePress source directory with no additional config (option A from the design spec). Each Diátaxis subfolder has an `index.md`. Markdown uses YAML frontmatter only where useful. No `.vitepress/` config is generated — users add VitePress themselves if they want.

## Outline-safe markdown profile

The user track syncs to Outline (docs.wsagency.io) via `/ws-docs publish`,
which lints before pushing (`outline-sync.py lint`). Only `docs/` is bound by
this profile — `dev-docs/` never syncs.

Allowed:
- mermaid fences
- `:::info` / `:::warning` / `:::tip` notices
- tables and task lists
- `$$math$$`
- embeds (provider URL alone on a line)
- images and links

Banned:
- raw HTML elements (HTML comments are allowed)
- footnotes (`[^1]`)
- `==highlight==`
- manual heading IDs (`{#custom-id}`)
- definition lists

## When NOT to use this convention

- Single-audience projects (purely internal tools, or purely user-facing libraries with no maintainers expected to read internal docs)
- Truly tiny projects with one or two doc pages — overhead of two folders is not worth it
- Wikis or external docs platforms that already enforce their own structure
