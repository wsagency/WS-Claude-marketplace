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

## ws-jira-enhancer

Transform brief task descriptions into well-structured Jira tickets.

### /ws-jira-enhancer

Transform a brief task description into a comprehensive Jira ticket with user story, acceptance criteria, and technical context.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `task` | Yes | Brief task description to enhance |

**Behavior:**
1. Analyzes the task description
2. Searches the codebase for relevant context (if applicable)
3. Generates a structured Jira ticket with:
   - Summary
   - User story (As a... I want... so that...)
   - Background and technical context
   - Acceptance criteria (Given/When/Then format)
   - Clarifying questions (if needed)

**Example:**
```
/ws-jira-enhancer "add dark mode toggle to settings page"
```

**Output Format:**
```markdown
## Summary
[One clear sentence describing what needs to be done]

## User Story
As a [role], I want [goal], so that [benefit].

### Background
[Business context and problem being solved]

### Technical Context
[Findings from codebase research]

## Acceptance Criteria
- [ ] Given [precondition], when [action], then [result]

## Questions (if any)
> [Clarifying questions]
```

---

## ws-claude-sync

Sync Claude Code contexts, settings, and sessions across machines via GitHub.

**Prerequisites:** [Python 3](https://python.org/), a private GitHub repository for sync storage.

### /ws-sync-setup

Configure Claude sync with a GitHub repository.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `repo-url` | Yes | GitHub repository URL for sync storage |

**Example:**
```
/ws-sync-setup git@github.com:user/claude-sync-data.git
```

---

### /ws-sync-pull

Pull essential Claude context (config, settings, sessions, todos) from the remote repository.

**Arguments:** None

**Example:**
```
/ws-sync-pull
```

---

### /ws-sync-push

Push essential Claude context to the remote repository.

**Arguments:** None

**Example:**
```
/ws-sync-push
```

---

### /ws-sync

Bidirectional essential sync — pull remote changes first, then push local changes.

**Arguments:** None

**Example:**
```
/ws-sync
```

---

### /ws-sync-pull-full

Pull ALL Claude data from remote, including shell snapshots and slash commands.

**Arguments:** None

**Example:**
```
/ws-sync-pull-full
```

---

### /ws-sync-push-full

Push ALL Claude data to remote, including shell snapshots and slash commands.

**Arguments:** None

**Example:**
```
/ws-sync-push-full
```

---

### /ws-sync-full

Bidirectional full sync of all Claude data.

**Arguments:** None

**Example:**
```
/ws-sync-full
```

---

### /ws-sync-status

Show sync configuration, machine ID, and what would be synced.

**Arguments:** None

**Example:**
```
/ws-sync-status
```

---

## ws-clamp

Move, archive, fix, and manage Claude Code projects while preserving session history.

### /clamp-move

Move, relocate, or remove a Claude Code project. Always runs `--dry-run` first for safety.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `operation` | Yes | What to do: move, move here, or remove |
| `source` | Yes | Source project path |
| `destination` | No | Destination path (for move) |

**Examples:**
```
/clamp-move move ~/old/project ~/new/project
/clamp-move remove ~/old-project
```

---

### /clamp-inspect

List Claude projects or show detailed info about a specific project.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `project-path` | No | Specific project to inspect (omit to list all) |

**Examples:**
```
/clamp-inspect
/clamp-inspect ~/my-project
```

---

### /clamp-maintain

Verify, fix, or prune Claude project references. Always runs `--dry-run` first for mutative operations.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `operation` | Yes | verify, fix, or prune |

**Examples:**
```
/clamp-maintain verify
/clamp-maintain fix
/clamp-maintain prune
```

---

### /clamp-archive

Pack or unpack portable `.claudepack` project archives.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `operation` | Yes | pack or unpack |
| `path` | Yes | Project path (pack) or archive path (unpack) |
| `destination` | No | Destination path (for unpack) |

**Examples:**
```
/clamp-archive pack ~/my-project
/clamp-archive unpack backup.claudepack ~/new-location
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

### ws-claude-sync Agents

| Agent | Description |
|-------|-------------|
| `sync-troubleshooter` | Diagnoses and fixes Claude sync issues across machines |

### ws-clamp Agents

| Agent | Description |
|-------|-------------|
| `project-manager` | Diagnoses and plans Claude project management operations |

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

### ws-claude-sync Skills

| Skill | Trigger Keywords |
|-------|-----------------|
| `claude-sync` | sync, cross-machine, context sharing |

### ws-clamp Skills

| Skill | Trigger Keywords |
|-------|-----------------|
| `claude-project-data` | project, session, history, clamp |

Skills are automatically loaded when relevant keywords appear in the conversation.
