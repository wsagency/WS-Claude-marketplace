---
description: Create a learning-oriented tutorial for a specific topic
arguments:
  - name: topic
    description: The topic or feature to create a tutorial for
    required: true
allowed_tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
---

# Create Tutorial

Generate a learning-oriented tutorial following Diátaxis guidelines.

## Your Task

Create a hands-on tutorial that teaches the user about **{{ topic }}** through a guided, step-by-step experience.

## Tutorial Characteristics

Tutorials are:
- **Learning-oriented**: Focus on helping beginners learn
- **Hands-on**: The reader does things, not just reads
- **Guaranteed to succeed**: Every step has been tested
- **Confidence-building**: Small wins lead to bigger ones

## Process

1. **Understand the topic** by analyzing relevant code and documentation
2. **Design a learning journey** with clear start and end points
3. **Create step-by-step instructions** that are tested and complete
4. **Write the tutorial** following Diátaxis guidelines

Use the `tutorial-writer` agent to generate the content.

## Required Structure

```markdown
# Tutorial: [What They'll Build/Learn]

[Hook: Why this is worth learning]

## What You'll Learn
- [Skill 1]
- [Skill 2]

## Prerequisites
- [What they need]

## Step 1: [Action]
[Instructions and expected output]

## Step 2: [Action]
[Continue...]

## Conclusion
[Summary and next steps]
```

## Skills to Use

Load the `diataxis` skill, specifically the tutorials reference, for:
- Writing guidelines
- Tone and voice
- Common mistakes to avoid

## Quality Checklist

The tutorial must:
- [ ] Have a clear, achievable goal
- [ ] List all prerequisites
- [ ] Include testable steps
- [ ] Show expected outputs
- [ ] Build incrementally
- [ ] End with a working result
- [ ] Suggest next steps

## Writing Guidelines

**Do:**
- Use "we" to include yourself with the learner
- Provide exact commands to type
- Show what success looks like
- Keep explanations brief

**Don't:**
- Offer alternatives or choices
- Assume knowledge not in prerequisites
- Skip "obvious" steps
- Include deep explanations (link to them)

## Example Topics

- "Getting started with [project]"
- "Build your first [feature]"
- "Learn [concept] by building [thing]"
