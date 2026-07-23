# docs-agent v3.0.0 — Unified /ws-docs entry (BREAKING)

## What Changed in v3.0.0

### Breaking
All eleven prior commands are removed. There is no back-compat alias.

### Migration table

| v2.x command | v3.0.0 equivalent |
|---|---|
| `/docs` | `/ws-docs init` |
| `/docs-tutorial <topic>` | `/ws-docs write tutorial <topic>` |
| `/docs-howto <topic>` | `/ws-docs write howto <topic>` |
| `/docs-reference <topic>` | `/ws-docs write reference <topic>` |
| `/docs-explanation <topic>` | `/ws-docs write explanation <topic>` |
| `/adr "<decision>"` | `/ws-docs adr "<decision>"` |
| `/architecture` | `/ws-docs architecture` |
| `/contributing` | `/ws-docs contributing` |
| `/changelog [version]` | `/ws-docs changelog [version]` |
| `/changelog-entry <type> <text>` | removed — handled automatically by /ws-commit-push-pr and the AGENTS.md maintenance rules added by `/ws-docs init` |
| `/release-notes [version]` | `/ws-docs release-notes [version]` |

Run `/ws-docs` (no args) to see the discovery report for your project, then `/ws-docs init` if you haven't initialized.

### New: discovery + automation

- `/ws-docs` with no args returns a per-artifact status table (no writes).
- `/ws-docs init` writes `.claude/docs-config.yaml` and appends a "Documentation maintenance" section to root `AGENTS.md` (since v3.4.0 — root `CLAUDE.md` stays a thin `@AGENTS.md` import). After init, Claude knows to update CHANGELOG after code changes, propose ADRs for architectural changes, and update `docs/reference/` for public API changes.
- Two opt-in hooks: PreToolUse blocks `git commit` when staged code changes lack a CHANGELOG entry; Stop blocks claude stop when uncommitted code lacks a CHANGELOG entry. Both no-op without `.claude/docs-config.yaml`.

### New: subagent team for heavy verbs

`init`, `catchup`, `architecture`, `contributing` dispatch background subagents and print a live status block. Main session stays clean.

### New agents

- `docs-doctor` — scans project state, returns the artifact status table
- `public-api-watcher` — diffs exports/CLI/schema across commits, suggests `docs/reference/` updates
- `arch-watcher` — detects architectural-decision signals (BREAKING, keywords, large infra diffs, new dependencies)

## Migrating Existing v2.x Projects

1. Update the plugin: `/plugin update docs-agent@ws-marketplace`
2. Run `/ws-docs` in each project to see what's already in place.
3. Run `/ws-docs init` (idempotent — preserves existing content).
4. Commit the new `.claude/docs-config.yaml` and AGENTS.md additions (plus the thin `CLAUDE.md` import).

If you were using `/changelog-entry` in scripts or muscle-memory: stop. With v3.0.0 you either let `/ws-commit-push-pr` handle it (recommended) or run `/ws-docs changelog` for explicit edits.

---

# docs-agent v2.1.0 — Dual-track docs convention

## What Changed in v2.1.0

### New Skill
- **dual-track-docs** — Single source of truth for the user-facing (`docs/`) vs internal contributor (`dev-docs/`) split. All other skills and commands cross-reference it.

### Revised Skills
- **diataxis** — Notes that the framework is primarily for the user track; `dev-docs/` uses a parallel substructure.
- **style-guide** — Now labeled into two scopes: prose style (for `docs/`) and code style (for `dev-docs/development.md`).
- **conventional-commits** — Explicitly marked as dev-doc reference.
- **keep-a-changelog** — Documents the root→`docs/changelog.md` mirror.
- **adr** — Destination updated to `dev-docs/decisions/`.

### Revised Commands
- `/docs` — Scaffolds and generates content across both tracks.
- `/docs-howto`, `/docs-reference`, `/docs-explanation` — Prompt the user for audience (or read `.claude/docs-config.yaml`), then route to the correct track.
- `/adr`, `/architecture` — Always write to `dev-docs/`.
- `/contributing` — Generates 3 files: root router, `docs/contributing.md`, `dev-docs/development.md`.
- `/changelog`, `/changelog-entry` — Mirror to `docs/changelog.md` after writing the root file.
- `/release-notes` — Writes to `docs/release-notes/`.

### Agent updates
All 8 agents now document a `destination_track` input (`user` or `dev`) that the invoking command may pass.

## Migrating Existing Projects

If you adopt v2.1.0 on a project that already has docs in a single `docs/` folder:

1. Decide which existing files belong to the user track vs. dev track.
2. Create `dev-docs/` and move contributor-only docs (architecture, ADRs, internal runbooks) there.
3. Run `/contributing` to regenerate the 3-file CONTRIBUTING set.
4. If `CHANGELOG.md` exists at the root, copy it to `docs/changelog.md` to seed the mirror.

This is intentionally manual for PR 1. A `/docs-init` scaffold command (PR 2) and migration tooling (PR 3 for the marketplace itself) follow in subsequent releases.

---

# docs-agent v2.0.0 — Upgrade Notes and Recommendations

## What Changed in v2.0.0

### New Skills (Knowledge Bases)
- **conventional-commits** — Conventional Commits spec, commitlint setup, release-please pipeline, CI enforcement
- **style-guide** — Google/Microsoft writing standards, Vale prose linting, terminology management
- **adr** — Architecture Decision Records in MADR v4.0.0 format, writing guide, real-world examples

### New Agents
- **adr-writer** — Creates ADRs by analyzing codebase context
- **contributing-generator** — Generates CONTRIBUTING.md from actual project tooling
- **architecture-documenter** — Creates ARCHITECTURE.md following matklad's pattern
- **release-notes-writer** — Transforms changelog into Linear-style user-facing release notes

### New Commands
- `/adr "decision"` — Create an Architecture Decision Record
- `/contributing` — Generate CONTRIBUTING.md from project analysis
- `/architecture` — Generate ARCHITECTURE.md
- `/release-notes [version]` — Generate user-facing release notes

### Enhanced Existing Components
- **documentation architect agent** (removed in v3.1.0) — Now checks for 7 required artifacts, includes TSDoc/GraphQL/Storybook guidance, docs-as-code enforcement, AI readiness recommendations
- **api-documenter** — Added TSDoc standard for TypeScript, GraphQL schema documentation with SpectaQL
- **changelog-analyzer** — Added Conventional Commits integration, versioning strategy, automation pipeline recommendations
- **diataxis skill** — Added audience-based priority guidance, industry examples (Stripe, Linear, shadcn/ui), docs-as-code reference
- **keep-a-changelog skill** — Added changelog vs. release notes distinction, automation with Conventional Commits

---

## Recommendations: What to Do Next on Your Projects

### Immediate Actions (This Week)

1. **Adopt Conventional Commits across all projects**
   - 30-minute setup per project
   - Run `/contributing` on each project to generate the guide
   - Install commitlint + husky using the setup guide in `skills/conventional-commits/references/setup-guide.md`
   - Start with CI in warning mode, tighten after 2 weeks

2. **Create CONTRIBUTING.md and ARCHITECTURE.md for Kovač**
   - Use `/contributing` and `/architecture` commands
   - These two files eliminate 80% of onboarding friction
   - Have a senior dev review for accuracy

3. **Create your first ADRs**
   - Backfill 3-5 key decisions that are frequently re-discussed
   - Use `/adr` for each one
   - Interview original decision-makers if backfilling

### Short-term (Next 2-3 Sprints)

4. **Set up Starlight documentation site for Kovač**
   - English-only documentation
   - Pagefind for static search (no external service)
   - Deploy via Gitea Actions
   - Separate user docs (`help.kovac.app`) from dev docs (`developers.kovac.app`)

5. **Add Vale prose linting to CI**
   - Start with `MinAlertLevel = warning`
   - Use Microsoft + Google + write-good style packages
   - Create custom vocabulary for agency terms
   - Install VS Code extension for all team members

6. **Set up Storybook 8 for component docs**
   - Use `@storybook/builder-vite` (aligns with your build tool)
   - Auto-generate prop tables from TypeScript interfaces
   - Cover all shadcn/ui component variants

7. **Implement release-please for automated releases**
   - Creates Release PR with auto-generated changelog
   - Human review gate before publishing
   - Works with Gitea Actions

### Medium-term (Next Quarter)

8. **Generate API reference automatically**
   - TypeDoc for TypeScript API reference (JSON output → integrate into Starlight)
   - SpectaQL for GraphQL schema docs (static HTML)
   - Add TSDoc descriptions to all public functions
   - Enforce `eslint-plugin-tsdoc` in CI

9. **Add llms.txt for AI readiness**
   - Publish a plain-text summary at your docs root
   - Consider MCP server for Kovač API docs
   - This dramatically improves AI-assisted development across the agency

10. **Assign a "docs champion"**
    - One person maintains standards, templates, and style guide
    - Not a full-time role — think 2-4 hours/week
    - Prevents documentation entropy

### Cultural Changes

11. **Make documentation part of "definition of done"**
    - No PR merges without documentation for user-facing changes
    - Add ADR checkbox to PR template
    - Add changelog entry requirement (or use conventional commits)

12. **Allocate 10-15% of feature time to docs**
    - This is Stripe's approach — it's why their docs are best-in-class
    - The person who builds the feature writes its documentation

13. **Use AI for first drafts, humans for context**
    - AI excels at: TSDoc comments, README sections, ADR structure, prop tables
    - Humans must add: business context, architectural rationale, user empathy
    - Watch for "correct but useless" — AI describing WHAT without explaining WHY

### i18n / Localization (If Needed Later)

14. **Add localization only if a clear business need arises**
    - English is the default and only language for now
    - If localization is ever needed, use ICU MessageFormat with i18next
    - Use subdirectory URLs (`/en/docs/`, `/xx/docs/`) and `hreflang` tags
    - Consider Crowdin or Lokalise for translation management with Git integration
