---
name: adr
description: Knowledge about Architecture Decision Records (ADRs) using MADR v4.0.0 format. Use when writing or discussing an ADR, an architecture/design/technical decision, a decision record, a tradeoff, or a "why we chose" question.
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

## Two-Tier Rule: Lightweight by Default, Full MADR for Big Decisions

Not every decision deserves a full MADR document. Use two tiers:

**Lightweight (the default).** A Matt-style micro-ADR: a title plus 1-3 sentences covering what we're deciding, why, and what would make us revisit it. Use this for every decision unless the full-MADR criteria below are met.

```markdown
# NNNN — [Title of the decision]

[1-3 sentences: what we're deciding + why + what would trigger revisiting it.]
```

**Full MADR v4.0.0 (big decisions only).** Required when the decision meets any of these criteria:

- **Breaking** — it changes a public contract, convention, or behavior others depend on
- **Costly to undo** — reversing it later would take significant rework or migration
- **Multiple serious options** — there were real alternatives whose tradeoffs deserve a written comparison

Both tiers live in the same home (`dev-docs/decisions/`) and share one sequential numbering — a lightweight ADR and a full MADR are peers in the same `NNNN` sequence. A lightweight ADR can later be superseded by a full one (and vice versa) using the normal supersede flow.

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

Store ADRs in `dev-docs/decisions/` numbered sequentially (lightweight and full MADR share the same sequence):

```
dev-docs/decisions/
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
- [ ] Does this change require a new ADR? If yes, add one in `dev-docs/decisions/`
```

## References

- [MADR on GitHub](https://adr.github.io/madr/)
- [ADR GitHub Organization](https://adr.github.io/)
- See `references/` for detailed guidance
- See `examples/` for real-world ADR examples

## Destination in the dual-track convention

ADRs are internal contributor documentation. They live in `dev-docs/decisions/`, never in user-facing `docs/`. `/ws-docs adr` always writes there.
