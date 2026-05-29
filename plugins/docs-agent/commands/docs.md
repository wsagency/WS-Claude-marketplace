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
