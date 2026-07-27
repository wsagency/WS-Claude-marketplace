# Technical Writing Rules Reference

## Headings

- Use sentence case: "Configure your project" (not "Configure Your Project")
- Use descriptive headings: "Install the CLI" (not "Installation")
- Don't skip heading levels (h2 → h4)
- Don't use headings as the only content in a section

## Lists

- Use numbered lists for sequential steps
- Use bulleted lists for non-sequential items
- Keep list items parallel in grammar: all start with verbs, or all are noun phrases
- End list items with periods if they are complete sentences
- Don't end with periods if they are fragments or short phrases

## Code Examples

- Always specify the language in fenced code blocks: ` ```typescript `
- Show complete, runnable examples (no `...` or `// your code here`)
- Keep examples minimal — just enough to demonstrate the concept
- Include expected output where helpful
- Use realistic values in examples (not "foo", "bar", "baz")

## Links

- Use descriptive link text: "See the [configuration guide](link)" (not "[click here](link)")
- Verify all links work before publishing
- Use relative links within the same documentation site
- Use absolute URLs for external references

## Images and Screenshots

- Add alt text to every image describing its content
- Use consistent dimensions and styling
- Update screenshots when UI changes
- Prefer diagrams over screenshots for architecture docs
- Use SVG for diagrams, PNG for screenshots

## Numbers

- Spell out numbers one through nine; use numerals for 10 and above
- Always use numerals for technical values: "3 parameters", "5 MB"
- Use commas in numbers over 999: "1,000", "10,000"

## Abbreviations and Acronyms

- Spell out on first use: "Application Programming Interface (API)"
- After first use, use the abbreviation: "The API supports..."
- Don't spell out universally known abbreviations: URL, HTTP, HTML, CSS, JS

## Tone by Document Type

| Document Type | Tone | Example |
|--------------|------|---------|
| Tutorial | Friendly, encouraging | "Great! You've just created your first project." |
| How-to | Direct, efficient | "Run the migration command." |
| Reference | Neutral, precise | "Returns a `Promise<string>` containing the file contents." |
| Explanation | Thoughtful, engaging | "The reason we chose GraphQL over REST comes down to..." |
| Changelog | Factual, benefit-driven | "Add dark mode support for all UI components" |
| Error messages | Clear, actionable | "Could not connect to database. Check your DATABASE_URL." |

## Common Mistakes

### Anthropomorphizing software
- Bad: "The system wants you to..."
- Good: "The system requires..."

### Burying the lead
- Bad: "Due to various performance considerations and after extensive testing, we recommend..."
- Good: "Use connection pooling for better performance."

### Unclear antecedents
- Bad: "Click the button. It will show the dialog."
- Good: "Click **Save**. The confirmation dialog appears."

### Future tense for current behavior
- Bad: "The command will create a new directory."
- Good: "The command creates a new directory."
