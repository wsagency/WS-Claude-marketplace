# Conventional Commit Examples

## Feature Commits

```
feat(auth): add OAuth 2.1 support for SSO

Implement OAuth 2.1 authorization code flow with PKCE for
enterprise single sign-on integration.

Closes #234
```

```
feat(dashboard): add dark mode toggle in settings
```

```
feat(api): add pagination support to project listing endpoint

Implement Relay-style cursor pagination for the projects query.
Default page size is 25, maximum is 100.
```

## Fix Commits

```
fix(billing): resolve incorrect totals in monthly summary

The tax calculation was applied before the discount, resulting
in overcharges for users with active promotions.

Fixes #567
```

```
fix(auth): prevent redirect loop on expired sessions
```

## Breaking Change Commits

```
feat(api)!: rename config.timeout to config.requestTimeout

BREAKING CHANGE: The `timeout` configuration option has been
renamed to `requestTimeout` for clarity. Update your config
files accordingly.
```

```
feat!: drop support for Node.js 16

BREAKING CHANGE: Minimum supported Node.js version is now 18.
Node.js 16 reached end-of-life in September 2023.
```

## Documentation Commits

```
docs(readme): update installation instructions for v2
```

```
docs(api): add GraphQL schema descriptions for all types
```

## Other Types

```
refactor(core): extract validation logic into shared module
```

```
perf(search): add database index for full-text search queries

Reduces search response time from ~800ms to ~50ms for typical queries.
```

```
test(auth): add integration tests for OAuth flow
```

```
build(deps): update React from 18.2 to 18.3
```

```
ci(deploy): add staging environment to deployment pipeline
```

```
chore: update .gitignore for new IDE config files
```

## Bad Examples (Don't Do This)

```
# Too vague
fix: fix bug

# No type
updated the login page

# Past tense (use imperative)
feat: added dark mode

# Too long subject
feat(dashboard): add a new comprehensive analytics dashboard with charts, graphs, tables, and export functionality that supports PDF and CSV formats
```

## Commit Message Template (.gitmessage)

```
# <type>(<scope>): <subject>
#
# Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
# Scope: optional noun describing section (auth, api, ui, db, etc.)
# Subject: imperative, lowercase, no period, max 100 chars
#
# Body: explain WHAT and WHY (not HOW), wrap at 100 chars
#
# Footer: BREAKING CHANGE: description
#         Fixes #issue
#         Closes #issue
```
