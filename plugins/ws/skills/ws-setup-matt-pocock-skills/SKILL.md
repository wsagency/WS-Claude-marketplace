---
name: ws-setup-matt-pocock-skills
description: Configure this repo for the engineering skills — set up its issue tracker, triage label vocabulary, and domain doc layout. Run once before first use of the other engineering skills.
disable-model-invocation: true
disableModelInvocation: true
---

# Setup Matt Pocock's Skills

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker** — where issues live (local markdown in `dev-docs/tickets/` by default; GitHub, GitLab, and Jira are also supported out of the box)
- **Triage labels** — the strings used for the five canonical triage roles
- **Domain docs** — where `CONTEXT.md` and ADRs live, and the consumer rules for reading them

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config` — is this a GitHub repo? Which one?
- `.claude/ws-project.yaml` — a WS Jira binding (`jira.project`)? If present, **Local + Jira sync** is the natural tracker default for this repo (local working store, stakeholder mirror in the bound Jira project).
- A hub `project.yaml` (checked the same way as `.claude/ws-project.yaml` — look in the parent hub repo when this repo is a registered sub-repo) — does the hub register a repo with `role: docs`? If so, this repo sits in a WS project hub: PRODUCT-level decisions belong in the docs repo's `dev-docs/decisions/`, and only repo-specific decisions stay in this repo's `dev-docs/decisions/`.
- `AGENTS.md` and `CLAUDE.md` at the repo root — does either exist? Is `CLAUDE.md` a thin `@AGENTS.md` import? Is there already an `## Agent skills` section in either?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the repo root
- `dev-docs/decisions/` and any `src/*/dev-docs/decisions/` directories
- `dev-docs/agents/` — does this skill's prior output already exist?
- `dev-docs/tickets/` — the local tracker convention already in use? (a `.scratch/` directory is a sign of the legacy local-markdown convention)
- Is the `ws-triage` skill installed? (a `ws-triage` skill folder alongside this one, or `ws-triage` in your available skills.) This decides whether Section B runs at all.
- Monorepo signals — a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. Present only in a genuinely large multi-package repo; their absence means single-context, which is almost every repo.

### 2. Present findings and ask

Summarise what's present and what's missing. Then take the sections in order — one section, one answer, then the next.

Lead each section with the recommended answer so the user can accept it in a word. Give a one-line explainer only when the choice genuinely branches; skip the section entirely when exploration already settled it (Section B when `ws-triage` isn't installed, Section C when there's no monorepo).

**Section A — Issue tracker.**

> Explainer: The "issue tracker" is where issues live for this repo. Skills like `ws-to-tickets`, `ws-triage`, `ws-to-spec`, and `qa` read from and write to it — they need to know whether to call `gh issue create`, write a markdown file under `dev-docs/tickets/`, or follow some other workflow you describe. Pick the place you actually track work for this repo.

Default posture: propose **Local (`dev-docs/tickets/`)** as the one-word-confirmable default — local tickets are the fastest tracker for agents (no CLI round-trips, fewest tokens to read), and DONE tickets whose results are coded and dev-docs updated are archive that agents never re-read. If `.claude/ws-project.yaml` binds a Jira project, propose **Local + Jira sync** instead. Offer the full list when the user wants something else:

1. **Local (`dev-docs/tickets/`)** — issues live as one kebab-case file per ticket under `dev-docs/tickets/open/`, moved to `done/` on completion; the recommended default for agent-driven work
2. **Local + Jira sync** — local is the working store; when `.claude/ws-project.yaml` binds a Jira project, stakeholder-relevant tickets are mirrored to Jira via jira-cli (create on promotion, `jira issue move` on completion; the local file records the Jira key)
3. **GitHub** — issues live in the repo's GitHub Issues (uses the `gh` CLI)
4. **GitLab** — issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI)
5. **Jira (jira-cli)** — issues live only in a Jira project, driven via the `jira` binary (same auth as `/ws-init`); for teams that live in Jira. The template is pre-filled from the binding, or ask for the project key
6. **Other** (Linear, etc.) — ask the user to describe the workflow in one paragraph; the skill will record it as freeform prose

Record the choice in `dev-docs/agents/issue-tracker.md`: for Local copy `issue-tracker-local.md`; for Local + Jira sync copy `issue-tracker-local-jira.md` with `<PROJECT-KEY>` substituted; for Jira copy `issue-tracker-jira.md` with `<PROJECT-KEY>` substituted. The GitHub, GitLab, and Jira templates carry a "PRs as a request surface" flag, defaulted **off** — leave it off and don't raise it; a user who wants external PRs in the triage queue can flip the flag in the file later.

**OpenWiki must ignore the tracker.** `dev-docs/tickets/` is working state, NOT knowledge. When either local option is chosen and the repo (or its hub) uses OpenWiki, exclude the tracker dir from wiki coverage — add to the wiki's `INSTRUCTIONS.md`: do not index `dev-docs/tickets/` — working state, redundant tokens, potential confusion; knowledge lands in `dev-docs/decisions/` and the code. (Both local templates carry the same rule.)

**Section B — Triage label vocabulary.** Skip this section entirely if the `ws-triage` skill isn't installed (exploration told you) — an uninstalled skill needs no labels.

If it is installed, ask exactly one question:

> Do you want to keep the default triage labels? (recommended: **yes**)

The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. On **yes**, write them as-is. Only if the user says no — usually because their tracker already uses other names (e.g. `bug:triage` for `needs-triage`) — collect the overrides so `ws-triage` applies existing labels instead of creating duplicates.

**Section C — Domain docs.** Default to **single-context** — one `CONTEXT.md` + `dev-docs/decisions/` at the repo root. This fits almost every repo; write it without asking.

Offer **multi-context** — a root `CONTEXT-MAP.md` pointing to per-context `CONTEXT.md` files — only when exploration found monorepo signals. Then confirm which layout they want.

When exploration found a hub `project.yaml` with a `role: docs` repo, note (in `dev-docs/agents/domain.md` and to the user) that PRODUCT-level decisions belong in the docs repo's `dev-docs/decisions/` — only repo-specific decisions stay in this repo's `dev-docs/decisions/`.

### 3. Confirm and edit

Show the user a draft of:

- The `## Agent skills` block to add to whichever of `AGENTS.md` / `CLAUDE.md` is being edited (see step 4 for selection rules)
- The contents of `dev-docs/agents/issue-tracker.md`, `dev-docs/agents/domain.md`, and `dev-docs/agents/triage-labels.md` (the last only when `ws-triage` is installed)

Let them edit before writing.

### 4. Write

**Pick the file to edit:**

- Edit `AGENTS.md` — create it if missing. `AGENTS.md` is canonical (WS convention).
- A `CLAUDE.md` that is a thin `@AGENTS.md` import means "AGENTS.md is canonical" — NEVER add content to a thin `CLAUDE.md` (WS convention: `CLAUDE.md` is only the import line; tool-managed marker blocks such as OpenWiki's `<!-- OPENWIKI:START/END -->` may also be present — leave them alone, they don't make it "fat").
- Only if a legacy fat `CLAUDE.md` exists with no `AGENTS.md`: add the section there, but recommend migrating to `AGENTS.md` with a thin `@AGENTS.md` import left in `CLAUDE.md`.

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

The block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See `dev-docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `dev-docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout — "single-context" or "multi-context"]. See `dev-docs/agents/domain.md`.
```

Include the `### Triage labels` sub-block, and write `dev-docs/agents/triage-labels.md`, only when `ws-triage` is installed and Section B ran. When it isn't, both are omitted.

Then write the docs files using the seed templates in this skill folder as a starting point:

- [issue-tracker-local.md](./issue-tracker-local.md) — local-markdown issue tracker in `dev-docs/tickets/` (the default)
- [issue-tracker-local-jira.md](./issue-tracker-local-jira.md) — local tracker + Jira stakeholder sync (substitute `<PROJECT-KEY>`)
- [issue-tracker-jira.md](./issue-tracker-jira.md) — Jira as the primary tracker via jira-cli (substitute `<PROJECT-KEY>`)
- [issue-tracker-github.md](./issue-tracker-github.md) — GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md) — GitLab issue tracker
- [triage-labels.md](./triage-labels.md) — label mapping (only if `ws-triage` is installed)
- [domain.md](./domain.md) — domain doc consumer rules + layout

For "other" issue trackers, write `dev-docs/agents/issue-tracker.md` from scratch using the user's description.

### 5. Done

Tell the user the setup is complete and which engineering skills will now read from these files. Mention they can edit `dev-docs/agents/*.md` directly later — re-running this skill is only necessary if they want to switch issue trackers or restart from scratch.

## Graph node

- **Tier:** user-invoked (entry)
- **Reads:** git remotes, `AGENTS.md`/`CLAUDE.md`, `CONTEXT.md`/`CONTEXT-MAP.md`, `dev-docs/decisions/`, `dev-docs/agents/`, `dev-docs/tickets/` (and legacy `.scratch/`), hub `project.yaml` signals, monorepo signals, whether ws-triage is installed
- **Emits:** `dev-docs/agents/issue-tracker.md`, `dev-docs/agents/domain.md`, `dev-docs/agents/triage-labels.md` (only when ws-triage is installed), and the `## Agent skills` block in the repo's `AGENTS.md` (or a legacy fat `CLAUDE.md`)
- **Edges:**
  - then → done (terminal precondition node — it configures, it never continues into work)
  - data edges: the emitted config is the shared state read by ws-triage, ws-to-spec, ws-to-tickets, ws-wayfinder and ws-code-review
- **Edge rule:** entry → worker only, never entry → entry — a continuation that lands on another entry node is a user-mediated handoff (recommend it; never auto-invoke it).
- **Handoff protocol:** all output is config files in the repo, referenced by path (DONE|{dev-docs/agents/*.md}).
