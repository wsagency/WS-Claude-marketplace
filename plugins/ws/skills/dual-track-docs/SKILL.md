---
name: dual-track-docs
description: Convention for splitting documentation into user-facing (docs/) and internal contributor (dev-docs/) tracks. Use when scaffolding documentation, deciding where a new doc belongs (docs/ vs dev-docs/), discussing documentation structure, or migrating an existing single-track docs layout.
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
    ├── scoping/             ← processed external deliveries (one dated doc per
    │                           delivery); raw deliveries live in `type: input`
    │                           repos in a hub — see project-hub-conventions
    ├── runbooks/
    ├── reference/
    └── explanation/
```

### Why AGENTS.md

`AGENTS.md` is the canonical, agent-neutral context file: omp and Codex read `AGENTS.md` (walk-up from cwd), and omp never reads a root `CLAUDE.md`. `CLAUDE.md` is kept as a thin import containing nothing but `@AGENTS.md` (plus a comment) so Claude Code loads the same content on every version — and it cannot double-load, because the file holds only the import. Sub-repos and projects follow the same pattern: per-repo rules live in that repo's own `AGENTS.md`, with a thin `CLAUDE.md` import beside it.
## Canonical policy

`.wsagency/config.yaml` is the only runtime owner of documentation and
changelog policy. Consumers take track paths, audience/scope defaults, ADR
maintenance behavior, changelog cadence/path, and skip types from its `docs`
and `changelog` sections. The Standard layout below is an initialization
proposal, never a fallback for missing values.

Every repository reads only its own canonical file. In a hub, the hub policy
governs hub-owned product artifacts and the explicit docs output; each working
repository owns a materialized child config for repository-local work. Runtime
inheritance is forbidden. If canonical policy is absent and
`.claude/docs-config.yaml` or `.claude/ws-project.yaml` is detected, consumers
name the source and fail closed with `/ws-setup`; they never parse legacy
content.

## Routing rules for `/ws-docs`

As of v3.0.0, all docs operations route through `/ws-docs <verb>`:

| Verb | Destination |
|---|---|
| (no verb) | Discovery of configured artifacts; no writes |
| `init` | Confirm canonical docs/changelog policy, then apply the shared missing-only bootstrap |
| `audit` | Verbose diagnosis; optionally writes an audit report |
| `catchup` | Proposes changelog, reference, and ADR maintenance under canonical policy |
| `repair` | Creates only missing configured artifacts |
| `write <type> [topic]` | One Diátaxis document in the configured audience track |
| `adr "<decision>"` | New ADR under the resolved owner’s configured contributor track |
| `architecture` | Regenerate configured contributor architecture with diff + confirm |
| `contributing` | Regenerate root router plus configured user/dev contribution guides |
| `changelog [version]` | Update configured changelog and derived user-track mirror |
| `release-notes [version]` | Notes under configured user track |
| `explain` | Regenerate configured user-track onboarding page |
| `publish` | Lint + push configured user track to Outline |

## Hub mode (repo types)

Project shape comes from `project-hub-conventions`; configuration ownership is
separate:

- Standalone uses its own canonical policy for both tracks.
- A hub root uses hub canonical policy for product internal artifacts and the
  explicit `type: output, purpose: docs` repository.
- A working child uses its own materialized canonical policy for local
  contributor docs/changelog. Product requests switch explicitly to hub
  policy; the child never inherits it.

User product docs require a registered, locally accessible docs output.
Missing output is a visible documentation blocker handled through
`/ws-hub add`; no docs/setup consumer creates, clones, initializes, or
substitutes one implicitly. Product internal work remains in the hub's
configured contributor track and is distinct from repository-local work.

At the hub root, discovery/audit/catchup/repair/init sweep only
`type: working` repositories and validate each child config independently.
Input/output repositories are not swept. Product `write`, `adr`, and
`architecture` use hub policy; `explain` and `publish` require the docs output.

Inside a working child:

| Verb | Hub-mode routing |
|---|---|
| `write` (user) | Docs output + hub `docs.user_track` |
| `write` (dev) | Child or product scope from child `default_scope`; selected owner’s `dev_track` |
| `adr` | Child or product scope; selected owner’s `dev_track/decisions/` |
| `architecture` | Child or product scope; selected owner’s `dev_track/architecture.md` |
| `changelog` | Child `changelog.path` |
| `release-notes` | Child changelog plus selected user-track policy |
| `explain`, `publish` | Docs output + hub `user_track`; unavailable without explicit output |

`docs.default_scope` and `docs.default_audience` are explicit canonical
values. `ask` prompts once; `repo|product` and `user|dev` route without a
prompt.

## Audience prompt

For commands spanning both audiences, use `docs.default_audience`. When it is
`ask`, prompt once:

> Who reads this? **External user** (consumer / end-user / library client) **or Internal contributor** (maintainer / dev team)?

The runtime value comes only from `.wsagency/config.yaml`; session choices are
ephemeral unless an explicit `/ws-setup reconfigure` changes policy.

## Changelog mirror

The changelog source is `changelog.path`. When documentation policy is
present, the user mirror is derived at
`<docs.user_track>/changelog.md`; `/ws-docs changelog` copies the full source
there. `changelog.update_mode` controls automatic maintenance:
`pull_request`, `commit`, or `disabled`. Documentation hooks enforce only
`commit`; they use the configured `skip_types` and never read legacy files.

## CONTRIBUTING split

`/ws-docs contributing` produces three files using canonical track paths:

1. root `CONTRIBUTING.md` — thin router;
2. `<docs.user_track>/contributing.md` — user-side issue, feature, and support
   guidance; and
3. `<docs.dev_track>/development.md` — setup, style, tests, and commit
   conventions.

The Standard layout's user track is VitePress-portable without generated
`.vitepress/` configuration. The configured user track syncs to Outline via
`/ws-docs publish` and is the only track bound by the Outline-safe profile;
the configured contributor track never syncs.

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
