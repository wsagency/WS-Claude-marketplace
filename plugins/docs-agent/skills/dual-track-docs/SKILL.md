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
```

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

```yaml
docs:
  default_audience: user    # user | dev | ask
  user_track: docs
  dev_track: dev-docs
```

If the config file exists and `default_audience` is `user` or `dev`, skip the prompt.

## Changelog mirror

The canonical changelog lives at the repo root (`CHANGELOG.md`) for GitHub's auto-detection. The user-facing site needs the same content under `docs/`. Commands that touch the changelog (`/changelog`, `/changelog-entry`) always update both:

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

## When NOT to use this convention

- Single-audience projects (purely internal tools, or purely user-facing libraries with no maintainers expected to read internal docs)
- Truly tiny projects with one or two doc pages — overhead of two folders is not worth it
- Wikis or external docs platforms that already enforce their own structure
