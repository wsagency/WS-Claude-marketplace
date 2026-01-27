---
description: Generate a complete documentation suite following the Diátaxis framework
arguments:
  - name: output-dir
    description: Directory to create documentation in (default: ./docs)
    required: false
allowed_tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
---

# Generate Documentation Suite

Analyze the codebase and generate comprehensive documentation following the [Diátaxis](https://diataxis.fr) framework.

## Your Task

1. **Analyze the codebase** to understand its structure, features, and APIs
2. **Create a documentation plan** identifying what's needed in each quadrant
3. **Present the plan** to the user for approval
4. **Generate documentation** for each approved section

## Diátaxis Quadrants

The documentation will be organized into four types:

| Type | Purpose | Directory |
|------|---------|-----------|
| **Tutorials** | Learning-oriented, hands-on for beginners | `tutorials/` |
| **How-to Guides** | Task-oriented, problem-solving | `how-to/` |
| **Reference** | Information-oriented, technical details | `reference/` |
| **Explanation** | Understanding-oriented, concepts | `explanation/` |

## Process

### Phase 1: Analysis
Use the `docs-architect` agent to:
- Scan the codebase structure
- Identify public APIs and features
- Assess existing documentation
- Create a documentation plan

### Phase 2: User Approval
Present the plan showing:
- Proposed documentation structure
- List of documents to create
- Priority order
- Estimated scope

### Phase 3: Generation
For each approved document, use the appropriate agent:
- `tutorial-writer` for tutorials
- `api-documenter` for reference docs
- General writing for how-tos and explanations

## Output Structure

```
{output-dir}/
├── index.md                    # Documentation home
├── tutorials/
│   ├── getting-started.md
│   └── ...
├── how-to/
│   └── ...
├── reference/
│   ├── api.md
│   ├── configuration.md
│   └── ...
└── explanation/
    └── ...
```

## Skills to Use

Load the `diataxis` skill for:
- Writing guidelines for each documentation type
- Templates and examples
- Quality standards

## Important Guidelines

- **Don't duplicate** existing good documentation
- **Prioritize** the most impactful docs first
- **Match scope** to project complexity
- **Maintain consistency** across all docs
- **Include navigation** and cross-references

## Example Index Page

```markdown
# Project Documentation

Welcome to the [Project Name] documentation.

## Getting Started

New to [Project]? Start with our tutorials:
- [Quick Start Tutorial](tutorials/getting-started.md)

## How-to Guides

Practical guides for common tasks:
- [How to Configure X](how-to/configure-x.md)

## Reference

Technical reference documentation:
- [API Reference](reference/api.md)
- [Configuration Reference](reference/configuration.md)

## Understanding [Project]

Learn about the concepts and architecture:
- [Architecture Overview](explanation/architecture.md)
```
