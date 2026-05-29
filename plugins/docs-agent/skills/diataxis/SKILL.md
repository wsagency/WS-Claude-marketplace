---
description: Knowledge about the Diátaxis documentation framework for creating effective technical documentation
triggers:
  - documentation
  - docs
  - tutorial
  - how-to
  - reference
  - explanation
  - guide
---

# Diátaxis Documentation Framework

This skill provides comprehensive knowledge about the Diátaxis framework for organizing and writing technical documentation.

## Overview

Diátaxis identifies four distinct documentation types, each serving different user needs:

| Type | Orientation | Purpose | User Need |
|------|-------------|---------|-----------|
| **Tutorials** | Learning | Teach through doing | "I want to learn" |
| **How-to Guides** | Task | Solve specific problems | "I want to accomplish X" |
| **Reference** | Information | Describe the machinery | "I need to know Y" |
| **Explanation** | Understanding | Clarify concepts | "I want to understand Z" |

## The Four Quadrants

### Tutorials (Learning-Oriented)
- **Purpose**: Help beginners learn by doing
- **Approach**: Step-by-step lessons with guaranteed outcomes
- **Focus**: The learner's experience
- **Goal**: Build confidence and basic competence

### How-to Guides (Task-Oriented)
- **Purpose**: Help practitioners accomplish specific tasks
- **Approach**: Direct, practical instructions
- **Focus**: The problem to solve
- **Goal**: Successfully complete a task

### Reference (Information-Oriented)
- **Purpose**: Describe the system accurately
- **Approach**: Technical, austere, consistent
- **Focus**: The machinery itself
- **Goal**: Provide accurate information quickly

### Explanation (Understanding-Oriented)
- **Purpose**: Illuminate concepts and context
- **Approach**: Discursive, reflective
- **Focus**: Understanding why
- **Goal**: Deepen knowledge

## Key Principles

1. **Don't mix types** - Each document should be one type only
2. **Know your audience** - Tutorials for learners, how-tos for practitioners
3. **Serve user needs** - Match content type to what users are trying to do
4. **Maintain clear navigation** - Help users find the right type of content

## Audience-Based Priority

Different users need different quadrants prioritized:

| Audience | Primary Quadrants | Reasoning |
|----------|------------------|-----------|
| Non-technical users (PMs) | Tutorials, How-to Guides | Covers 80% of needs |
| Developers (API consumers) | Reference, How-to Guides | Need accuracy and recipes |
| New team members (onboarding) | Tutorials, Explanation | Need learning + context |
| Architects/evaluators | Explanation, Reference | Need "why" + "what" |

## Adopted By

Diátaxis is used by Cloudflare, Canonical/Ubuntu, Django, Gatsby, and many other major projects. Created by Daniele Procida.

## Common Mistakes

- Tutorial that becomes a how-to (loses teaching focus)
- Reference that includes tutorial content (confuses purpose)
- How-to that explains too much (slows down task completion)
- Explanation mixed into reference (dilutes both)
- **Most neglected**: Explanation quadrant (the "why" behind decisions)

## Industry Examples

- **Stripe**: Three-column layout, code synced with prose, "docs are part of done"
- **Linear**: Benefit-driven changelog, visual-first, tied to sprint cycles
- **shadcn/ui**: Live preview, installation command, variant examples, AI-ready (llms.txt)
- **Next.js**: Diátaxis in practice — Getting Started (tutorials), Guides (how-to), API Reference

## References

- [Diátaxis Official Documentation](https://diataxis.fr)
- See `references/` for detailed guidance on each type
- See `examples/` for templates and examples

## Relationship to the dual-track docs convention

This skill describes the Diátaxis framework in general. In the WS Agency convention (see the `dual-track-docs` skill), Diátaxis is primarily applied to the user track (`docs/`). The internal track (`dev-docs/`) uses a Diátaxis-like substructure (`runbooks/`, `reference/`, `explanation/`) but with the maintainer audience instead of the external user.

When picking a Diátaxis quadrant for a new doc, decide audience first:
- **External user** → goes in `docs/<quadrant>/`
- **Internal contributor** → goes in `dev-docs/<quadrant-or-runbook>/`
