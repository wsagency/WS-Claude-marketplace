---
description: Create an Architecture Decision Record (ADR) for a technical decision
arguments:
  - name: decision
    description: The decision to document (e.g., "use GraphQL over REST", "choose Drizzle ORM")
    required: true
allowed_tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
---

# Create Architecture Decision Record

Create an ADR in MADR v4.0.0 format documenting the decision about **{{ decision }}**.

## Your Task

1. **Analyze the codebase** to understand the context and constraints
2. **Check for existing ADRs** in `dev-docs/decisions/` to determine the next number
3. **Research the decision** by examining the project's stack and requirements
4. **Generate the ADR** using the MADR v4.0.0 template
5. **Save and index** the ADR

## Process

Use the `adr-writer` agent to:
1. Understand the decision context from the codebase
2. Identify considered options and their tradeoffs
3. Write a complete ADR with honest pros/cons
4. Save to `dev-docs/decisions/NNNN-kebab-case-title.md`
5. Update the ADR index if `dev-docs/decisions/README.md` exists

## Skills to Use

Load the `adr` skill for:
- MADR v4.0.0 format specification
- Writing guidelines and best practices
- Real-world ADR examples

## Output

The ADR will include:
- Status (Proposed by default — user marks as Accepted)
- Context and problem statement
- Decision drivers
- At least 2 considered options with pros/cons
- Decision outcome with "because" justification
- Consequences (both good and bad)

## Quality Checklist

- [ ] Title clearly states the decision
- [ ] Context explains the "why"
- [ ] Multiple options considered
- [ ] Honest tradeoffs documented
- [ ] Sequentially numbered
- [ ] Indexed in README.md

## Examples

`/adr "use GraphQL over REST for the API"`
`/adr "choose TanStack Router over React Router"`
`/adr "adopt Drizzle ORM for database access"`
`/adr "use Starlight for documentation site"`
