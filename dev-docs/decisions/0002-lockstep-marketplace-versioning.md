---
status: accepted
date: 2026-07-21
decision-makers: Kristijan Lukačin
consulted: Claude (marketplace consolidation session)
informed: All WS Agency developers using the marketplace
---

# Lockstep versioning: one version for the whole marketplace

## Context and Problem Statement

Each plugin carried its own semver (docs-agent 3.2.0, ws-commit-commands 3.0.0,
ws-project-hub 0.3.0) while the repo keeps a single root CHANGELOG.md and the team
installs and updates the marketplace as one unit. Independent versions created a
confusing matrix ("which combination is the team on?"), diverged from the single
changelog, and forced per-plugin bump bookkeeping on every release.

## Considered Options

- **Option 1**: Keep independent per-plugin semver
- **Option 2**: Lockstep — every plugin's `version` in marketplace.json equals the
  repo release version, cut together from the root CHANGELOG (like Babel/Jest
  fixed-mode monorepos)

## Decision Outcome

Chosen option: **Option 2 — lockstep**, starting at **3.3.0** (the first number ≥
every existing plugin version, so no plugin's version moves backwards).

Consequences:

- Good: one number answers "what are we running"; the root CHANGELOG maps 1:1 to
  releases; release procedure is one edit + one tag (`vX.Y.Z`).
- Bad (accepted): a breaking change in any plugin bumps the major for all plugins,
  so a plugin's version no longer signals its own stability. Acceptable for an
  internal marketplace consumed as a unit; per-entry **BREAKING:** changelog lines
  carry the per-plugin signal instead.
- Procedure: on release, cut `[Unreleased]` in CHANGELOG.md to `[X.Y.Z]`, mirror to
  `docs/changelog.md`, set every `version` field in `.claude-plugin/marketplace.json`
  to `X.Y.Z`, tag `vX.Y.Z`. Plugin `plugin.json` files carry no version field —
  marketplace.json is the single version authority.
