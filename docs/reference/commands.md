# Command Reference

All available commands in the WS Claude Marketplace.

## docs-agent

Documentation generation following the Diátaxis framework.

### /docs-tutorial

Create a learning-oriented tutorial for a specific topic.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `topic` | No | Topic for the tutorial |
| `output-dir` | No | Output directory (default: current) |

**Example:**
```
/docs-tutorial authentication
```

---

### /docs-howto

Create a task-oriented how-to guide for solving a specific problem.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `task` | No | Task the guide addresses |
| `output-dir` | No | Output directory |

**Example:**
```
/docs-howto "configure SSL certificates"
```

---

### /docs-explanation

Write an understanding-oriented explanation of a concept.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `concept` | No | Concept to explain |
| `output-dir` | No | Output directory |

**Example:**
```
/docs-explanation "event-driven architecture"
```

---

### /docs-reference

Generate API or technical reference documentation.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `target` | No | Target module or API |
| `output-dir` | No | Output directory |

**Example:**
```
/docs-reference src/api/
```

---

### /changelog

Generate or update CHANGELOG.md from git history following Keep a Changelog standard.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `version` | No | Version for the release |

**Example:**
```
/changelog 1.2.0
```

---

### /changelog-entry

Add a single entry to the Unreleased section of CHANGELOG.md.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `type` | No | Entry type (Added, Changed, Fixed, etc.) |
| `description` | No | Description of the change |

**Example:**
```
/changelog-entry Added "User authentication via OAuth"
```

---

## ws-commit-commands

Git workflow commands for Gitea using tea CLI.

**Prerequisites:** [tea CLI](https://gitea.com/gitea/tea) must be installed and configured.

### /ws-commit

Create a git commit with conventional commit format.

**Arguments:** None

**Behavior:**
1. Analyzes staged and unstaged changes
2. Generates a conventional commit message
3. Creates the commit

**Example:**
```
/ws-commit
```

---

### /ws-commit-push-pr

Commit, push, and create a pull request in one step.

**Arguments:** None

**Prerequisites:**
- tea CLI installed and authenticated
- Remote repository configured

**Behavior:**
1. Creates a conventional commit
2. Pushes to remote branch
3. Creates a pull request via tea CLI

**Example:**
```
/ws-commit-push-pr
```

---

### /ws-clean-gone

Clean up git branches marked as [gone] (deleted on remote but exist locally).

**Arguments:** None

**Behavior:**
1. Lists branches marked as [gone]
2. Removes associated worktrees if any
3. Deletes the local branches

**Example:**
```
/ws-clean-gone
```

---

## Agents

These agents are spawned via the Task tool, typically by commands.

### docs-agent Agents

| Agent | Description |
|-------|-------------|
| `docs-architect` | Plans documentation structure using Diátaxis |
| `tutorial-writer` | Writes hands-on tutorials |
| `api-documenter` | Generates API reference from code |
| `changelog-analyzer` | Analyzes git commits for changelog |

### Usage

Agents are invoked through the Task tool:

```
Task tool with:
  subagent_type: "docs-agent:tutorial-writer"
  prompt: "Write a tutorial on setting up the development environment"
```

---

## Skills

Skills provide knowledge and templates, loaded on demand.

### docs-agent Skills

| Skill | Trigger Keywords |
|-------|-----------------|
| `keep-a-changelog` | changelog format, versioning |
| `diataxis` | documentation types, tutorials, how-to |

Skills are automatically loaded when relevant keywords appear in the conversation.
