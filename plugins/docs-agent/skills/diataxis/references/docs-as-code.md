# Docs-as-Code Methodology

Documentation is written in Markdown, stored in Git, reviewed through pull requests, linted in CI, and deployed automatically. Writers and developers share ownership.

## Core Principle

**A feature isn't "done" until its documentation ships.** Stripe enforces this literally — no PR merges without documentation updates.

## Implementation

### Repository Structure

```
project-repo/
├── docs/
│   ├── user/           # End-user documentation (Starlight)
│   ├── developer/      # Developer documentation (Starlight)
│   │   ├── api/        # Auto-generated from TypeDoc + SpectaQL
│   │   ├── architecture/
│   │   └── decisions/  # ADRs
│   └── shared/
│       ├── vale/       # Linting rules
│       └── templates/  # Diátaxis-aligned Markdown templates
├── src/
├── CHANGELOG.md
├── CONTRIBUTING.md
├── ARCHITECTURE.md
└── .gitea/workflows/   # CI/CD for building docs
```

### PR Template

Add documentation checks to your pull request template:

```markdown
## Checklist
- [ ] Documentation updated for user-facing changes
- [ ] Does this change require a new ADR?
- [ ] CHANGELOG.md updated (or using conventional commits)
```

### CI Pipeline for Docs

```yaml
# Triggered on PRs that touch docs
name: Documentation
on:
  pull_request:
    paths: ['docs/**/*.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'ARCHITECTURE.md']

jobs:
  prose-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: errata-ai/vale-action@v2
        with:
          files: docs/

  link-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: lycheeverse/lychee-action@v1
        with:
          args: 'docs/**/*.md'
```

### Definition of Done

Update your team's definition of done to include:

1. Code reviewed and approved
2. Tests pass
3. **Documentation updated for user-facing changes**
4. **ADR created for architectural decisions**
5. **Changelog entry added (or via conventional commit)**

### Time Allocation

Allocate **10-15% of feature development time** to documentation. This is not overhead — it's the investment that prevents 10x more time spent answering questions, onboarding new developers, and re-arguing settled decisions.

## Tooling Stack

| Purpose | Tool | Why |
|---------|------|-----|
| Documentation site | Starlight (Astro) | React-compatible, Vite, static search, i18n-ready |
| Component docs | Storybook 8 | Living styleguide, Vite builder |
| TypeScript API ref | TypeDoc | JSON output integrates into Starlight |
| GraphQL API docs | SpectaQL | Auto-generates from schema, static deploy |
| Prose linting | Vale | Microsoft + Google styles, CI integration |
| Internal knowledge | Notion | Meeting notes, RFCs — NOT for public docs |
| CI/CD | Gitea Actions | GitHub Actions compatible, self-hosted |
| Translation (if needed) | Crowdin or Lokalise | Git integration for localization workflow |

## Stale Documentation Detection

The hardest documentation problem is drift. Approaches:

1. **Swimm**: Links docs to code — when code changes, docs are flagged/auto-updated
2. **Simple CI check**: Flag when documented files change but docs aren't updated
3. **Review culture**: Include doc review in code review process
4. **AI-assisted**: Use AI to generate first drafts, humans add context and verify
