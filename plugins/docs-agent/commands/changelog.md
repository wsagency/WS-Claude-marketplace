---
description: Generate or update CHANGELOG.md from git history following Keep a Changelog standard
arguments:
  - name: version
    description: Version to release (e.g., "1.2.0"). If omitted, updates Unreleased section only
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

# Generate Changelog

Generate or update the project's CHANGELOG.md following the [Keep a Changelog](https://keepachangelog.com) standard.

## Your Task

1. **Check for existing CHANGELOG.md** in the project root
2. **Analyze git history** since the last version tag (or all history if no tags exist)
3. **Categorize commits** into changelog sections (Added, Changed, Deprecated, Removed, Fixed, Security)
4. **Write user-focused entries** that describe changes meaningfully
5. **Update or create CHANGELOG.md** with the new entries

## Instructions

### If a version argument is provided (e.g., `/changelog 1.2.0`):
- Move entries from [Unreleased] to a new version section
- Add the release date in YYYY-MM-DD format
- Update version comparison links at the bottom

### If no version argument:
- Add new entries to the [Unreleased] section
- Preserve any existing unreleased entries

## Process

Use the `changelog-analyzer` agent to:
1. Parse git commits since the last tag
2. Categorize changes appropriately
3. Write clear, user-focused entries

## Skills to Use

Load the `keep-a-changelog` skill for formatting guidelines and standards.

## Example Output

For a new changelog:
```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Add user authentication with OAuth support
- Add dark mode toggle in settings

### Fixed
- Fix memory leak in image processing

[Unreleased]: https://github.com/user/repo/compare/v1.0.0...HEAD
```

## Important

- Preserve existing changelog content when updating
- Use conventional commit messages to categorize when available
- Include issue/PR references when they exist in commit messages
- Mark breaking changes clearly with **BREAKING:**

## Mirror to docs/

After writing or updating the root `CHANGELOG.md`, also mirror its contents to `docs/changelog.md` so the user-facing site has the same version history. The mirror is a build artifact — never edit it directly; always write through the root file first.

Implementation:
1. Read the final contents of `CHANGELOG.md`.
2. Ensure `docs/` exists (create if missing).
3. Write the same contents to `docs/changelog.md` (overwriting).

If the project doesn't use the dual-track-docs convention (no `docs/` directory and no `.claude/docs-config.yaml`), skip the mirror step silently.
