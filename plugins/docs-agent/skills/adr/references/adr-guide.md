# ADR Writing Guide

## Common Decision Categories for a Web Agency

### Technology Choices
- Frontend framework selection
- Backend language or framework
- Database selection (SQL vs. NoSQL, specific engine)
- API style (REST, GraphQL, gRPC)
- CSS approach (Tailwind, CSS Modules, styled-components)

### Architecture Patterns
- Monolith vs. microservices
- Server-side rendering vs. SPA vs. hybrid
- Authentication strategy (JWT, sessions, OAuth)
- State management approach
- Caching strategy

### Infrastructure
- Cloud provider selection
- CI/CD pipeline design
- Deployment strategy (containers, serverless, VMs)
- Monitoring and observability stack
- Self-hosted vs. managed services

### Conventions
- Code style and linting rules
- Git branching strategy
- Versioning scheme (SemVer vs. CalVer)
- Documentation framework
- Testing strategy (unit, integration, e2e ratios)

## Writing Tips

### Context and Problem Statement
This is the most important section. A reader should understand the decision without reading anything else. Include:
- What triggered the decision
- What constraints exist
- What the business requirement is

### Decision Drivers
List the criteria used to evaluate options. These make the decision process transparent and repeatable. Common drivers:
- Performance requirements
- Team expertise and learning curve
- Community support and ecosystem maturity
- Licensing and cost
- Integration with existing stack
- Long-term maintenance burden

### Considered Options
List at least 2 options. "Do nothing" is always a valid option. For each option, provide an honest assessment of pros and cons.

### Decision Outcome
Be explicit about which option was chosen AND why. The "because" clause is the most valuable part of an ADR.

### Consequences
Be honest about tradeoffs. Every decision has downsides — acknowledging them builds trust and helps future decision-makers.

## ADR Lifecycle

```
Proposed → Accepted → [Deprecated | Superseded]
```

- **Proposed**: Under discussion, not yet decided
- **Accepted**: Decision is final and in effect
- **Deprecated**: Decision is no longer relevant (e.g., project evolved)
- **Superseded**: A new ADR replaces this one (link to the new ADR)

## Maintaining the ADR Index

Keep a `README.md` in the decisions directory:

```markdown
# Architecture Decision Records

| # | Title | Status | Date |
|---|-------|--------|------|
| 0001 | [Use GraphQL over REST](0001-use-graphql-over-rest.md) | Accepted | 2025-06-15 |
| 0002 | [Choose TanStack Router](0002-choose-tanstack-router.md) | Accepted | 2025-07-01 |
| 0003 | [Adopt Drizzle ORM](0003-adopt-drizzle-orm.md) | Accepted | 2025-08-10 |
```

## Anti-Patterns

1. **ADR as specification** — Keep it to 1-2 pages. If you need more, link to an RFC
2. **ADR without alternatives** — Always list what you considered and rejected
3. **Retroactive ADRs without context** — If backfilling, interview the original decision-makers
4. **ADR committee** — Keep the process lightweight; the builder writes the ADR
5. **Editing accepted ADRs** — Supersede, don't edit
