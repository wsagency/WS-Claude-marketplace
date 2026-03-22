---
description: Knowledge about documentation style guides and prose linting for consistent, high-quality technical writing
triggers:
  - style guide
  - writing style
  - vale
  - prose linting
  - tone
  - voice
  - technical writing
  - documentation quality
---

# Documentation Style Guide

This skill provides knowledge about industry-standard writing style guides for technical documentation, prose linting with Vale, and agency-specific terminology management.

## Canonical Base: Google Developer Documentation Style Guide

The Google style guide (CC-BY 4.0, freely usable) is the recommended base for all documentation at websolutions.hr. Key rules:

### Voice and Person
- **Second person**: "You can configure..." (not "The user can configure...")
- **Active voice**: "The API returns a list" (not "A list is returned by the API")
- **Present tense**: "This command installs..." (not "This command will install...")

### Sentence Structure
- **Conditions before instructions**: "If you need OAuth, enable SSO in settings" (not "Enable SSO in settings if you need OAuth")
- **Serial (Oxford) comma**: "tasks, projects, and sprints" (not "tasks, projects and sprints")
- **Short sentences**: Aim for 20-25 words per sentence maximum

### Word Choice
- **Contractions are fine**: "you'll", "don't", "isn't" — makes docs friendlier
- **Avoid jargon without definition**: Define technical terms on first use
- **One word per concept**: Pick "project" or "workspace" and never alternate
- **Avoid "simply", "just", "easy"**: What's easy for you may not be easy for the reader

### Formatting
- **Code in backticks**: Use `code` for commands, filenames, parameters, values
- **Bold for UI elements**: Click **Settings** > **General**
- **No "please"**: Be direct — "Click Save" not "Please click Save"

## Microsoft Writing Style Guide Additions

Where Microsoft's guide complements Google's:

- **Warmth and clarity**: Write like you speak to a knowledgeable friend
- **Get to the point**: Lead with the most important information
- **Never condescend**: Don't assume the reader "should have known"
- **Bias-free language**: Use inclusive terminology

## Apple HIG Writing Principles

For UI-facing copy and error messages:

- **Action-oriented language**: Label buttons with verbs ("Save Project", not "OK")
- **Error messages near the problem**: Show what went wrong and how to fix it
- **Consistency in terminology**: Same action = same word everywhere

## Terminology Management

Maintain an internal terminology sheet. Decide once, use everywhere:

| Preferred Term | Avoid | Reason |
|---------------|-------|--------|
| sign in | log in, login | Industry standard |
| select | check, tick | Platform-neutral |
| email | e-mail | Modern convention |
| open source | open-source | When used as noun |

## Vale: Automated Prose Linting

Vale enforces style rules automatically in CI and editors.

### Configuration (.vale.ini)

```ini
StylesPath = docs/vale/styles
MinAlertLevel = warning

Packages = Microsoft, Google, write-good

[docs/**/*.md]
BasedOnStyles = Microsoft, Google, write-good

# Custom vocabulary
Vocab = WebSolutions
```

### Custom Vocabulary

Create `docs/vale/styles/Vocab/WebSolutions/accept.txt` for product names, technical terms, and brand names that Vale should not flag.

### CI Integration

```yaml
# .gitea/workflows/vale.yml
name: Prose Lint
on:
  pull_request:
    paths: ['docs/**/*.md']
jobs:
  vale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: errata-ai/vale-action@v2
        with:
          files: docs/
```

### Editor Integration

Install the Vale VS Code extension for all team members. This gives real-time feedback while writing.

## Quality Metrics

Good documentation meets these measurable criteria:

- **Flesch-Kincaid Grade Level**: Target 8-10 (accessible to most readers)
- **Sentence length**: Average 15-20 words
- **Passive voice**: Under 10% of sentences
- **Terminology consistency**: Zero synonym drift per document

## References

- [Google Developer Documentation Style Guide](https://developers.google.com/style)
- [Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/)
- [Vale Documentation](https://vale.sh/docs/)
- See `references/` for detailed guidelines
- See `examples/` for before/after rewrites
