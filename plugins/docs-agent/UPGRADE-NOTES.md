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
- **docs-architect** — Now checks for 7 required artifacts, includes TSDoc/GraphQL/Storybook guidance, docs-as-code enforcement, AI readiness recommendations
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
