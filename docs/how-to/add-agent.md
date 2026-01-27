# How to Add an Agent

This guide explains how to add an autonomous agent to a plugin.

## Prerequisites

- An existing plugin (see [How to Create a Plugin](create-plugin.md))
- Understanding of commands vs agents (see [Plugin Architecture](../explanation/plugin-architecture.md))

## When to Use an Agent

Use an **agent** instead of a command when:

- The task requires multiple autonomous steps
- Claude needs to make decisions and adapt as it works
- The work involves exploration or research
- You want parallel execution of subtasks

Use a **command** when:

- The task is straightforward and linear
- Steps are predictable
- Minimal decision-making is needed

## Step 1: Create the Agent File

Create a markdown file in your plugin's `agents/` directory:

```bash
mkdir -p plugins/my-plugin/agents
touch plugins/my-plugin/agents/my-agent.md
```

## Step 2: Add YAML Frontmatter

Agents have similar frontmatter to commands:

```yaml
---
description: Brief description of what the agent does
tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
---
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `description` | Yes | Explains the agent's purpose |
| `tools` | Yes | Tools the agent can use |

### Tool Considerations

Agents often need the `Task` tool to spawn sub-agents:

```yaml
tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task      # Allows spawning sub-agents
```

## Step 3: Write the System Prompt

The agent's markdown content becomes its system prompt:

```markdown
---
description: Analyzes codebase and suggests improvements
tools:
  - Read
  - Glob
  - Grep
  - Task
---

# Code Analyzer Agent

You are a code analysis agent that examines codebases and provides improvement suggestions.

## Your Role

- Explore the codebase structure
- Identify patterns and anti-patterns
- Suggest concrete improvements
- Prioritize findings by impact

## Process

1. **Discovery**: Scan the project structure
2. **Analysis**: Examine code for issues
3. **Synthesis**: Compile findings
4. **Reporting**: Present actionable recommendations

## Output Format

Present findings as:

### High Priority
- Issue description
- Location (file:line)
- Suggested fix

### Medium Priority
...

### Low Priority
...
```

## Step 4: Invoke the Agent

Agents are invoked via the `Task` tool from a command or directly by Claude:

```markdown
# In a command that uses this agent:

Use the Task tool to spawn the code-analyzer agent:

\`\`\`
Task tool with:
  subagent_type: "my-plugin:my-agent"
  prompt: "Analyze the src/ directory for code quality issues"
\`\`\`
```

## Step 5: Create a Command to Invoke the Agent

Often you'll create a command that invokes your agent:

`plugins/my-plugin/commands/analyze.md`:

```markdown
---
description: Analyze codebase for improvements
allowed-tools:
  - Task
  - Read
---

# Analyze Codebase

Use the code-analyzer agent to examine this codebase.

## Your Task

1. Spawn the `my-plugin:my-agent` agent using the Task tool
2. Pass the user's request or use the current directory as context
3. Present the agent's findings to the user
```

## Example: Complete Agent

`plugins/docs-agent/agents/api-documenter.md`:

```markdown
---
description: Generates API reference documentation by analyzing code
tools:
  - Read
  - Write
  - Glob
  - Grep
---

# API Documenter Agent

You are a documentation agent that generates API reference documentation.

## Your Mission

Generate comprehensive API documentation by:
1. Finding all public interfaces, classes, and functions
2. Extracting signatures, parameters, and return types
3. Identifying existing docstrings or comments
4. Producing structured reference documentation

## Process

### Step 1: Discovery
- Use Glob to find source files
- Identify the primary language/framework
- Locate existing documentation

### Step 2: Extraction
- Parse public APIs from source files
- Extract type information
- Gather existing documentation

### Step 3: Generation
- Create markdown documentation
- Organize by module/namespace
- Include examples where found

## Output Format

```markdown
# API Reference

## Module: `module-name`

### `functionName(param: Type): ReturnType`

Description from docstring or inferred.

**Parameters:**
- `param` (Type): Description

**Returns:** ReturnType - Description

**Example:**
\`\`\`typescript
const result = functionName(value);
\`\`\`
```

## Guidelines

- Prefer accuracy over completeness
- Note when documentation is inferred vs explicit
- Flag undocumented public APIs
- Maintain consistent formatting
```

## Best Practices

### Define Clear Boundaries
Agents should have well-defined scope. Don't create an agent that "does everything."

### Enable Autonomy
Write prompts that let agents make decisions:
```markdown
## Decision Making

When you encounter ambiguous code:
1. Make a reasonable interpretation
2. Document your assumption
3. Continue with analysis
```

### Support Collaboration
Agents can spawn sub-agents for specialized tasks:
```markdown
## Sub-agents

For specific tasks, you may spawn:
- `tutorial-writer` for creating tutorials
- `api-documenter` for API docs
```

### Provide Progress Updates
Instruct agents to communicate progress:
```markdown
## Communication

- Report what you're analyzing
- Share interim findings
- Summarize when complete
```

## What's Next?

- [Plugin Architecture](../explanation/plugin-architecture.md) - Understand commands vs agents
- [Command Reference](../reference/commands.md) - See how commands invoke agents
