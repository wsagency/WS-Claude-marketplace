---
name: keep-a-changelog
description: Knowledge about the Keep a Changelog standard for writing and maintaining changelogs. Use when touching a CHANGELOG, writing release notes, or summarizing version history and what changed.
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

Versions follow Semantic Versioning (**MAJOR.MINOR.PATCH**, e.g., 1.2.3) — the SemVer impact rules and their mapping from commit types live in the `conventional-commits` skill.

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

The automated changelog pipeline (commit-format enforcement and Release PR generation) is documented in the `conventional-commits` skill.

## References

- [Keep a Changelog Official Site](https://keepachangelog.com)
- [Semantic Versioning](https://semver.org)
- [Conventional Commits](https://www.conventionalcommits.org)

See `references/changelog-format.md` for the detailed format specification.
See `examples/changelog-template.md` for a ready-to-use template.

## Single source + mirror

In the dual-track-docs convention, the canonical `CHANGELOG.md` lives at the repo root for GitHub's auto-detection. A copy is mirrored to `docs/changelog.md` for inclusion in the VitePress user-facing site. `/ws-docs changelog` always updates both — the root file is the source of truth, the mirror is a build artifact.

## Helper scripts

The ws plugin ships two deterministic helpers: `${CLAUDE_PLUGIN_ROOT}/scripts/validate-changelog.sh` (checks a CHANGELOG.md against the format rules above) and `${CLAUDE_PLUGIN_ROOT}/scripts/parse-git-log.sh` (extracts Conventional Commits history for changelog generation).
