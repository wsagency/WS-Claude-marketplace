# Command Reference

All available commands in the WS Claude Marketplace. Everything ships in the single **ws** plugin; all operations route through seven commands: `/ws-help`, `/ws-matt`, `/ws-docs`, `/ws-hub`, `/ws-commit`, `/ws-status`, `/ws-init`.

## /ws-help

One-screen orientation guide to the WS system (start here: /ws-matt grill). Adapts to the project — hub, OpenWiki, omp keywords sections appear only when applicable. Display-only.

---

## /ws-matt

Matt Pocock's engineering skills (MIT, vendored) as a graph-engineered skill set: 19 `ws-*` skill nodes (18 vendored + ws-graph-engineering) in two tiers (entry orchestrators / worker disciplines), each SKILL.md carrying a `## Graph node` contract. Full graph: `plugins/ws/docs/graph.md`.

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

## /ws-docs

Dual-track documentation suite. All documentation operations route through the single `/ws-docs` entry.

Unified documentation command. Run with no verb for discovery (artifact status table, no writes).

Position-aware in WS project hubs (repo types per ADR 0006): invoked **inside a sub-repo** it runs repo-level with product routing (user docs go to the `purpose: docs` output repo; product ADRs and architecture go to the hub's `dev-docs/`; local ADRs resolve to the repo root or a bounded context mapped by `CONTEXT-MAP.md`); invoked **at the hub root** it runs a **hub sweep** — `discovery`/`audit`/`catchup`/`repair` fan out one subagent per `type: working` sub-repo in parallel and aggregate (catchup commits per repo), `write`/`adr`/`architecture` default to product scope, `init` never scaffolds docs in the hub itself (offers per-repo init instead). Input and output repos are never swept.

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
| `adr "<decision>"` | New scope-routed ADR: hub product, repo-wide, or mapped bounded-context `dev-docs/decisions/`; lightweight by default, full MADR v4.0.0 for high-cost decisions |
| `architecture` | Regenerate `dev-docs/architecture.md` (diff + confirm) |
| `contributing` | Regenerate 3-file CONTRIBUTING set (diff + confirm) |
| `changelog [version]` | Update `[Unreleased]` or cut version; mirrors to `docs/changelog.md` |
| `release-notes [version]` | Linear-style notes → `docs/release-notes/<version>.md` |
| `explain` | Regenerate `docs/explained.md` — generated Outline-safe onboarding page (not to be confused with `/ws-hub explained`, the `purpose: explained` HTML artefact) |
| `publish` | Lint Outline-safe profile, push `docs/` to Outline (`outline-sync.py`; needs Python 3 + `OUTLINE_API_TOKEN`) |

In a hub, `/ws-docs` enters hub mode: user-audience writes route to the `type: output, purpose: docs` repo, while product-internal writes route to the hub's own `dev-docs/`; local ADRs route to the repo root or mapped bounded context (scope prompt, cacheable as `default_scope`).

**Examples:**
```
/ws-docs
/ws-docs write tutorial "getting started"
/ws-docs adr "adopt jira-cli for Jira access"
/ws-docs changelog
```

---

## /ws-hub

Multi-repo project hubs. A hub is a small meta-repo (`<project>-main`) that registers all sub-repos (mobile app, marketing site, design, docs, etc.) of a project and launches your agent harness across them (Claude Code with `--add-dir` mounts; omp at the hub root). Sub-repos live as gitignored subfolders, each with its own independent git history. All hub tooling is harness-agnostic — new harnesses plug in via the launcher's agent registry.

Launching a hub is not a command: `cd <hub> && ./invoke-ai.sh` (hinted by `/ws-hub status`). The launcher opens an interactive agent picker (Claude Code / omp; extensible registry) — bypass with `--agent <name>` or `WS_HUB_AGENT`.

**Verbs:**
| Verb | Effect |
|---|---|
| `init` | Initialize a new hub (offers doctor when one already exists) |
| `doctor` | Diagnose + repair an existing hub; ready-for-development verdict |
| `update` | Migrate hub conventions to the latest version (interactive, per-migration confirm) |
| `intake` | Process `type: input` deliveries (client materials) into hub `dev-docs/scoping/` knowledge |
| `status` | Read-only aggregated git status across all sub-repos |
| `repos <pull\|clone>` | One git operation across all registered sub-repos |
| `add [--scan]` | Register a sub-repo; `--scan` discovers unregistered repos first |
| `describe` | Refresh `description`/`tech` fields from repo contents |
| `docs` | Cross-repo docs via the hub-architect agent (+ wiki refresh offer) |
| `explained` | Generate the `purpose: explained` product explainer artefact (not to be confused with `/ws-docs explain`, the `docs/explained.md` onboarding page) |

### /ws-hub init

Initialize a new project hub. Interactive: prompts for project name, description, and which detected sibling/subfolder git repos to register — each with a **type** (`working` / `input` / `output` + `purpose`, ADR 0006). Each can be moved into the hub, registered in place, cloned fresh, or skipped. Generates `project.yaml` (with the `conventions` version marker), `AGENTS.md` (+ thin `CLAUDE.md` import), `invoke-ai.sh`, `README.md`, `.gitignore` (with managed block), the hub `dev-docs/` knowledge root (decisions/runbooks/scoping), and vendors `.claude/skills/project-hub-conventions/`. Optionally scaffolds a client input repo (`<project>-client`, `type: input`) and a product docs repo (`<project>-docs`, `type: output, purpose: docs` — user track only), initializes a hub-level OpenWiki knowledge wiki (coverage: `type: working` repos), and sets up herdr (global skill install). Registration details (schema, types, managed block, tech inference, repo layouts) are defined in the project-hub-conventions skill.

Invoked inside an already-initialized hub (detected via `project.yaml`), it does not re-scaffold — it offers the **doctor** flow instead. Invoked from a sub-repo of an existing hub (`project.yaml` found in an ancestor), it reports the ancestor hub path and asks to rerun there — it never scaffolds a second hub from inside a sub-repo.

**Example:**
```
/ws-hub init
```

---

### /ws-hub doctor

Diagnose and repair an existing hub: pull the hub and every sub-repo (`--ff-only`, clean repos only), offer clones for registered-but-missing repos, verify registry integrity (repo types, `.gitignore` block, AGENTS.md markers, thin CLAUDE.md), compare the `conventions` version marker against the latest (points at `/ws-hub update` when behind), refresh drifted generated files (`invoke-ai.sh`, vendored skill, omp rules/hooks), check OpenWiki freshness (against `type: working` repos only), and end with a ready-for-development verdict. Diagnose-only posture available; dirty/diverged repos and user-owned config are never touched — only reported.

**Example:**
```
/ws-hub doctor
```

---

### /ws-hub update

Migrate an existing hub to the latest ws-hub conventions. Reads the `project.conventions` version marker in `project.yaml` (absent → v1), lists pending migrations and version-independent remediation, and resolves the whole plan before writing: per migration **apply / skip / abort**; registry drift **repair / leave**; every legacy classification, relocation, destination, and collision choice. Abort exits before mutation; a skipped migration and the remediation it owns are suppressed for that run. One unified pre-flight then covers the hub and every existing source/destination the resolved plan will touch (including repos identified through legacy `role:` fields); `create <project>-client` is exempt only when its path is absent — an existing path is never scaffolded over. The v1→v2 migration (ADR 0006) renames `role:`→`type:`/`purpose:`, moves product dev-docs into the hub before filling scaffold gaps, relocates client materials into an input repo, and refreshes generated + harness files. The marker advances only when every step completed: an already-applied idempotent step and an explicit `leave` both count as complete; a USER skip, unresolved collision, or failure leaves it unchanged and is reported as partial. Moves are per-file and never overwrite authored destinations; known untouched scaffold stubs require confirmation, colliding ADRs are renumbered whole (filename, heading, index, user-confirmed inbound references), and client delivery folders remain intake-compatible — never `YYYY-MM-DD-from-<source>/`; same-date collisions are resolved per-file or moved to another truthful free date. At any marker, remediation can repair registry drift or re-offer left-behind adoption/docs/client moves; every repair/move is explicitly chosen, a same-run skip/leave is not re-asked, and no class is stranded. Idempotent; re-run resumes cleanly; never commits on your behalf.

**Example:**
```
/ws-hub update
```

---

### /ws-hub intake

Process external deliveries into product knowledge. With no `type: input` repo registered, safely offers to create and fully register `<project>-client` (or register an existing git repo without scaffolding over it). Scans `type: input` repos for dated delivery folders (`YYYY-MM-DD/`) that no scoping doc references yet, plus entries still marked `pending`, then per delivery: diffs against the previous folder; drafts a scoping doc (summary, extracted requirements, scope of work in/out, open questions, decisions, tickets) into the hub's `dev-docs/scoping/`, or reuses the existing doc on a `pending` pass and updates only its decisions/tickets sections; updates the input repo's existing history entry (clearing `pending`) or appends one; and offers the follow-ups — product ADRs (`/ws-docs adr`), `ws-to-spec`, and `ws-to-tickets` into the working repo where the change lands. Input repos stay immutable raw (only `history.md` is written there).

**Example:**
```
/ws-hub intake
```

---

### /ws-hub status

Aggregated git status report across all registered sub-repos: branch, ahead/behind upstream, uncommitted count, recent commits. Read-only; ends with the `./invoke-ai.sh` launch hint (harness-agnostic) and, when problems surfaced, a pointer to `/ws-hub doctor`.

**Example:**
```
/ws-hub status
```

---

### /ws-hub repos

One traversal over all registered sub-repos, verb picks the git operation.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `verb` | Yes | `pull` — `git pull --ff-only` across all sub-repos; `clone` — clone every registered URL into a missing subfolder |

**Examples:**
```
/ws-hub repos pull
/ws-hub repos clone
```

---

### /ws-hub add

Register a new sub-repo (clone-URL, adopt-nested, register-sibling, or move-sibling-in) with a `type` — `working` (default), `input`, or `output` + `purpose`. With `--scan`, first discovers nested/sibling git repos not yet in `project.yaml`. An already-registered repo can be marked as an output (`purpose: docs` / `explained` / custom; max one per known purpose per hub).

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `--scan` | No | Run discovery before registration |

**Examples:**
```
/ws-hub add
/ws-hub add --scan
```

---

### /ws-hub describe

Refresh `description` and `tech` fields in `project.yaml` by reading each sub-repo's README and manifest files. Shows a diff before writing, then regenerates the AGENTS.md repos region.

**Example:**
```
/ws-hub describe
```

---

### /ws-hub docs

Generate cross-repo documentation (architecture, contracts, deployment topology) via the `hub-architect` agent, written into the hub's own `dev-docs/` (the product knowledge root; hubs never carry `docs/`). Analyzes `type: working` repos only. When the hub has an OpenWiki (`<hub>/openwiki/`), offers a prompted wiki refresh afterwards (sub-repo commits are invisible to hub git, so the refresh names the working sub-repos explicitly).

**Example:**
```
/ws-hub docs
```

---

### /ws-hub explained

Generate/refresh the product explainer artefact — a self-contained HTML page (ws-artefacts contract: all inline, WS chrome palette, inline-SVG diagrams) + tokenless `meta.json`, audience product owner + dev team. Routes by project shape: at the **hub root** it writes into the `type: output, purpose: explained` repo (offering to create + register `<project>-explained` first); run from a **sub-repo** it names the ancestor hub and asks to rerun there (never scaffolds a second hub); with **no hub anywhere** (standalone) it defaults to `<repo-name>-explained.html` (or `<topic>.html`) plus `meta.json` at the current repo root, with no `project.yaml` or hub registration. Standalone validates every selected output location before writing: a valid ws-artefacts manifest is merged while preserving unrelated entries; only HTML it names is known generated output; authored/unknown collisions require an explicit validated dedicated subdirectory (reported as registration `path`), replace, or cancel choice. Hub-root sources: OpenWiki, hub `dev-docs/`, and working repos; standalone sources: current repo only.

**Arguments:**
| Name | Required | Description |
|------|----------|-------------|
| `topic` | No | Write `<topic>.html` instead of the whole-product explainer (`<project>-explained.html` at a hub root, `<repo-name>-explained.html` standalone) |

**Example:**
```
/ws-hub explained
```

---

## /ws-commit

Jira-aware git flows via [jira-cli](https://github.com/ankitpokhrel/jira-cli). Detects ticket from branch name, composes Conventional Commits with `(TICKET)` suffix, applies worklogs and transitions with explicit jira-cli calls. PR creation via tea CLI. Ticket breakdown lives in the ws-matt skill graph (`ws-to-tickets`, local-first tracker in `dev-docs/tickets/`).

**Prerequisites:** [tea CLI](https://gitea.com/gitea/tea); [jira-cli](https://github.com/ankitpokhrel/jira-cli) (`brew install ankitpokhrel/jira-cli/jira-cli`, `export JIRA_API_TOKEN=<token>`, `jira init`)

**Verbs:**
| Verb | Effect |
|---|---|
| (none) | Single Jira-aware commit (Conventional Commits + ticket suffix, optional worklog and transition) |
| `pr` | End-to-end flow: commit + CHANGELOG.md + push + PR via tea + optional ticket transition |
| `clean` | Prune branches marked `[gone]` and their worktrees |

### /ws-commit (no verb — commit flow)

Jira-aware commit. Detects ticket key from branch name (`WSC-123-feature`), composes Conventional Commits with `(WSC-123)` suffix, optionally logs a worklog and transitions the ticket via jira-cli.

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

### /ws-commit pr

End-to-end Jira-aware flow: commit, push, open PR with Jira link, optionally transition ticket to In Review.

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
/ws-commit pr
```

---

### /ws-commit clean

Clean up git branches marked as [gone] (deleted on remote but exist locally).

**Behavior:**
1. Lists branches marked as [gone]
2. Removes associated worktrees if any
3. Deletes the local branches

**Example:**
```
/ws-commit clean
```

---

## /ws-status

Show the user's Jira workload (assigned tickets grouped by status) and suggest the next task to pick up. Marks the ticket matching the current branch as "(you're here)".

**Arguments:** None

**Prerequisites:** `/ws-init` already run

**Example:**
```
/ws-status
```

---

## /ws-init

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

## Agents

These agents are spawned via the Task tool, typically by commands. All ship in the ws plugin — canonical reference is `ws:<agent>`.

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
| `reviewer` | Reviews one diff slice per ws-code-review; orchestrator fans out N reviewers |
| `researcher` | Investigates one question per ws-research, sourced summary |
| `tdd-runner` | Executes one red-green cycle per ws-tdd |
| `hub-architect` | Analyzes all sub-repos and generates cross-repo architecture/contracts/deployment docs |

### Usage

Agents are invoked through the Task tool:

```
Task tool with:
  subagent_type: "ws:diataxis-writer"
  prompt: "Write a tutorial on setting up the development environment"
```

---

## Skills

Skills provide knowledge and templates, loaded on demand. All ship in the ws plugin.

### Docs Skills

| Skill | Purpose |
|-------|---------|
| `diataxis` | Diátaxis documentation framework (tutorials, how-to, reference, explanation) |
| `keep-a-changelog` | Keep a Changelog format and versioning practice |
| `conventional-commits` | Conventional Commits standard for structured commit messages |
| `style-guide` | Documentation style and prose linting for consistent technical writing |
| `adr` | Architecture Decision Records |
| `dual-track-docs` | The `docs/` + `dev-docs/` dual-track convention; where a new doc belongs |

### Git / Jira Skills

| Skill | Triggers on |
|-------|-------------|
| `ws-jira-conventions` | jira, ticket, WSC-, smart commit, conventional commits |

### ws-matt Skills

| Skill | Purpose |
|-------|---------|
| `ws-graph-engineering` | Node/edge/state contract, fan-out/synthesize, file-handoff protocol |
| `ws-ask-matt` + 8 entry nodes | User-invoked orchestrators (implement, to-spec, to-tickets, triage, grill-with-docs, improve-codebase-architecture, wayfinder, setup) |
| `ws-tdd` + 8 worker nodes | Model-invoked disciplines (code-review, research, prototype, diagnosing-bugs, domain-modeling, codebase-design, resolving-merge-conflicts, grilling) |

### Project Hub Skills

| Skill | Triggers on |
|-------|-------------|
| `project-hub-conventions` | project hub, multi-repo, `<name>-main` |
| `ws-artefacts-explained` | explained artefact contract (ws-artefacts format, palette, meta.json, git-source.yml) |
| `herdr` | herdr fleet management (vendored upstream skill, self-guarded — active only when `HERDR_ENV` is set) |

### Maintenance Skills

| Skill | Purpose |
|-------|---------|
| `ws-repo-maintenance` | Periodic repo maintenance: orchestrated Matt sync (upstream → WS adaptation → graph → omp) with pin-aware no-op handling; tool/version audit |

The `project-hub-conventions` skill is also vendored into every hub at init time (`<hub>/.claude/skills/`), so hubs remain self-documenting even when the marketplace plugin isn't installed.

Skill loading is description-based: each SKILL.md declares in its `description` frontmatter what it knows and when it applies, and Claude loads it when the conversation matches.
