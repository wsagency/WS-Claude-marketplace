---
description: Knowledge about Architecture Decision Records (ADRs) using MADR v4.0.0 format
triggers:
  - adr
  - architecture decision
  - decision record
  - design decision
  - technical decision
  - why we chose
  - tradeoff
---

# Architecture Decision Records (ADRs)

This skill provides knowledge about creating and maintaining Architecture Decision Records using the MADR v4.0.0 (Markdown Any Decision Records) format.

## Overview

ADRs capture the "why" behind technical choices. They prevent teams from re-arguing settled decisions and give new team members context on past choices. ADRs are in ThoughtWorks' Technology Radar "Adopt" category and used by AWS and the UK Government Digital Service.

## When to Write an ADR

- Choosing between technologies or frameworks
- Selecting an architectural pattern
- Making infrastructure decisions
- Changing a significant convention
- Any decision that would be questioned 6 months later

## MADR v4.0.0 Format

```markdown
# [short title of solved problem and solution]

## Status

[Proposed | Accepted | Deprecated | Superseded by [ADR-XXXX](link)]

## Context and Problem Statement

[Describe the context and problem. Why is this decision needed?
What forces are at play? 2-3 sentences.]

## Decision Drivers

- [driver 1, e.g., technical constraint]
- [driver 2, e.g., business requirement]
- [driver 3, e.g., team expertise]

## Considered Options

1. [Option 1]
2. [Option 2]
3. [Option 3]

## Decision Outcome

Chosen option: "[Option N]", because [justification].

### Consequences

- Good, because [positive consequence]
- Good, because [another positive consequence]
- Bad, because [negative consequence or accepted tradeoff]
- Neutral, because [neither positive nor negative]

## Pros and Cons of the Options

### [Option 1]

- Good, because [argument]
- Good, because [argument]
- Neutral, because [argument]
- Bad, because [argument]

### [Option 2]

- Good, because [argument]
- Bad, because [argument]

### [Option 3]

- Good, because [argument]
- Bad, because [argument]

## More Information

[Links to relevant resources, related ADRs, or meeting notes]
```

## File Organization

Store ADRs in `docs/decisions/` numbered sequentially:

```
docs/decisions/
├── 0001-use-graphql-over-rest.md
├── 0002-choose-tanstack-router.md
├── 0003-adopt-drizzle-orm.md
├── 0004-use-starlight-for-docs.md
└── README.md  (index of all ADRs)
```

## Key Principles

1. **Immutable once accepted** — Don't edit accepted ADRs; create a new one that supersedes
2. **Short and focused** — One decision per ADR, 1-2 pages maximum
3. **Include the "why"** — The reasoning matters more than the choice
4. **List what you rejected** — Future you needs to know what was considered
5. **Date them** — Include the date in metadata or filename

## PR Template Integration

Add to your pull request template:

```markdown
## Checklist
- [ ] Does this change require a new ADR? If yes, add one in `docs/decisions/`
```

## References

- [MADR on GitHub](https://adr.github.io/madr/)
- [ADR GitHub Organization](https://adr.github.io/)
- See `references/` for detailed guidance
- See `examples/` for real-world ADR examples
