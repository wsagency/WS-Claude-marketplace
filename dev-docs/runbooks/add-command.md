# How to Add a Command

This guide explains how to add a slash command to an existing plugin.

## Prerequisites

- An existing plugin (see [How to Create a Plugin](create-plugin.md))
- Understanding of what task the command should accomplish

## Step 1: Create the Command File

Create a markdown file in your plugin's `commands/` directory:

```bash
touch plugins/my-plugin/commands/new-command.md
```

The filename becomes the command name: `new-command.md` creates `/new-command`.

## Step 2: Add YAML Frontmatter

Every command needs frontmatter that configures its behavior:

```yaml
---
description: One-line description shown when listing commands
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: "[target]"
---
```

(Mirror a real command: see `plugins/ws/commands/ws-docs.md` for a live example.)

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `description` | Yes | Shown in command list and help |
| `allowed-tools` | Yes | Tools Claude can use during execution |
| `argument-hint` | No | Display-only autocomplete hint for the command's arguments |

### Common Tool Sets

**Read-only commands:**
```yaml
allowed-tools:
  - Read
  - Glob
  - Grep
```

**File modification commands:**
```yaml
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
```

**Commands needing shell access:**
```yaml
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
```

**Commands spawning agents:**
```yaml
allowed-tools:
  - Read
  - Glob
  - Grep
  - Task
```

## Step 3: Write Command Instructions

After the frontmatter, write clear instructions for Claude:

```markdown
---
description: Generate a summary of recent changes
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# Generate Change Summary

Create a summary of recent changes in the repository.

## Context

- Working directory: User's current project
- Git repository: Assumed to be present

## Your Task

1. Run `git log --oneline -20` to get recent commits
2. Analyze the commit messages for themes
3. Create a brief summary of what changed

## Output Format

Present the summary as:
- **New Features**: List of new capabilities
- **Bug Fixes**: Issues that were resolved
- **Other Changes**: Refactoring, docs, etc.
```

## Step 4: Using Arguments

If your command accepts arguments, declare a display-only `argument-hint` in the frontmatter and reference the actual values in the body via `$ARGUMENTS` (the full argument string) or positional `$1`, `$2`, ...:

```markdown
---
description: Analyze a specific file
allowed-tools: Read, Glob
argument-hint: "<file>"
---

# Analyze File

Analyze the file specified by the user.

## Input

The user wants to analyze: `$1`

## Steps

1. Read the file at the specified path
2. Analyze its structure and content
3. Report findings
```

Arguments are passed when invoking: `/analyze-file src/main.ts` — here `$ARGUMENTS` and `$1` both expand to `src/main.ts`.

## Step 5: Test Your Command

1. Install or reinstall the plugin:
   ```bash
   claude plugin install ./plugins/my-plugin
   ```

2. Invoke your command:
   ```
   /new-command
   ```

3. Verify it behaves as expected

## Best Practices

### Be Specific
Bad:
```markdown
Do something useful with the code.
```

Good:
```markdown
1. Find all TypeScript files in src/
2. Extract function signatures
3. Generate a markdown table of functions
```

### Provide Context
```markdown
## Context

- This command runs in the user's project directory
- The user has already set up their development environment
- Output should be saved to docs/ directory
```

### Handle Edge Cases
```markdown
## Edge Cases

- If no TypeScript files exist, inform the user
- If docs/ directory doesn't exist, create it
- If a file already exists, ask before overwriting
```

### Limit Scope
Commands should do one thing well. If you need complex multi-step automation, consider using an agent instead.

## Example: Complete Command

```markdown
---
description: Generate TypeScript interface from JSON
allowed-tools: Read, Write, Glob
argument-hint: "<input.json> [output.ts]"
---

# Generate TypeScript Interface

Convert a JSON file to a TypeScript interface definition.

## Input

- JSON file: `$1`
- Output file: `$2` (default: same name with .ts extension)

## Steps

1. Read the JSON file at `$1`
2. Analyze the structure to infer types
3. Generate a TypeScript interface
4. Write to the output file

## Type Inference Rules

- Numbers → `number`
- Strings → `string`
- Booleans → `boolean`
- Arrays → `Type[]`
- Objects → nested interfaces
- Null values → `Type | null`

## Output Format

```typescript
export interface GeneratedInterface {
  // ... inferred fields
}
```
```

## Step 6: Regenerate the omp Package

The native omp package is generated from `plugins/ws/`. After adding or changing a command, regenerate it:

```bash
cd extensions/omp-ws && bun run generate
```

## What's Next?

- [How to Add an Agent](add-agent.md) - For complex multi-step tasks
- [Command Reference](../reference/commands.md) - See existing commands for examples
