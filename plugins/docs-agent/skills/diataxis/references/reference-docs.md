# Writing Reference Documentation

Reference documentation is **information-oriented** and describes the machinery: APIs, configurations, options, and technical specifications.

## Purpose

- Provide accurate, complete technical information
- Enable quick lookup of specific details
- Serve as the authoritative source of truth

## Characteristics

### Austere and Consistent
Use a regular, predictable structure. Every entry follows the same pattern.

### Accurate and Complete
Cover everything, not just common cases.

### Code-Determined
Structure should mirror the code's structure.

## Structure

### For Functions/Methods
```markdown
## functionName

Brief description of what the function does.

### Syntax
```language
functionName(param1, param2, options)
```

### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| param1 | string | Yes | - | Description |
| param2 | number | No | 10 | Description |
| options | object | No | {} | Configuration options |

### Returns

`Type` - Description of return value.

### Exceptions

- `ErrorType` - When this error is thrown

### Example

```language
const result = functionName("value", 5);
```

### See Also
- [relatedFunction](#relatedfunction)
```

### For Configuration Options
```markdown
## Configuration Reference

### option_name

**Type:** `string`
**Default:** `"default_value"`
**Required:** No

Description of what this option controls.

**Possible values:**
- `"value1"` - Description
- `"value2"` - Description

**Example:**
```yaml
option_name: "value1"
```
```

### For CLI Commands
```markdown
## command-name

Brief description.

### Synopsis
```
command-name [options] <required-arg> [optional-arg]
```

### Arguments

| Argument | Description |
|----------|-------------|
| required-arg | What this argument specifies |
| optional-arg | Optional additional input |

### Options

| Option | Short | Description |
|--------|-------|-------------|
| --verbose | -v | Enable verbose output |
| --output | -o | Specify output file |

### Examples

```bash
command-name --verbose input.txt
command-name -o output.txt input.txt
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
```

## Writing Guidelines

### Do:
- Use consistent formatting throughout
- Include all parameters, even obscure ones
- Show exact types and default values
- Provide minimal, focused examples
- Keep descriptions factual and brief
- Mirror code structure in doc structure

### Don't:
- Explain concepts (link to Explanations)
- Provide tutorials (link to Tutorials)
- Recommend approaches (link to How-tos)
- Editorialize or add opinions
- Skip rarely-used options

## Tone

Reference documentation should be:
- **Factual** - State what is, not what should be
- **Neutral** - No opinions or recommendations
- **Precise** - Exact types, values, behaviors
- **Consistent** - Same format for similar items

## Example Reference Entry

```markdown
## readFile

Reads the contents of a file asynchronously.

### Syntax

```javascript
readFile(path, options)
```

### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| path | string \| Buffer \| URL | Yes | - | Path to the file |
| options | object \| string | No | 'utf8' | Encoding or options object |

**Options object properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| encoding | string | 'utf8' | Character encoding |
| flag | string | 'r' | File system flag |

### Returns

`Promise<string | Buffer>` - File contents. Returns a string if encoding is specified, otherwise a Buffer.

### Exceptions

- `ENOENT` - File does not exist
- `EACCES` - Permission denied
- `EISDIR` - Path is a directory

### Example

```javascript
const content = await readFile('/path/to/file.txt');
const binary = await readFile('/path/to/image.png', { encoding: null });
```

### See Also
- [writeFile](#writefile)
- [readFileSync](#readfilesync)
```

## Common Mistakes

1. **Incomplete coverage** - Document everything, not just common cases
2. **Inconsistent format** - Every similar entry should look the same
3. **Tutorial content** - Don't teach, just describe
4. **Missing types** - Always specify parameter and return types
5. **Vague descriptions** - Be specific about behavior
