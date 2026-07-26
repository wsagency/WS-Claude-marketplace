# Command Reference

All available commands in the WS Claude Marketplace.

## docs-agent

Dual-track documentation suite. All operations route through the single `/ws-docs` entry.

### /ws-docs

Unified documentation command. Run with no verb for discovery (artifact status table, no writes).

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `verb` | No | One of: `init`, `audit`, `catchup`, `repair`, `write`, `adr`, `architecture`, `contributing`, `changelog`, `release-notes`, `explain`, `publish` |
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

Jira-aware git workflows via [jira-cli](https://github.com/ankitpokhrel/jira-cli). Detects ticket from branch name, composes Conventional Commits with `(TICKET)` suffix, applies worklogs and transitions with explicit jira-cli calls. PR creation via tea CLI. Ticket breakdown lives in ws-matt (`ws-to-tickets`, local-first tracker in `dev-docs/tickets/`).

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

### /ws-help

One-screen orientation guide to the WS system (start here: /ws-matt grill). Adapts to the project — hub, OpenWiki, omp keywords sections appear only when applicable. Display-only.

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


## ws-matt

Matt Pocock's engineering skills (MIT, vendored) as a graph-engineered skill set: 19 `ws-*` skill nodes (18 vendored + ws-graph-engineering) in two tiers (entry orchestrators / worker disciplines), each SKILL.md carrying a `## Graph node` contract. Full graph: `plugins/ws-matt/docs/graph.md`.

### /ws-matt

Single entry for the skill graph.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `entry` | No | None = graph status; `ask`, `implement`, `spec`, `tickets`, `triage`, `grill`, `architecture`, `wayfinder` route to the matching entry node; `setup` bootstraps the project (issue tracker conventions + omp edge-discipline rule) |

**Examples:**
```
/ws-matt
/ws-matt implement
/ws-matt setup
```

---


## ws-project-hub

Multi-repo project hubs. A hub is a small meta-repo (`<project>-main`) that registers all sub-repos (mobile app, marketing site, design, docs, etc.) of a project and launches Claude across them with `--add-dir`. Sub-repos live as gitignored subfolders, each with its own independent git history.

Launching a hub is not a command: `cd <hub> && ./invoke-ai.sh` (hinted by `/ws-hub-status`). The launcher opens an interactive agent picker (Claude Code / omp; extensible registry) — bypass with `--agent <name>` or `WS_HUB_AGENT`.

### /ws-hub-init

Initialize a new project hub. Interactive: prompts for project name, description, and which detected sibling/subfolder git repos to register. Each can be moved into the hub, registered in place, cloned fresh, or skipped. Generates `project.yaml`, `AGENTS.md` (+ thin `CLAUDE.md` import), `invoke-ai.sh`, `README.md`, `.gitignore` (with managed block), and vendors `.claude/skills/project-hub-conventions/`. Offers to scaffold a `role: docs` product docs repo (`<project>-docs`), initialize a hub-level OpenWiki knowledge wiki (with pointers written into every sub-repo's AGENTS.md), and set up herdr (global skill install). Registration details (schema, managed block, tech inference, docs-repo layout) are defined in the project-hub-conventions skill.

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

Generate cross-repo documentation (architecture, contracts, deployment topology) via the `hub-architect` agent. When the hub has an OpenWiki (`<hub>/openwiki/`), offers a prompted wiki refresh afterwards (sub-repo commits are invisible to hub git, so the refresh names the sub-repos explicitly). Targets the `role: docs` repo's `dev-docs/` when one is registered, else the hub's `docs/`.

**Example:**
```
/ws-hub-docs
```

---

### /ws-hub-explained

Generate/refresh the product explainer artefact in the hub's `role: explained` repo — one self-contained HTML (ws-artefacts contract: all inline, WS chrome palette, inline-SVG diagrams) + tokenless `meta.json`, synthesized from openwiki, dev-docs, and project.yaml. Audience: product owner + dev team. Prints the `projects/<name>/git-source.yml` registration block for ws-artefacts (tokens are minted there).

**Example:**
```
/ws-hub-explained
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

### ws-matt Agents

| Agent | Description |
|-------|-------------|
| `ws-matt-reviewer` | Reviews one diff slice per ws-code-review; orchestrator fans out N reviewers |
| `ws-matt-researcher` | Investigates one question per ws-research, sourced summary |
| `ws-matt-tdd-runner` | Executes one red-green cycle per ws-tdd |

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

| Skill | Purpose |
|-------|---------|
| `diataxis` | Diátaxis documentation framework (tutorials, how-to, reference, explanation) |
| `keep-a-changelog` | Keep a Changelog format and versioning practice |
| `conventional-commits` | Conventional Commits standard for structured commit messages |
| `style-guide` | Documentation style and prose linting for consistent technical writing |
| `adr` | Architecture Decision Records |
| `dual-track-docs` | The `docs/` + `dev-docs/` dual-track convention; where a new doc belongs |

### ws-commit-commands Skills

| Skill | Triggers on |
|-------|-------------|
| `ws-jira-conventions` | jira, ticket, WSC-, smart commit, conventional commits |

### ws-matt Skills

| Skill | Purpose |
|-------|---------|
| `ws-graph-engineering` | Node/edge/state contract, fan-out/synthesize, file-handoff protocol |
| `ws-ask-matt` + 8 entry nodes | User-invoked orchestrators (implement, to-spec, to-tickets, triage, grill-with-docs, improve-codebase-architecture, wayfinder, setup) |
| `ws-tdd` + 8 worker nodes | Model-invoked disciplines (code-review, research, prototype, diagnosing-bugs, domain-modeling, codebase-design, resolving-merge-conflicts, grilling) |

### ws-project-hub Skills

| Skill | Triggers on |
|-------|-------------|
| `project-hub-conventions` | project hub, multi-repo, `<name>-main` |
| `ws-artefacts-explained` | explained artefact contract (ws-artefacts format, palette, meta.json, git-source.yml) |

This skill is also vendored into every hub at init time (`<hub>/.claude/skills/`), so hubs remain self-documenting even when the marketplace plugin isn't installed.

Skill loading is description-based: each SKILL.md declares in its `description` frontmatter what it knows and when it applies, and Claude loads it when the conversation matches.
