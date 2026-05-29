---
description: Create a task-oriented how-to guide for solving a specific problem
arguments:
  - name: task
    description: The task or problem the guide will help users accomplish
    required: true
allowed_tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
---

# Create How-to Guide

Generate a task-oriented how-to guide following Diátaxis guidelines.

## Audience routing

Before writing anything, determine the audience:

1. Read `.claude/docs-config.yaml` if it exists. If `docs.default_audience` is `user` or `dev`, use that without prompting.
2. Otherwise, ask the user via AskUserQuestion:
   > Who reads this? **External user** (consumer / end-user / library client) **or Internal contributor** (maintainer / dev team)?
3. Cache the answer in the session for any further docs commands.

Destination based on the answer:
- **user** → `docs/how-to/<slug>.md`
- **dev** → `dev-docs/runbooks/<slug>.md`

## Your Task

Create a practical guide that helps users accomplish **{{ task }}**. Write to the destination determined in the Audience routing section above.

## How-to Guide Characteristics

How-to guides are:
- **Task-oriented**: Focus on accomplishing a specific goal
- **Practical**: Direct steps that solve real problems
- **For practitioners**: Assumes basic competence
- **Flexible**: Acknowledges different contexts

## Process

1. **Understand the task** by analyzing relevant code and features
2. **Identify prerequisites** and common variations
3. **Write direct, actionable steps**
4. **Add verification and troubleshooting**

## Required Structure

```markdown
# How to [Accomplish Task]

[One sentence describing what this guide covers]

## Prerequisites
- [Required condition 1]
- [Required condition 2]

## Steps

### 1. [First Action]
[Instructions]

### 2. [Second Action]
[Instructions]

## Verification
[How to confirm success]

## Troubleshooting
[Common issues and solutions]

## See Also
[Related guides and references]
```

## Skills to Use

Load the `diataxis` skill, specifically the how-to guides reference, for:
- Writing guidelines
- Differences from tutorials
- Common mistakes to avoid

## Quality Checklist

The guide must:
- [ ] Title with "How to [verb]..."
- [ ] State prerequisites clearly
- [ ] Provide complete, working steps
- [ ] Include verification
- [ ] Address common problems
- [ ] Link to related content

## Writing Guidelines

**Do:**
- Be direct and practical
- Assume they know the basics
- Provide working solutions
- Include troubleshooting

**Don't:**
- Explain concepts (link to explanations)
- Teach fundamentals (link to tutorials)
- List every option (link to reference)
- Assume specific setups

## Differences from Tutorials

| How-to Guides | Tutorials |
|---------------|-----------|
| Solve a problem | Teach a skill |
| For practitioners | For beginners |
| Direct to goal | Learning journey |
| Flexible paths | Single path |

## Example Tasks

- "How to deploy to production"
- "How to configure authentication"
- "How to migrate from v1 to v2"
- "How to troubleshoot connection errors"
