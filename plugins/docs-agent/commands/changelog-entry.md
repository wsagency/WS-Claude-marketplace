---
description: Add a single entry to the Unreleased section of CHANGELOG.md
arguments:
  - name: type
    description: "Change type: added, changed, deprecated, removed, fixed, or security"
    required: true
  - name: description
    description: Description of the change
    required: true
allowed_tools:
  - Read
  - Edit
  - Write
---

# Add Changelog Entry

Add a single entry to the [Unreleased] section of CHANGELOG.md.

## Your Task

1. **Read existing CHANGELOG.md** (or create one if it doesn't exist)
2. **Validate the change type** (must be one of: added, changed, deprecated, removed, fixed, security)
3. **Add the entry** under the appropriate section in [Unreleased]
4. **Create the section** if it doesn't exist yet

## Arguments

- **type**: The type of change (added, changed, deprecated, removed, fixed, security)
- **description**: The change description (will be formatted as a bullet point)

## Process

1. Read CHANGELOG.md
2. Find or create the [Unreleased] section
3. Find or create the appropriate subsection (### Added, ### Fixed, etc.)
4. Add the new entry as a bullet point
5. Maintain proper section order (Added → Changed → Deprecated → Removed → Fixed → Security)

## Entry Format

The entry should:
- Start with a capital letter
- Not end with a period
- Begin with an action verb when possible (Add, Fix, Change, Remove, etc.)
- Be concise but descriptive

## Examples

`/changelog-entry added "Add dark mode support for all UI components"`

Adds to CHANGELOG.md:
```markdown
### Added
- Add dark mode support for all UI components
```

`/changelog-entry fixed "Fix incorrect calculation in billing totals"`

Adds:
```markdown
### Fixed
- Fix incorrect calculation in billing totals
```

## Section Order

When creating sections, maintain this order:
1. Added
2. Changed
3. Deprecated
4. Removed
5. Fixed
6. Security

## Error Handling

- If CHANGELOG.md doesn't exist, create it with the standard header
- If the type is invalid, show valid options and ask for correction
- If [Unreleased] section is missing, create it

## Mirror to docs/

After writing or updating the root `CHANGELOG.md`, also mirror its contents to `docs/changelog.md` so the user-facing site has the same version history. The mirror is a build artifact — never edit it directly; always write through the root file first.

Implementation:
1. Read the final contents of `CHANGELOG.md`.
2. Ensure `docs/` exists (create if missing).
3. Write the same contents to `docs/changelog.md` (overwriting).

If the project doesn't use the dual-track-docs convention (no `docs/` directory and no `.claude/docs-config.yaml`), skip the mirror step silently.
