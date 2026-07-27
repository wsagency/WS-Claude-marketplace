# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.12.0] - 2026-07-27

### Added

- ws-project-hub /ws-hub-init doctor mode: invoked inside an already-initialized hub it no longer re-scaffolds — it asks (doctor fix / diagnose only / new hub elsewhere / nothing) and runs a readiness check: ff-only pulls of hub + clean sub-repos, clone offers for registered-but-missing repos, registry integrity (roles, .gitignore managed block, AGENTS.md markers, thin CLAUDE.md), refresh of drifted generated files (invoke-ai.sh, vendored skill, omp rules/hooks), OpenWiki freshness, and a ready-for-development verdict; dirty/diverged repos and user-owned config are report-only, never touched

### Changed

- ws-project-hub commands are explicitly harness-agnostic: "Harness notes" convention (one bullet per harness, extend by adding a bullet — never fork the flow) recorded in /ws-hub-init and the project-hub-conventions skill (new "Harness policy" section); /ws-hub-status launch hint no longer names Claude
- project-hub-conventions skill: stale omp preset description corrected to match the shipped template (approval defaults to yolo, bash guards off, init asks about both plus modelRoles)

## [3.11.2] - 2026-07-27

### Changed

- Language convention recorded in AGENTS.md: everything written is ENGLISH (code, commands, skills, specs, ADRs, changelogs, commit messages, output templates); user-facing docs may be translated but originals are English; conversation language never leaks into artifacts
- English sweep: /ws-help output template, "Verbose diagnosis" wording, omp-setup comment, explained artifacts default to lang="en" (client-facing ws-artefacts copies may be translated)

## [3.11.1] - 2026-07-27

### Changed

- README rewritten for newcomers: "How the system fits together" overview (work enters through the ws-matt graph, branches close through ws-commit, knowledge lives in three layers, hubs for multi-repo), omp installation section, /ws-help and local-tracker/orchestration/omp-preset notes in plugin details; docs index links the omp guides; getting-started gains the omp path and "your first command: /ws-help"

## [3.11.0] - 2026-07-26

### Added

- ws-project-hub native omp TypeScript hook `openwiki-freshness.ts` (installed into `.omp/hooks/post/` by init): on session settle compares dev-docs mtimes vs the wiki marker and shows a persistent banner + toast with the exact prompted update command (repo list from project.yaml); non-blocking, omp-only, zero config — built on the verified ExtensionAPI (session_stop, ui.setWidget)
- ws-commit-commands /ws-help — one-screen orientation guide (start with /ws-matt grill; adapts to hub/wiki/omp presence)
- ws-matt orchestration UX on omp: ws-to-tickets OFFERS orchestration after creating tickets; ordering follows the Blocked-by dependency frontier; ws-graph-engineering instructs proactively SUGGESTING `workflowz` (N independent items) and `orchestrate` (multi-node runs)
- Local tracker `share:` line convention — session /share links attach to the ticket file

### Changed

- omp preset defaults flipped per owner decision: approval stays **yolo**, bash guard patterns ship commented (off); init now ASKS about posture, guards, and per-project modelRoles (each project can run different providers; template documents the WS class mapping, thinking-level suffixes, and task.agentModelOverrides as the per-agent "custom role" mechanism)

## [3.10.0] - 2026-07-26

### Added

- ws-project-hub omp preset: `/ws-hub-init` writes a project `.omp/config.yml` (approvalMode `write` — omp defaults to yolo, bash guard patterns, earlier compaction) and installs the **WS TTSR rules pack** into `.omp/rules/` — `ws-guard-git` (stream-interrupt on force-push/hard-reset/clean), `ws-commit-format` (Conventional Commits + ticket key + WS trailer reminder per commit attempt), `ws-generated-files` (never hand-edit openwiki pages / changelog mirror / explained artefacts) — WS conventions become enforcement in the model's output stream instead of prose
- ws-graph-engineering documents omp graph primitives verified from source: batched `task` with shared context + `outputSchema` fan-in, `hub` messaging to parked agents, `agent://`/`history://` addresses, `orchestrate`/`workflowz` magic keywords, `/vibe` director mode

## [3.9.0] - 2026-07-26

### Added

- ws-matt local-first issue tracker: default is `dev-docs/tickets/open|done/` (fastest for agents, fewest tokens; done tickets whose results are coded and dev-docs updated are archive agents never re-read), with a new **Local + Jira sync** option (jira-cli mirror for stakeholder tickets); OpenWiki explicitly excludes the tracker dir (working state, not knowledge)
- ws-matt ws-implement closes out through WS conventions: Conventional Commits with the ticket reference, PR via /ws-commit-push-pr (which owns the CHANGELOG entry and Jira transition — PR-time canonical)
- docs/how-to/omp-setup.md — full omp machine-setup checklist (model roles, safety posture, feature toggles, WS wiring, magic keywords); ws-graph-engineering documents omp's verified graph primitives (batched task + outputSchema, hub messaging, agent:// / history://, orchestrate/workflowz, /vibe); dev-docs/omp-integration-backlog.md tracks the remaining integrations

### Removed

- **BREAKING:** /ws-ticket and the ticket-writing skill removed — the flow is grill → to-spec → ws-to-tickets (ADRs capture decisions); the Given/When/Then + user-story guidance for stakeholder-facing tickets moved into the Jira tracker template
- **BREAKING:** Outline pull-back removed entirely — Outline is a one-way publish target (git authoritative; edits made in Outline are re-applied in git and pushed); outline-sync.py drops the pull subcommand (tests 22 → 19, green)

### Changed

- wsault-style thin architecture applied: dev-docs/architecture.md convention (curated boundaries + contracts + pointer to the OpenWiki map) now demonstrated in the product-docs scaffold guidance

## [3.8.0] - 2026-07-26

### Added

- ws-project-hub /ws-hub-explained command + ws-artefacts-explained skill: generates the product explainer artefact (one self-contained HTML per the ws-artefacts contract — all inline, WS chrome palette, inline-SVG diagrams, tokenless meta.json) in the hub's `role: explained` repo, with the proposed `projects/<name>/git-source.yml` registration contract for ws-artefacts
- ws-project-hub `role: explained` in the project.yaml schema; output-role repos (docs, explained) are excluded from the OpenWiki coverage scope and hub-architect analysis
- ws-project-hub OpenWiki freshness Stop hook (non-blocking reminder when dev-docs changed since the last wiki refresh) + omp `openwiki-freshness` rule template installed by init
- Client-materials dated-folder convention: `dev-docs/client-materials/YYYY-MM-DD/` per delivery (latest = truth, older = preserved history) + `history.md` request trail — in the dual-track and hub skills and the product-docs scaffold

### Changed

- `dev-docs/architecture.md` is THIN when an OpenWiki exists: curated boundaries/contracts/invariants + pointer to `openwiki/architecture/` (encoded in /ws-docs architecture, architecture-documenter, hub-architect, dual-track skill)
- Knowledge-loop discipline tightened: ws-implement/ws-to-spec record decisions via ws-domain-modeling → dev-docs/decisions/, ws-research defaults to dev-docs/research/, OpenWiki-refresh notes in /ws-docs adr/catchup/write and /ws-hub-docs, dev-docs bullet in the omp edge rule

## [3.7.1] - 2026-07-26

### Changed

- OpenWiki refresh convention is AI-driven, not CI: `/ws-hub-init` now deletes the workflow OpenWiki generates, writes the coverage scope (all registered sub-repos) into `openwiki/INSTRUCTIONS.md` — without it OpenWiki documents only the largest repo (observed on a live hub) — and the hub AGENTS.md template/skill instruct agents to refresh before major cross-repo work when stale and after major changes, always with the prompted sub-repo list; `/ws-hub-add-repo` extends the scope for new repos
- project-hub-conventions skill states the truth hierarchy explicitly: the wiki is a derived index — authored dual-track docs win on disagreement and the wiki regenerates

## [3.7.0] - 2026-07-25

### Added

- ws-project-hub OpenWiki integration: `/ws-hub-init` offers a hub-level OpenWiki (`openwiki --init` at the hub root — one knowledge wiki for all sub-repos); every sub-repo's AGENTS.md gets a "Hub knowledge wiki" pointer (also written by `/ws-hub-add-repo` for new repos); `/ws-hub-docs` offers a prompted refresh (`openwiki --update "re-scan sub-repos: ..."` — sub-repo commits are invisible to hub git); detection is filesystem presence of `<hub>/openwiki/`
- ws-project-hub herdr integration: `/ws-hub-init` offers herdr fleet setup — one global skill install (`npx skills add ogulcancelik/herdr --skill herdr -g`, covers Claude Code and omp); hub AGENTS.md template documents the workspace-per-subrepo pattern and `HERDR_ENV` detection

### Changed

- Thin-CLAUDE.md convention gains one exception: tool-managed marker blocks (e.g. OpenWiki's `OPENWIKI:START/END`) are owned by their tool and left alone — encoded in AGENTS.md, the project-hub-conventions skill, /ws-docs repair guard, and ws-matt's setup skill

## [3.6.0] - 2026-07-25

### Added

- ADR two-tier convention: lightweight (1-3 sentences) default + full MADR v4.0.0 for big decisions, single home `dev-docs/decisions/` — encoded in the adr skill, adr-writer, and ws-matt's domain-modeling/setup skills
- outline-sync.py: two-pass push (forward links rewritten), documents.list pagination, `--collection-name`, crash-safe incremental state persistence; test suite grown 7 → 22 against an in-memory FakeOutline API
- /ws-commit-push-pr now applies the chosen worklog via `jira issue worklog add` after the commit (was collected but never logged)
- /ws-hub-add-repo retro-mark mode: mark an already-registered repo as `role: docs` (max-one enforced); /ws-hub-init asks the role question during registration

### Changed

- **BREAKING (convention):** ws-matt adapted to WS layout — ADRs to `dev-docs/decisions/`, setup outputs to `dev-docs/agents/` (never the publishable `docs/` track), AGENTS.md-first context editing (thin CLAUDE.md never fattened), hub awareness (product decisions go to the `role: docs` repo); all divergences recorded in UPSTREAM.md for sync preservation
- Changelog timing convention: PR-time is canonical; docs-agent enforce-changelog hook is now opt-in (`changelog_per_commit: false` default) with skip_types fallback to `.claude/ws-project.yaml`
- ws-matt worker alignment: ws-code-review fans out `ws-matt-reviewer` per axis (not general-purpose), ws-matt-tdd-runner is red-green only (cleanup routes to review), ws-matt-researcher wired into wayfinder, node inventories reconciled to 9 entries + 9 workers everywhere; coexistence rule added (ws-matt authoritative for TDD/review/research over superpowers)
- AI attribution unified as `WS Agency AI suite <ai@ws.agency>` (commit trailer + PR footer); single definitive commit-message layout in /ws-commit
- invoke-ai.sh hardening: guarded `clear` (no more aborts on TERM=dumb), tty-gated intro animation, bounded marketplace check with offline skip, per-entry yaml parsing (optional fields stay aligned), per-agent marketplace hints, honest "changed since last launch" wording
- hub-architect and /ws-hub-docs target `dev-docs/` (docs repo's when registered, else the hub's — never a hub `docs/`); ws-hub-status allowed-tools match real `git -C` invocations
- /ws-docs frontmatter on house style (`allowed-tools` + `$1`/`$ARGUMENTS`, no mustache); one authoritative background-verbs list; `--force` documented and implemented as conflicts-only (never skips lint)
- Internal design specs/plans moved `docs/superpowers/` → `dev-docs/superpowers/` (dual-track compliance); docs staleness sweep: GitHub install URL everywhere, jira-cli prerequisites + troubleshooting section, lockstep versioning in dev guides and schema references (ADR 0002), ws-matt visible in architecture/contributing/omp pages

### Fixed

- outline-sync.py: pull now records sync state (pull-back→merge→push cycle no longer dead-ends in conflicts); Outline-authored pulled docs registered in state (no duplicate creation); id/urlId link symmetry both directions; relative link bases computed per destination file; push prints a single JSON report; CommonMark autolinks no longer flagged as HTML; link rewriting leaves code regions untouched; guard against mass-archiving when the docs dir is missing
- enforce-changelog hook: deny decision now actually delivered (correct exit-0 + hookSpecificOutput protocol; previously blocked with no reason shown)
- session-start-dashboard hook tolerates trailing whitespace in config toggles

## [3.5.1] - 2026-07-24

### Added

- ws-matt setup: Jira (jira-cli) offered as a first-class issue-tracker option with a ready template (`issue-tracker-jira.md`, wayfinding via Jira links/JQL) — auto-proposed when `.claude/ws-project.yaml` binds a Jira project, confirmable in a word; freeform "Other" remains. Recorded as a WS-local addition in UPSTREAM.md for sync safety

## [3.5.0] - 2026-07-24

### Added

- ws-matt plugin: Matt Pocock's 17 engineering skills + the grilling dependency (MIT © Matt Pocock, vendored with LICENSE retained, upstream commit recorded in UPSTREAM.md) renamed to `ws-*` and interlinked as a graph-engineered skill set — every SKILL.md carries a `## Graph node` contract (tier, state read, state delta, edges), per Matt's two-tier design (entry nodes never chain into entry nodes)
- ws-matt `ws-graph-engineering` foundational skill: node/edge/state contract, dynamic fan-out + reducer fan-in, classify→workers→synthesize reference shape, `DONE|{path}` file-handoff protocol, per-harness execution notes (Claude Code / omp / Codex)
- ws-matt `/ws-matt` command (graph status, entry routing, project setup) and worker agents `ws-matt-reviewer` / `ws-matt-researcher` / `ws-matt-tdd-runner` with structured-output schemas and `autoloadSkills` for omp's task system
- ws-matt omp edge-discipline rule (installed into `.omp/rules/` by `/ws-matt setup`)
- ws-matt graph map at `plugins/ws-matt/docs/graph.md` (mermaid, Outline-safe)

## [3.4.0] - 2026-07-23

### Added

- Dual-agent support: the marketplace now works in omp (omp.sh) as well as Claude Code — omp reads the Claude-compatible registry natively; commands carry a context-fallback note for runtimes without command pre-execution, plus agent-neutral phrasing for AskUserQuestion/Task and a `CLAUDE_PLUGIN_ROOT` fallback
- ws-project-hub invoke-ai.sh interactive agent picker: registered agents (claude, omp — extensible registry), ENTER = last-used default, `--agent <name>` / `WS_HUB_AGENT` bypass, per-agent reachability in the summary (sibling paths unreachable in omp)
- docs/how-to/use-with-omp.md — install, what works, known gaps (SessionStart dashboard, enforcement hooks, sibling repos)

### Changed

- **BREAKING:** AGENTS.md is the canonical context file everywhere (hub templates, sub-repos, product-docs scaffold, `/ws-docs init`/`repair`, this repo); CLAUDE.md becomes a thin `@AGENTS.md` import — omp never reads a root-level CLAUDE.md; hub commands regenerate the repos region in AGENTS.md
- /ws-docs init offers CLAUDE.md→AGENTS.md migration for existing projects; repair creates the thin import when missing and never appends to CLAUDE.md

## [3.3.0] - 2026-07-21

### Added

- ws-commit-commands /ws-ticket command: turn a brief description into a structured Jira ticket (ticket-writing skill) with optional creation via jira-cli
- ws-commit-commands ticket-writing skill: ticket structure, Given/When/Then acceptance criteria, codebase research, jira-cli creation
- ws-project-hub /ws-hub-docs command — dedicated entry point for the hub-architect agent (cross-repo architecture/contracts/deployment docs)
- ws-project-hub v0.3.0 `role: docs` convention: one product docs sub-repo per hub (dual-track layout, scaffolded by /ws-hub-init, markable via /ws-hub-add-repo)
- docs-agent v3.2.0 hub mode: /ws-docs detects a `role: docs` repo and routes product-level writes there (user docs always product-level; dev-scope prompt cacheable as `default_scope`)
- docs-agent /ws-docs explain verb — generated Outline-safe onboarding page (`docs/explained.md`)
- docs-agent /ws-docs publish and pull-back verbs with `scripts/outline-sync.py` (Python 3 stdlib, Outline REST): profile lint, conflict-safe push with archive-not-delete, pull-back into a review branch/PR; state in `.outline-sync.json` (`--normalize` and attachment upload deferred)

### Changed

- **BREAKING:** ws-commit-commands v3.0.0 migrates all Jira access from the Atlassian MCP server to jira-cli (ankitpokhrel); onboarding now requires `brew install ankitpokhrel/jira-cli/jira-cli`, `JIRA_API_TOKEN`, and `jira init`, then re-running /ws-init
- ws-commit-commands worklogs/transitions/comments are applied by explicit jira-cli calls; the Smart Commit trailer remains as an optional record (`smart_commit_trailer`, default true)
- **BREAKING:** ws-project-hub v0.2.0 consolidates 8 `/hub-*` commands into 6 `ws-hub-*` commands: `/ws-hub-init`, `/ws-hub-status`, `/ws-hub-repos <pull|clone>` (was hub-sync + hub-clone-all), `/ws-hub-add-repo [--scan]` (was hub-add-repo + hub-scan), `/ws-hub-describe`; `/hub-launch` dropped (use `./invoke-ai.sh`)
- ws-project-hub conventions (project.yaml schema, .gitignore block, tech inference, marker pair) single-sourced in the project-hub-conventions skill; commands reference it instead of restating
- docs-agent v3.1.0 renames `tutorial-writer` to `diataxis-writer` (quadrant-parameterized: tutorial | howto | explanation) and has `/ws-docs audit` dispatch arch-watcher and public-api-watcher alongside docs-doctor
- docs-agent writer agents now point at skills instead of restating them (MADR template → adr skill, release-notes comparison → keep-a-changelog, SemVer mapping → conventional-commits); keep-a-changelog automation pipeline deduplicated into conventional-commits
- ws-project-hub hub-architect and /ws-hub-docs now target the `role: docs` repo's `dev-docs/` when one is registered
- Adopt lockstep versioning: every plugin's version equals the repo release version, cut from this changelog (ADR 0002); starting point 3.3.0


### Fixed

- docs-agent adr-writer now writes ADRs to `dev-docs/decisions/` (three occurrences pointed at `docs/decisions/`, contradicting the adr skill and the dual-track convention)
- ws-project-hub CLAUDE.md regeneration markers unified into the `<!-- ws-hub:repos:start/end -->` pair (commands referenced a bare `AUTO-GENERATED` marker that never literally appeared in the template)

### Removed

- **BREAKING:** ws-jira-enhancer plugin retired — /ws-jira-enhancer is replaced by /ws-ticket in ws-commit-commands
- docs-agent orphaned docs-architect agent deleted (never dispatched by /ws-docs; unique AI-readiness guidance folded into the diataxis skill)
- **BREAKING:** ws-claude-sync plugin (8 commands, 1 agent, 1 skill) removed from the marketplace
- **BREAKING:** ws-clamp plugin (4 commands, 1 agent, 1 skill) removed from the marketplace

## [2.0.0] - 2026-06-02

### Added

- Marketplace configuration with docs-agent and ws-commit-commands plugins
- ws-jira-enhancer plugin for transforming brief task descriptions into structured Jira tickets with user stories and acceptance criteria
- ws-claude-sync plugin for cross-machine context sync via GitHub (8 commands, 1 agent, 1 skill)
- ws-clamp plugin for project management with session history preservation (4 commands, 1 agent, 1 skill)
- docs-agent v2.0.0 with ADRs, style guide, conventional commits support, and auto-enforcement via CLAUDE.md hooks
- ws-project-hub plugin for managing multi-repo projects through a single hub repo with subfolder layout and invocation launcher
- ws-project-hub commands: hub-init, hub-launch, hub-sync, hub-status, hub-add-repo, hub-scan, hub-describe, hub-clone-all
- ws-project-hub hub-architect subagent for cross-repo documentation
- ws-commit-commands v2.0.0 with Jira-aware workflows including OAuth onboarding, status dashboard, and Smart Commit worklogs
- ws-commit-commands /ws-init for OAuth onboarding via Atlassian MCP with global and per-project config
- ws-commit-commands /ws-status dashboard showing assigned tickets grouped by status with smart suggestions
- ws-commit-commands /ws-commit with Conventional Commits format, ticket detection, and automatic worklog tracking
- ws-commit-commands /ws-commit-push-pr for end-to-end workflow with Jira linking and optional issue transitions
- ws-commit-commands SessionStart hook injecting compact Jira dashboard on session open
- ws-commit-commands ws-jira-conventions skill documenting branch naming, commit format, and Smart Commit syntax
- ws-commit-commands v2.1.0 with automatic CHANGELOG.md updates in Keep a Changelog format during PR flow
- docs-agent dual-track-docs convention skill separating user-facing (docs/) and contributor-facing (dev-docs/) documentation
- docs-agent /docs command scaffolding and writing across both documentation tracks
- docs-agent audience-aware routing for howto/reference/explanation commands to correct documentation track
- docs-agent /adr and /architecture commands writing to dev-docs/
- docs-agent /contributing command generating 3 files (root router, user guide, dev guide)
- docs-agent changelog commands mirroring CHANGELOG.md updates to docs/changelog.md
- docs-agent /release-notes command writing to docs/release-notes/
- docs-agent v2.1.0 with dual-track documentation convention and revised command structure
- docs-agent /ws-docs unified entry point with 10 documentation verbs
- docs-agent docs-doctor agent for documentation discovery and audit
- docs-agent public-api-watcher agent for monitoring public API changes
- docs-agent arch-watcher agent for architecture documentation monitoring
- docs-agent enforce-changelog and enforce-stop hook scripts for documentation enforcement
- docs-agent PreToolUse and Stop hooks gated by .claude/docs-config.yaml for opt-in enforcement
- docs-agent v3.0.0 with unified /ws-docs entry replacing 11 separate documentation commands
- docs-agent 3 new subagents: docs-doctor, public-api-watcher, arch-watcher

### Changed

- **BREAKING:** docs-agent v3.0.0 removes old documentation commands (/docs, /docs-tutorial, /docs-howto, /docs-reference, /docs-explanation, /adr, /architecture, /contributing, /changelog, /changelog-entry, /release-notes) in favor of unified /ws-docs with 10 verbs

### Fixed

- Correct plugin marketplace command syntax in README (from `claude marketplace` to `/plugin` format)
- ws-project-hub invoke-ai.sh bash compatibility by replacing mapfile calls with portable while-read loops for bash 3.2 support on macOS
