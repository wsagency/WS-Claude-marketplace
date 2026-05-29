# Contributing to the WS Claude Marketplace

This is the internal documentation for **maintainers and plugin contributors** to the WS Claude Marketplace. If you're a plugin **user**, see [../docs/index.md](../docs/index.md) instead.

## Structure

- **`runbooks/`** — Step-by-step guides for common contributor tasks
  - [Create a new plugin](runbooks/create-plugin.md)
  - [Add a command to a plugin](runbooks/add-command.md)
  - [Add an agent to a plugin](runbooks/add-agent.md)
- **`reference/`** — Authoritative schemas and internal references
  - [plugin.json schema](reference/plugin-json.md)
  - [marketplace.json schema](reference/marketplace-json.md)
- **`decisions/`** — Architecture Decision Records (ADRs)
- **`explanation/`** — Internal concepts, history, why-patterns
- **`architecture.md`** — Project architecture overview (created separately)
- **`development.md`** — Local setup, code style, commit format (created separately)

## Conventions

This project follows the **dual-track docs** convention. User-facing docs live in `docs/`; this folder is for internal contributor docs only. See the `dual-track-docs` skill in the docs-agent plugin for the full convention.
