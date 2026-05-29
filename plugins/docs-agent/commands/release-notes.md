---
description: Generate user-facing release notes from changelog or git history in Linear's style
arguments:
  - name: version
    description: Version or date range for release notes (e.g., "1.2.0", "2026-03-01..2026-03-15")
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

# Generate Release Notes

Generate user-facing release notes in Linear's changelog style — benefit-driven, visual, and curated.

## Destination

Release notes are user-facing. Always write to `docs/release-notes/<version>.md` (where `<version>` is e.g. `v1.2.0`). If the `docs/` directory doesn't exist yet, create it. Do not write release notes to `dev-docs/` — that's for internal contributor docs only.

## Your Task

1. **Gather changes** from CHANGELOG.md or git history for the target version/period
2. **Filter for user impact** — Only include changes users care about
3. **Transform technical entries** into benefit-driven descriptions
4. **Write polished release notes** with bold headlines and visual placeholders

## The Key Difference

| CHANGELOG.md | Release Notes |
|---|---|
| "Fix race condition in request handler" | "Issues now load 40% faster" |
| "Implement cursor pagination" | "Projects load faster, even with hundreds" |
| "Add OAuth 2.1 flow" | "Sign in with your company account" |

## Process

Use the `release-notes-writer` agent to:
1. Read CHANGELOG.md or analyze git log for the version range
2. Filter out internal/technical changes
3. Rewrite entries as user benefits
4. Structure with bold headlines and descriptions
5. Add screenshot/GIF placeholders

## Output

The release notes will:
- Lead with the most impactful feature
- Describe each change in terms of user benefit
- Include screenshot/GIF capture instructions
- Call out breaking changes with migration steps
- Skip internal/technical changes

## Skills to Use

Load the `keep-a-changelog` skill for understanding changelog structure.

## Examples

`/release-notes` — Generate for latest unreleased changes
`/release-notes 1.2.0` — Generate for a specific version
`/release-notes 2026-03-01..2026-03-15` — Generate for a date range
