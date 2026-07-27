# ADR Examples

## Example 1: API Style Choice

```markdown
# Use GraphQL over REST for the Kovač API

## Status

Accepted

## Context and Problem Statement

Kovač's frontend needs to fetch complex, nested data structures (projects with sprints, tasks, assignees, and comments). The frontend team frequently encounters over-fetching and under-fetching issues with REST endpoints, leading to multiple round-trips or bloated payloads.

## Decision Drivers

- Frontend needs flexible data fetching for varied views
- Mobile app planned (bandwidth sensitivity)
- Team has React + TypeScript expertise
- Need strong typing across the API boundary
- Real-time features planned (subscriptions)

## Considered Options

1. REST with OpenAPI
2. GraphQL with code-first schema
3. tRPC

## Decision Outcome

Chosen option: "GraphQL with code-first schema", because it provides the flexible querying the frontend needs, generates TypeScript types from the schema, supports subscriptions for real-time features, and has mature tooling (Apollo, urql, GraphiQL).

### Consequences

- Good, because frontend can request exactly the data it needs per view
- Good, because schema serves as a living API contract with TypeScript codegen
- Good, because subscriptions support planned real-time features
- Bad, because the team needs to learn GraphQL patterns (N+1, DataLoader)
- Bad, because caching is more complex than REST (no HTTP caching by default)
- Neutral, because monitoring and error tracking require GraphQL-aware tooling

## Pros and Cons of the Options

### REST with OpenAPI

- Good, because the team has extensive REST experience
- Good, because HTTP caching works out of the box
- Good, because simpler to reason about for basic CRUD
- Bad, because over-fetching/under-fetching requires custom endpoints per view
- Bad, because no built-in subscription model

### GraphQL with code-first schema

- Good, because flexible queries eliminate over/under-fetching
- Good, because schema-first typing with TypeScript codegen
- Good, because built-in subscription support
- Good, because GraphiQL provides interactive API exploration
- Bad, because learning curve for N+1 prevention (DataLoader)
- Bad, because more complex caching strategy needed

### tRPC

- Good, because end-to-end type safety with zero codegen
- Good, because simpler than GraphQL for TypeScript-only stacks
- Bad, because tightly couples frontend and backend (shared repo required)
- Bad, because no introspection or schema for external consumers
- Bad, because no subscription support without additional setup

## More Information

- [GraphQL Best Practices](https://graphql.org/learn/best-practices/)
- Related: ADR-0005 "Use urql over Apollo Client"
```

## Example 2: Documentation Tooling

```markdown
# Use Starlight (Astro) for documentation sites

## Status

Accepted

## Context and Problem Statement

We need a documentation framework for both user-facing (Kovač help center) and developer-facing documentation. The framework must support static site generation for self-hosting and be maintainable by a team that primarily works with React and TypeScript.

## Decision Drivers

- Must be self-hostable (no vendor lock-in)
- Team skills are React + TypeScript
- Full-text search without external services
- Markdown-based for docs-as-code workflow

## Considered Options

1. Starlight (Astro)
2. Docusaurus
3. VitePress
4. GitBook

## Decision Outcome

Chosen option: "Starlight (Astro)", because it uses Vite (aligning with our build tooling), supports React components inside Astro, includes Pagefind for fully static search, has built-in i18n support if ever needed, and is used by Cloudflare, Google, and Microsoft.

### Consequences

- Good, because i18next is available if localization is ever needed
- Good, because Pagefind search requires no external service
- Good, because React components work inside Astro pages
- Bad, because no built-in versioning (need starlight-versions plugin)
- Neutral, because Astro is a new framework for the team (but simple to learn)

## More Information

- [Starlight Documentation](https://starlight.astro.build)
- [starlight-versions plugin](https://github.com/HiDeoo/starlight-versions)
```
