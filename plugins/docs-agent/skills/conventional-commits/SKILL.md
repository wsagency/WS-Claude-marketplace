---
description: Knowledge about Conventional Commits standard for structured, meaningful commit messages
triggers:
  - commit
  - conventional commits
  - commit message
  - git commit
  - commitlint
  - semantic versioning
  - semver
  - release
---

# Conventional Commits Standard

This skill provides comprehensive knowledge about the Conventional Commits specification (v1.0.0) for writing structured, machine-readable commit messages that drive automated versioning and changelog generation.

## Overview

Conventional Commits structures commit messages as `type(scope): description` to create an explicit commit history that enables automated tooling for versioning, changelog generation, and release management.

## Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types and Their Versioning Impact

| Type | Purpose | SemVer Impact |
|------|---------|---------------|
| `feat` | New feature | MINOR bump |
| `fix` | Bug fix | PATCH bump |
| `docs` | Documentation only | No bump |
| `style` | Formatting, no logic change | No bump |
| `refactor` | Code change that neither fixes nor adds | No bump |
| `perf` | Performance improvement | No bump (or PATCH) |
| `test` | Adding or correcting tests | No bump |
| `build` | Build system or external dependencies | No bump |
| `ci` | CI configuration changes | No bump |
| `chore` | Other changes not modifying src/test | No bump |
| `revert` | Reverts a previous commit | Depends on reverted type |

## Breaking Changes

Two ways to indicate a breaking change (triggers MAJOR version bump):

1. **Footer notation**: `BREAKING CHANGE: description` in the commit footer
2. **Type suffix**: Append `!` after type/scope — `feat!: remove deprecated API`

## Scope

Optional, in parentheses after type. Should be a noun describing the section of codebase:

- `feat(auth): add OAuth 2.1 support`
- `fix(api): resolve race condition in request handler`
- `docs(readme): update installation instructions`

## Enforcement Strategy (Three Layers)

1. **Editor**: VS Code extensions for commit message formatting
2. **Local**: `commitlint` + `husky` commit-msg hook for immediate feedback
3. **CI**: `commitlint` in CI pipeline (catches `--no-verify` bypasses)

## Connection to Automated Releases

Conventional Commits directly enables:

- **Automated changelog generation** via tools like release-please
- **Semantic version bumps** determined by commit types
- **Release PR creation** with human review gate

## Key Principles

1. **Human-readable AND machine-parseable** — serves both audiences
2. **Explicit communication** — commit type instantly conveys intent
3. **Versioning contract** — `feat` = MINOR, `fix` = PATCH, `BREAKING CHANGE` = MAJOR
4. **Scope consistency** — use the same scope names across the team

## References

- [Conventional Commits Specification](https://www.conventionalcommits.org)
- [commitlint](https://commitlint.js.org)
- See `references/` for detailed setup guides
- See `examples/` for commit message examples
