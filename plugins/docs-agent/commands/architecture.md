---
description: Generate an ARCHITECTURE.md file following matklad's pattern
arguments:
  - name: output-path
    description: Where to save the file (default: ./ARCHITECTURE.md)
    required: false
allowed_tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
---

# Generate Architecture Document

Analyze the codebase and generate an ARCHITECTURE.md following Alexey Kladov's (matklad) pattern from the rust-analyzer project.

## Your Task

1. **Map the codebase** — Understand the high-level structure
2. **Identify patterns** — Frameworks, architecture styles, key dependencies
3. **Trace data flow** — How requests/operations flow through the system
4. **Generate ARCHITECTURE.md** — Concise, high-level, newcomer-friendly

## Process

Use the `architecture-documenter` agent to:
1. Scan top-level directories and their purpose
2. Identify entry points and module boundaries
3. Map data flow through the system
4. Document key architectural decisions
5. Generate a concise architecture overview

## Output Structure

The document will include:

- **Bird's Eye View** — What the system does in 2-3 paragraphs
- **Code Map** — Each major directory and its responsibility
- **Data Flow** — How a typical request flows end-to-end
- **Key Design Decisions** — Important choices with links to ADRs
- **Cross-Cutting Concerns** — Auth, error handling, configuration
- **Testing Strategy** — Overview of test approach
- **Deployment** — Build and deploy overview

## Guidelines

- **Keep it short** — 2-4 pages. This is a map, not a manual
- **Describe the forest** — Not individual trees
- **Include diagrams** — Mermaid diagrams where helpful
- **Update rarely** — 2-3 times per year, not per commit
- **Link to specifics** — Point to ADRs and reference docs for details

## Examples

`/architecture` — Generate ARCHITECTURE.md in project root
`/architecture docs/ARCHITECTURE.md` — Save to custom path
