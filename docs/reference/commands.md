# Command Reference

All available commands in the WS Claude Marketplace.

## docs-agent

Dual-track documentation suite. All operations route through the single `/ws-docs` entry.

### /ws-docs

Unified documentation command. Run with no verb for discovery (artifact status table, no writes).

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `verb` | No | One of: `init`, `audit`, `catchup`, `repair`, `write`, `adr`, `architecture`, `contributing`, `changelog`, `release-notes`, `explain`, `publish`, `pull-back` |
| `args` | No | Verb-specific (e.g. `write <type> [topic]`, `adr "<decision>"`, `changelog [version]`) |

**Verbs:**
| Verb | Destination / effect |
|---|---|
| (none) | Discovery — status table of docs artifacts |
| `init` | Scaffold both tracks (`docs/`, `dev-docs/`), config, CHANGELOG, 3-file CONTRIBUTING |
| `audit` | Verbose diagnosis (docs-doctor + arch-watcher + public-api-watcher in parallel) |
| `catchup` | Propose CHANGELOG entries, reference updates, ADRs from git history; user triages |
| `repair` | Create missing artifacts only (never deletes) |
| `write <type> [topic]` | One Diátaxis doc; `tutorial \| howto \| explanation` → diataxis-writer, `reference` → api-documenter |
| `adr "<decision>"` | New ADR in `dev-docs/decisions/` (MADR v4.0.0) |
| `architecture` | Regenerate `dev-docs/architecture.md` (diff + confirm) |
| `contributing` | Regenerate 3-file CONTRIBUTING set (diff + confirm) |
| `changelog [version]` | Update `[Unreleased]` or cut version; mirrors to `docs/changelog.md` |
| `release-notes [version]` | Linear-style notes → `docs/release-notes/<version>.md` |
| `explain` | Regenerate `docs/explained.md` — generated Outline-safe onboarding page |
| `publish` | Lint Outline-safe profile, push `docs/` to Outline (`outline-sync.py`; needs Python 3 + `OUTLINE_API_TOKEN`) |
| `pull-back` | Pull Outline edits into a review branch + PR (git authoritative) |

In a hub with a `role: docs` sub-repo, `/ws-docs` enters hub mode: user-audience writes, product ADRs, and product architecture route to the docs repo (scope prompt, cacheable as `default_scope`).

**Examples:**
```
/ws-docs
/ws-docs write tutorial "getting started"
/ws-docs adr "adopt jira-cli for Jira access"
/ws-docs changelog
```

---


## ws-commit-commands

Jira-aware git workflows via [jira-cli](https://github.com/ankitpokhrel/jira-cli). Detects ticket from branch name, composes Conventional Commits with `(TICKET)` suffix, applies worklogs and transitions with explicit jira-cli calls. PR creation via tea CLI.

**Prerequisites:** [tea CLI](https://gitea.com/gitea/tea); [jira-cli](https://github.com/ankitpokhrel/jira-cli) (`brew install ankitpokhrel/jira-cli/jira-cli`, `export JIRA_API_TOKEN=<token>`, `jira init`)

### /ws-init

Verify jira-cli setup and configure the marketplace for this user. If run inside a git repo, also binds that project to a specific Jira project key.

**Arguments:** None

**Behavior:**
1. Checks the `jira` binary and `jira me`; if missing, prints install/token/`jira init` steps and aborts
2. Writes `~/.claude/ws/config.yaml` (site host + defaults; auth stays in jira-cli)
3. If in a git repo, asks which Jira project to bind (`jira project list`); writes `./.claude/ws-project.yaml`
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

Jira-aware commit. Detects ticket key from branch name (`WSC-123-feature`), composes Conventional Commits with `(WSC-123)` suffix, optionally logs a worklog and transitions the ticket via jira-cli.

**Arguments:** None

**Behavior:**
1. Parses current branch for `^([A-Z]+-\d+)`; if none, asks user for ticket (or proceeds without one)
2. Fetches ticket title via `jira issue view <KEY> --raw` for context
3. Generates CC message: `<type>(<scope>): <description> (TICKET)` + body + `Refs: TICKET`
4. Computes elapsed time on the branch as worklog default; asks user to log it, edit, or skip
5. Asks about transition (To Do → In Progress, etc.)
6. Appends the Smart Commit trailer (record only, `smart_commit_trailer: true` default): `TICKET #time Xh Ym #transition`
7. Shows full message for confirmation, then commits
8. Applies chosen actions via jira-cli after the commit: `jira issue worklog add`, `jira issue move`, optional `jira issue comment add`

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

### /ws-ticket

Turn a brief task description into a comprehensive Jira ticket (user story, Given/When/Then acceptance criteria, technical context from codebase research), optionally creating it in Jira via jira-cli. Replaces the retired `/ws-jira-enhancer`.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `description` | Yes | Brief task description to enhance |

**Behavior:**
1. Applies the `ticket-writing` skill: codebase research where needed, then Summary / User Story / Background / Technical Context / Acceptance Criteria / Questions
2. If the repo is bound to a Jira project, offers to create the ticket: `jira issue create -t<Type> -s"..." -b"..." -p<PROJECT> --no-input`
3. Prints the created key and browse URL

**Example:**
```
/ws-ticket "dark mode toggle for the settings screen"
```

---


## ws-project-hub

Multi-repo project hubs. A hub is a small meta-repo (`<project>-main`) that registers all sub-repos (mobile app, marketing site, design, docs, etc.) of a project and launches Claude across them with `--add-dir`. Sub-repos live as gitignored subfolders, each with its own independent git history.

Launching a hub is not a command: `cd <hub> && ./invoke-ai.sh` (hinted by `/ws-hub-status`). The launcher opens an interactive agent picker (Claude Code / omp; extensible registry) — bypass with `--agent <name>` or `WS_HUB_AGENT`.

### /ws-hub-init

Initialize a new project hub. Interactive: prompts for project name, description, and which detected sibling/subfolder git repos to register. Each can be moved into the hub, registered in place, cloned fresh, or skipped. Generates `project.yaml`, `AGENTS.md` (+ thin `CLAUDE.md` import), `invoke-ai.sh`, `README.md`, `.gitignore` (with managed block), and vendors `.claude/skills/project-hub-conventions/`. Offers to scaffold a `role: docs` product docs repo (`<project>-docs`). Registration details (schema, managed block, tech inference, docs-repo layout) are defined in the project-hub-conventions skill.

**Example:**
```
/ws-hub-init
```

---

### /ws-hub-status

Aggregated git status report across all registered sub-repos: branch, ahead/behind upstream, uncommitted count, recent commits. Read-only; ends with the `./invoke-ai.sh` launch hint.

**Example:**
```
/ws-hub-status
```

---

### /ws-hub-repos

One traversal over all registered sub-repos, verb picks the git operation.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `verb` | Yes | `pull` — `git pull --ff-only` across all sub-repos; `clone` — clone every registered URL into a missing subfolder |

**Examples:**
```
/ws-hub-repos pull
/ws-hub-repos clone
```

---

### /ws-hub-add-repo

Register a new sub-repo (clone-URL, adopt-nested, register-sibling, or move-sibling-in). With `--scan`, first discovers nested/sibling git repos not yet in `project.yaml` and offers them for registration through the same flow. A repo can be marked `role: docs` (product docs repo, max one per hub).

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `--scan` | No | Run discovery before registration |

**Examples:**
```
/ws-hub-add-repo
/ws-hub-add-repo --scan
```

---

### /ws-hub-describe

Refresh `description` and `tech` fields in `project.yaml` by reading each sub-repo's README and manifest files. Shows a diff before writing, then regenerates the AGENTS.md repos region.

**Example:**
```
/ws-hub-describe
```

---

### /ws-hub-docs

Generate cross-repo documentation (architecture, contracts, deployment topology) via the `hub-architect` agent. Targets the `role: docs` repo's `dev-docs/` when one is registered, else the hub's `docs/`.

**Example:**
```
/ws-hub-docs
```

---


## Agents

These agents are spawned via the Task tool, typically by commands.

### docs-agent Agents

| Agent | Description |
|-------|-------------|
| `docs-doctor` | Scans docs artifact presence and staleness |
| `diataxis-writer` | Writes tutorials, how-to guides, and explanations (quadrant-parameterized) |
| `api-documenter` | Generates API reference from code |
| `changelog-analyzer` | Analyzes git commits for changelog |
| `adr-writer` | Writes MADR ADRs to dev-docs/decisions/ |
| `release-notes-writer` | User-facing release notes |
| `architecture-documenter` | Writes dev-docs/architecture.md |
| `contributing-generator` | Generates the 3-file CONTRIBUTING set |
| `arch-watcher` | Detects commits that warrant an ADR |
| `public-api-watcher` | Detects public API surface changes |

### ws-project-hub Agents

| Agent | Description |
|-------|-------------|
| `hub-architect` | Analyzes all sub-repos and generates cross-repo architecture/contracts/deployment docs |

### Usage

Agents are invoked through the Task tool:

```
Task tool with:
  subagent_type: "docs-agent:diataxis-writer"
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
| `ticket-writing` | jira ticket, user story, acceptance criteria, enhance task |

### ws-project-hub Skills

| Skill | Trigger Keywords |
|-------|-----------------|
| `project-hub-conventions` | project hub, multi-repo, `<name>-main` |

This skill is also vendored into every hub at init time (`<hub>/.claude/skills/`), so hubs remain self-documenting even when the marketplace plugin isn't installed.

Skills are automatically loaded when relevant keywords appear in the conversation.
