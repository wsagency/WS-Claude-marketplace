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

Jira-aware git workflows. Detects ticket from branch name, composes Conventional Commits with `(TICKET)` suffix, optionally adds Smart Commit `#time` worklog and transition. PR creation via tea CLI.

**Prerequisites:** [tea CLI](https://gitea.com/gitea/tea), Atlassian MCP server (auto via `atlassian` plugin)

### /ws-init

Connect Jira via OAuth and configure the marketplace for this user. If run inside a git repo, also binds that project to a specific Jira project key.

**Arguments:** None

**Behavior:**
1. Triggers Atlassian OAuth (interactive — opens browser to authorize)
2. Stores user account_id, site, and cloud_id in `~/.claude/ws/config.yaml`
3. If in a git repo, asks which Jira project to bind; writes `./.claude/ws-project.yaml`
4. Reports summary and suggests next commands

**Example:**
```
/ws-init
```

---

### /ws-status

Show the user's Jira workload (assigned tickets grouped by status) and suggest the next task to pick up. Marks the ticket matching the current branch as "(you're here)".

**Arguments:** None

**Prerequisites:** `/ws-init` already run

**Example:**
```
/ws-status
```

---

### /ws-commit

Jira-aware commit. Detects ticket key from branch name (`WSC-123-feature`), composes Conventional Commits with `(WSC-123)` suffix, optionally adds Smart Commit `#time` worklog and transition.

**Arguments:** None

**Behavior:**
1. Parses current branch for `^([A-Z]+-\d+)`; if none, asks user for ticket (or proceeds without one)
2. Fetches ticket title via Atlassian MCP for context
3. Generates CC message: `<type>(<scope>): <description> (TICKET)` + body + `Refs: TICKET`
4. Computes elapsed time on the branch as worklog default; asks user to log it, edit, or skip
5. Asks about transition (To Do → In Progress, etc.) using available Jira transitions
6. Appends Smart Commit trailer if worklog or transition chosen: `TICKET #time Xh Ym #transition`
7. Shows full message for confirmation, then commits

**Commit format:**
```
feat(auth): add OTP screen for login (WSC-142)

- validates 6-digit code
- handles 30s resend timeout

Refs: WSC-142
WSC-142 #time 2h 30m #in-progress
```

**Example:**
```
/ws-commit
```

---

### /ws-commit-push-pr

End-to-end Jira-aware flow: commit, push, open PR with Jira link, optionally transition ticket to In Review.

**Arguments:** None

**Prerequisites:** tea CLI installed and authenticated; remote configured

**Behavior:**
1. If on main, asks for branch name and suggests `<TICKET>-<slug>`
2. Composes the Conventional Commits message (ticket suffix, optional Smart Commit worklog)
3. Updates `CHANGELOG.md` (Keep a Changelog format) — auto-creates if missing, maps commit type to section, skips non-functional types per `changelog.skip_types`
4. Commits code + CHANGELOG.md together (single commit)
5. Pushes to origin with `-u`
6. Creates PR via `tea pr create` with title = commit subject and body including `## Jira` link section
7. Offers to transition ticket to `defaults.pr_transition` (default: In Review)

**Changelog mapping:** `feat`→Added, `fix`→Fixed, `perf`/`refactor`/`revert`→Changed, security→Security, breaking change→Changed (prefixed `**BREAKING:**`). Skipped by default: `docs, chore, test, style, build, ci`.

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

## ws-project-hub

Multi-repo project hubs. A hub is a small meta-repo (`<project>-main`) that registers all sub-repos (mobile app, marketing site, design, docs, etc.) of a project and launches Claude across them with `--add-dir`. Sub-repos live as gitignored subfolders, each with its own independent git history.

### /hub-init

Initialize a new project hub. Interactive: prompts for project name, description, and which detected sibling/subfolder git repos to register. Each can be moved into the hub, registered in place, cloned fresh, or skipped. Generates `project.yaml`, `CLAUDE.md`, `invoke-ai.sh`, `README.md`, `.gitignore` (with managed block), and vendors `.claude/skills/project-hub-conventions/`.

**Example:**
```
/hub-init
```

---

### /hub-launch

Show how to launch the current hub. Prints the `./invoke-ai.sh` command and verifies the hub is correctly initialized. Does not execute the launcher itself (Claude can't re-launch itself from inside a session).

**Example:**
```
/hub-launch
```

---

### /hub-clone-all

Clone every registered sub-repo URL into a missing subfolder of the hub. Skips repos already present or with no `url` field. Failures (no access, bad URL) are reported per-repo and don't abort the run.

**Example:**
```
/hub-clone-all
```

---

### /hub-sync

`git pull --ff-only` across all registered sub-repos. Reports per-repo result (`already up to date`, `fast-forwarded N commits`, `skipped`, `failed`). Skips repos missing from disk.

**Example:**
```
/hub-sync
```

---

### /hub-status

Aggregated git status across all sub-repos. Per repo: current branch, ahead/behind counts, uncommitted change count, last 5 commits. Read-only.

**Example:**
```
/hub-status
```

---

### /hub-add-repo

Register a new sub-repo. Interactive: clone from URL, adopt an existing nested folder, register a sibling in place, or move a sibling into the hub. Updates `project.yaml`, `CLAUDE.md` auto-section, and the `.gitignore` managed block.

**Example:**
```
/hub-add-repo
```

---

### /hub-scan

Find git repos in or near the hub (subfolders + siblings) that aren't yet in `project.yaml`. Interactive prompt to register each unregistered repo.

**Example:**
```
/hub-scan
```

---

### /hub-describe

Refresh `description` and `tech` fields in `project.yaml` by reading each sub-repo's README and manifest files (package.json, pubspec.yaml, etc.). Shows a diff before writing.

**Example:**
```
/hub-describe
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

### ws-project-hub Agents

| Agent | Description |
|-------|-------------|
| `hub-architect` | Analyzes all sub-repos and generates cross-repo architecture/contracts/deployment docs |

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

### ws-commit-commands Skills

| Skill | Trigger Keywords |
|-------|-----------------|
| `ws-jira-conventions` | jira, ticket, WSC-, smart commit, conventional commits |

### ws-project-hub Skills

| Skill | Trigger Keywords |
|-------|-----------------|
| `project-hub-conventions` | project hub, multi-repo, `<name>-main`, `<name>-truth` |

This skill is also vendored into every hub at init time (`<hub>/.claude/skills/`), so hubs remain self-documenting even when the marketplace plugin isn't installed.

Skills are automatically loaded when relevant keywords appear in the conversation.
