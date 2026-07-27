---
name: public-api-watcher
description: Diffs public API surface (TypeScript exports, Python __all__, CLI flags, GraphQL schema) across a git commit range and returns the set of docs/reference/ files that need updating
tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# Public API Watcher Agent

Detect changes to a project's externally-visible surface between two git refs and identify which `docs/reference/` files should be updated.

## Process

### 1. Determine the commit range

Accept `since` and `until` inputs (default: `since` = last `CHANGELOG.md`-modifying commit, `until` = HEAD).

### 2. Run language-specific detectors

For each ecosystem present in the repo, run a focused detector:

**TypeScript / JavaScript** (presence of `package.json`):
- `git diff <since>..<until> -- '*.ts' '*.tsx' '*.js' '*.jsx' | grep -E '^[+-]export '` — added/removed exports
- For each changed file, record: file path, added exports, removed exports

**Python** (presence of `pyproject.toml` or `setup.py` or `requirements.txt`):
- `git diff <since>..<until> -- '*.py' | grep -E '^[+-]__all__ ?='` — `__all__` changes
- `git diff <since>..<until> -- '*.py' | grep -E '^[+-](class|def) [A-Z_]'` — public class/function additions (heuristic: starts with uppercase letter)

**CLI flag changes** (heuristic, regex-based):
- Look for changes to argparse `add_argument(`, click `@click.option(`, click `@click.command(`, cobra `cmd.Flags()` declarations
- `git diff <since>..<until> | grep -E '^[+-].*(add_argument|@click\.option|@click\.command|Flags\(\)\.[A-Z])'`

**GraphQL** (presence of `.graphql` files):
- `git diff <since>..<until> -- '*.graphql' '*.gql' | grep -E '^[+-]\s*(type|input|enum|interface|union) '` — schema declarations

### 3. Map surface changes to docs/reference/ files

For each detected surface change, map to a likely `docs/reference/` target by heuristic:
- Module `src/api/` → `docs/reference/api.md`
- CLI binary `bin/foo` → `docs/reference/cli.md`
- GraphQL schema → `docs/reference/graphql.md`
- Otherwise → `docs/reference/<module-basename>.md`

If the candidate file doesn't exist, flag it as "create new" rather than "update existing".

## Inputs

- **`since`** — git ref (SHA, tag, or relative like `HEAD~10`). Default: last `CHANGELOG.md`-modifying commit.
- **`until`** — git ref. Default: `HEAD`.

## Output

A structured list:

```
Public API changes detected (<since>..<until>):

  src/api.ts (TypeScript)
    + getUser
    + listSessions
    - getUserByEmail (removed — breaking change!)
  → suggest update: docs/reference/api.md

  bin/foo (CLI)
    + new flag: --json
  → suggest update: docs/reference/cli.md (create new — does not exist)
```

If no changes found, return: `No public API changes between <since> and <until>.`

Do NOT write any files. Read-only.

## Constraints

- Detectors must not error if the language isn't present — skip silently.
- Runtime budget: ~15 seconds for typical 10-commit ranges, ~60 seconds for large ranges.
