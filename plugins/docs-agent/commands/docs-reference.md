---
description: Generate API or technical reference documentation
arguments:
  - name: target
    description: What to document (e.g., "api", "cli", "config", or a specific module/file)
    required: true
allowed_tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
---

# Generate Reference Documentation

Generate technical reference documentation for **{{ target }}**.

## Your Task

Create accurate, complete reference documentation by extracting and documenting the technical details of the specified target.

## Reference Documentation Characteristics

Reference docs are:
- **Information-oriented**: Describe the machinery
- **Accurate**: Document actual behavior
- **Complete**: Cover everything, not just common cases
- **Consistent**: Same format for similar items

## Process

1. **Identify what to document** based on the target argument
2. **Extract technical details** from the code
3. **Generate documentation** following reference format
4. **Verify accuracy** against the actual implementation

Use the `api-documenter` agent for code extraction and formatting.

## Target Types

### `api` - API Reference
Document all public functions, classes, and types.

### `cli` - CLI Reference
Document commands, arguments, flags, and options.

### `config` - Configuration Reference
Document all configuration options with types and defaults.

### `[module/file]` - Specific Component
Document a specific module, class, or file.

## Required Format

For functions:
```markdown
## functionName

Brief description.

### Syntax
```
functionName(params)
```

### Parameters
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|

### Returns
`Type` - Description

### Example
```
[minimal example]
```
```

## Skills to Use

Load the `diataxis` skill, specifically the reference documentation guide, for:
- Formatting standards
- Completeness requirements
- Tone and style

## Quality Checklist

Reference docs must:
- [ ] Cover all public APIs
- [ ] Include all parameters with types
- [ ] Specify return types
- [ ] Show working examples
- [ ] Be consistently formatted
- [ ] Match actual code behavior

## Writing Guidelines

**Do:**
- Use consistent formatting
- Include all options, even obscure ones
- Show exact types and defaults
- Keep descriptions factual and brief

**Don't:**
- Explain concepts (link to explanations)
- Provide tutorials (link to tutorials)
- Recommend approaches (link to how-tos)
- Editorialize or add opinions

## Examples

`/docs-reference api` - Generate complete API reference
`/docs-reference cli` - Document CLI commands
`/docs-reference config` - Document configuration options
`/docs-reference src/auth` - Document the auth module
