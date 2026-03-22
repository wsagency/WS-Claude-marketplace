---
description: Knowledge about Keep a Changelog standard for writing and maintaining changelogs
triggers:
  - changelog
  - CHANGELOG
  - release notes
  - version history
  - what changed
---

# Keep a Changelog Standard

This skill provides comprehensive knowledge about the Keep a Changelog standard for writing human-readable changelogs.

## Core Principles

1. **Changelogs are for humans, not machines** - Write entries that help users understand what changed and why it matters to them
2. **Every version should have an entry** - Don't skip versions, even for minor releases
3. **Group changes by type** - Use consistent categories to organize changes
4. **Versions should be linkable** - Each version heading should be a link to a diff
5. **Latest version first** - Show the most recent changes at the top
6. **Show release dates** - Use ISO 8601 format (YYYY-MM-DD)

## Change Types (Sections)

Use these sections in this order:

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Now removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes

Only include sections that have entries. Empty sections should be omitted.

## Version Format

Follow Semantic Versioning (SemVer):
- **MAJOR.MINOR.PATCH** (e.g., 1.2.3)
- MAJOR: Incompatible API changes
- MINOR: Backwards-compatible new functionality
- PATCH: Backwards-compatible bug fixes

## The Unreleased Section

Always maintain an `[Unreleased]` section at the top:
- Accumulates changes before the next release
- Makes release preparation easier
- Shows what's coming in the next version

## Writing Good Entries

### Do:
- Start with a verb (Add, Fix, Change, Remove, Deprecate)
- Be concise but descriptive
- Include issue/PR references when relevant
- Group related changes together
- Focus on user impact

### Don't:
- Include commit hashes in entries
- Write entries only developers understand
- Use vague descriptions like "various fixes"
- Include internal refactoring unless it affects users

## Changelog vs. Release Notes

These are complementary but different artifacts:

| Changelog (CHANGELOG.md) | Release Notes |
|--------------------------|---------------|
| Developer-facing, technical | User-facing, benefit-driven |
| Comprehensive — every fix | Curated — only what users care about |
| In the repository | Published on website/blog/in-app |
| Follows Keep a Changelog format | Follows Linear's changelog style |

## Automation with Conventional Commits

When combined with Conventional Commits and release-please:

1. Developer commits with `feat:`, `fix:`, etc.
2. CI validates commit format (commitlint)
3. On main merge, release-please creates a Release PR
4. Release PR includes auto-generated CHANGELOG.md updates
5. Merging the Release PR creates Git tag + release

This keeps the changelog always up-to-date with zero manual effort.

## References

- [Keep a Changelog Official Site](https://keepachangelog.com)
- [Semantic Versioning](https://semver.org)
- [Conventional Commits](https://www.conventionalcommits.org)
- [release-please](https://github.com/googleapis/release-please)

See `references/changelog-format.md` for the detailed format specification.
See `examples/changelog-template.md` for a ready-to-use template.
