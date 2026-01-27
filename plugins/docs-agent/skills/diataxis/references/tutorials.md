# Writing Tutorials

Tutorials are **learning-oriented** documentation that takes the reader through a series of steps to complete a project or learn a skill.

## Purpose

- Help a beginner achieve basic competence
- Provide a safe learning environment
- Build confidence through success

## Characteristics

### Focus on Learning, Not Accomplishment
The goal is education, not task completion. The project exists to serve learning.

### Provide a Complete Journey
- Start from zero assumptions
- End with a working result
- Every step leads to the next

### Guarantee Success
- Test every step
- Provide exact commands/code
- Anticipate common mistakes

## Structure

```markdown
# Tutorial: [What You'll Build/Learn]

## Introduction
Brief overview of what the learner will accomplish.

## Prerequisites
- What they need before starting
- Required knowledge level
- Software/tools needed

## Step 1: [First Action]
Clear instructions with expected outcomes.

## Step 2: [Second Action]
Build on previous step.

[Continue steps...]

## Conclusion
- Summarize what was learned
- Suggest next steps
- Link to related content
```

## Writing Guidelines

### Do:
- Use "we" to include yourself with the learner
- Explain what's happening as you go
- Keep explanations brief—just enough for understanding
- Provide checkpoints ("You should now see...")
- Include screenshots or output examples
- Test every instruction yourself

### Don't:
- Offer choices or alternatives (decision fatigue)
- Include unnecessary concepts
- Skip steps, even "obvious" ones
- Assume prior knowledge you didn't establish
- Let the tutorial become a reference

## Example Opening

```markdown
# Tutorial: Build Your First REST API

In this tutorial, you'll create a simple REST API that manages a
list of books. By the end, you'll have a working API running
locally that you can test in your browser.

We'll use Node.js and Express. Don't worry if you're new to these
tools—we'll explain everything as we go.

## What You'll Learn
- Setting up a Node.js project
- Creating API endpoints
- Handling HTTP requests
- Testing your API

## Prerequisites
- Node.js installed (version 18 or higher)
- A code editor (VS Code recommended)
- Basic familiarity with the command line

Let's get started!
```

## Common Mistakes

1. **Too much explanation** - Save deep dives for Explanation docs
2. **Offering choices** - Pick one path and stick to it
3. **Untested steps** - Always verify instructions work
4. **Missing context** - Tell them why each step matters
5. **Unclear outcomes** - Show what success looks like
