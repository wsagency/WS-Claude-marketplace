---
description: Write an understanding-oriented explanation of a concept
arguments:
  - name: concept
    description: The concept, architecture decision, or topic to explain
    required: true
allowed_tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
---

# Write Explanation

Create an understanding-oriented explanation of **{{ concept }}**.

## Your Task

Write documentation that helps readers deeply understand the concept, including why things are the way they are, what tradeoffs were made, and how it connects to the bigger picture.

## Explanation Characteristics

Explanations are:
- **Understanding-oriented**: Help readers grasp the "why"
- **Discursive**: Explore topics from multiple angles
- **Context-providing**: Explain history and reasoning
- **Thought-provoking**: Enable informed decisions

## Process

1. **Research the concept** in the codebase
2. **Understand the context** and reasoning
3. **Write a comprehensive explanation**
4. **Connect to related concepts**

## Required Structure

```markdown
# Understanding [Concept]

## Introduction
[Set up what will be explored]

## Background
[Historical context or foundational concepts]

## [Core Concept]
[Main explanation with examples and analogies]

## Why It Matters
[Practical implications]

## Common Misconceptions
[Address frequent misunderstandings]

## Tradeoffs
[Discuss alternatives and their implications]

## Conclusion
[Summarize key insights]

## Further Reading
[Links to related content]
```

## Skills to Use

Load the `diataxis` skill, specifically the explanations reference, for:
- Writing guidelines
- Appropriate tone
- How to handle complexity

## Quality Checklist

Explanations must:
- [ ] Address the "why" not just "what"
- [ ] Provide context and background
- [ ] Use helpful analogies
- [ ] Acknowledge tradeoffs
- [ ] Connect to the bigger picture
- [ ] Link to related docs

## Writing Guidelines

**Do:**
- Explain reasoning and context
- Use analogies to clarify
- Discuss alternatives and tradeoffs
- Be thoughtful and nuanced

**Don't:**
- Include step-by-step instructions
- Focus only on "how" without "why"
- Be superficial
- Avoid complexity

## Differences from Other Types

| Explanations | Reference | Tutorials | How-tos |
|-------------|-----------|-----------|---------|
| Why | What | Learn by doing | Accomplish task |
| Context | Facts | Journey | Direct steps |
| Depth | Completeness | Guidance | Solutions |

## Example Topics

- "Understanding the plugin architecture"
- "Why we chose X over Y"
- "How authentication works"
- "The event system explained"
