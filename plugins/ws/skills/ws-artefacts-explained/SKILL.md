---
name: ws-artefacts-explained
description: 'Contract for a hub''s `role: explained` repo — generated, self-contained HTML product documentation consumed by the ws-artefacts platform (artefacts.wsagency.io). Use when generating or refreshing product-explained artefacts, when asked about an "explained repo" or "ws-artefacts", or about the artefact HTML / meta.json format.'
---

# ws-artefacts Explained Repos

A hub MAY register one sub-repo with `role: explained` (max ONE per hub, same
validation rule as `role: docs`). It holds **generated, human-facing visual
documentation of the whole product**: self-contained HTML artefacts published
through the [ws-artefacts](https://artefacts.wsagency.io) platform behind
unguessable token links.

**Audience: the product owner + the dev team.** They should never have to read
`dev-docs/` or `openwiki/` directly — those serve AI agents. The explained repo
is the human window into the same knowledge.

**Explained is an OUTPUT, never a source of truth.** It is synthesized from the
hub's `project.yaml`, `openwiki/` (the primary derived map), the `role: docs`
repo's `dev-docs/`, per-sub-repo `dev-docs/`, and sub-repo READMEs. When it
drifts, **regenerate it — never hand-edit**. Commits go to the explained repo
itself (its own git; the hub ignores it like any sub-repo).

## Artefact HTML contract

Verified against the ws-artefacts repo (`build.mjs` consumer, `templates/`,
`clients/` examples):

- **One self-contained `.html` file per artefact**, flat at the repo root
  (kebab-case filename, e.g. `acme-explained.html`). Full `<!doctype html>`
  document, ALL CSS and JS inline, images as inline SVG or `data:` URIs —
  "like Claude artifacts".
- **No external network at view time.** No CDN scripts, no external
  stylesheets, no web fonts, no remote images. **NO mermaid** — render
  diagrams as inline SVG at generation time.
- **No multi-page support.** Artefacts can only cross-link via full token
  URLs (which the generator never knows) — so **don't cross-link between
  artefacts**; each file stands alone.
- **Head stays minimal**: charset, viewport, title only. ws-artefacts injects
  noindex + favicon at build time — do NOT add your own robots or favicon
  meta tags.
- The only permitted absolute asset paths are `/assets/favicon.ico` and
  `/assets/ws-logo.svg` (served by the platform) — avoid relying on them
  in-content; inline what you need.

## WS chrome look

There is no shared CSS — **every artefact carries the palette itself**:

```css
:root{
  --bg:#F5F6F8; --ink:#191C22; --muted:#606774; --line:#E6E8EC; --card:#fff;
  --chrome:#15171C; --accent:#2A54F0; --accent-ink:#1E3ECC;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:"SF Mono","JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;
}
```

Conventions: `<html lang="en">` — WS language rule: originals are ENGLISH (explained serves the PO + dev team; translate only when a client-facing copy demands it, as a derived artifact). Existing ws-artefacts CLIENT artefacts use `lang="hr"` per that repo's house style. Light theme only, print-friendly
(`@media print` with sensible page breaks), mobile breakpoint around 540px,
content column 46–52rem (`max-width` + centered).

## Companion `meta.json`

The explained repo carries a `meta.json` with the **same shape as a
ws-artefacts `clients/<slug>/meta.json` but WITHOUT any `token` fields** —
tokens are minted and committed on the ws-artefacts side by its `add.mjs`;
**the generator must never invent tokens**:

```json
{
  "name": "Acme Product",
  "slug": "acme",
  "artefacts": [
    {
      "file": "acme-explained.html",
      "title": "Acme — how the product works",
      "date": "2026-07-26",
      "description": "Full-product overview for the PO and dev team"
    }
  ]
}
```

## Registration on the ws-artefacts side (proposed contract)

This is greenfield on the ws-artefacts side — document it as the proposed
contract, not a shipped feature. ws-artefacts gains
`projects/<name>/git-source.yml`:

```yaml
name: <project>
repo: git@git.wsagency.io:<org>/<project>-explained.git  # ssh url of the explained repo
ref: main
token: <minted on the ws-artefacts side>
# optional: path, password, description
```

Its CI pulls the explained repo at `ref` and feeds it to `build.mjs` exactly
like a `clients/<slug>/` entry (tokened index + per-artefact pages).

**Open item:** cross-repo pull auth — a deploy key or Gitea token for the
explained repo must be added to the ws-artefacts Actions secrets before CI
can pull it.

## Content of a product-explained artefact

For the PO + dev audience, a full product artefact should cover:

1. **What the product is** — one screen, plain language.
2. **System overview** — architecture diagram as inline SVG (repos, services,
   data flows).
3. **Per-repo sections** — purpose, tech stack, key flows for each registered
   sub-repo.
4. **Decision highlights** — the consequential choices, sourced from
   `dev-docs/decisions/`, citing ADR numbers.
5. **Current status / roadmap pointers** — where things stand, where to look
   next.
6. **Glossary** — domain terms, from `CONTEXT.md`.

Sources, in order of preference: hub `project.yaml`, `openwiki/` (primary
derived map), the docs repo's + sub-repos' `dev-docs/`, sub-repo READMEs.
