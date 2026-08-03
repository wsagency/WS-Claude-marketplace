# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Progressive hub adoption (ADR 0007) — a hub is now optional and adoptable later. A single repo, or several loose repos with no `project.yaml`, is a first-class permanent-until-chosen state: no command, skill, agent, hook or rule errors, warns or nags about a missing hub. Project shape detection (hub root / hub sub-repo / standalone) is defined once in `project-hub-conventions` and referenced everywhere; standalone routing is repo-local with the identical `dev-docs/` layout, so a later lift into a hub is a move rather than a rewrite. `/ws-hub init` gains an adopt path — it detects sibling repos already on disk, proposes each with an inferred `type`, and offers a per-file, collision-safe lift of their product-level `dev-docs/` into the new hub knowledge root
- Node exit report (ADR 0008) — exits are invocation-aware: a directly invoked node renders a two-or-three-sentence report (what landed, then the single most likely next entry point plus at most one alternative, each taken from that node's own declared edges); a nested worker returns a state delta only; a terminal or return-only node reports the outcome and stops. The format is stated in exactly two places (the `omp-edge-discipline` rule and `ws-graph-engineering`); each of the 18 graph-node skills declares only its own routing as an `**Exit report:**` bullet, and the six flow commands close the same way. Entry → entry stays user-mediated: the node recommends, never auto-invokes
- `/ws-hub update` — interactive conventions migration for existing hubs: `project.conventions` version marker, authoritative migration table, per-migration apply/skip/abort, idempotent re-runs; ships the v1→v2 migration (role→type rename, hub `dev-docs/` scaffold, product dev-docs move out of the docs repo, client materials → input repo)
- `/ws-hub intake` — input-delivery processing pipeline: detects unprocessed dated folders in `type: input` repos, diffs against the previous delivery, drafts a scoping doc into the hub's `dev-docs/scoping/` (summary, requirements, scope of work in/out, open questions, decisions, tickets), appends `history.md`, and offers the follow-ups (`/ws-docs adr`, `/ws-to-spec`, `/ws-to-tickets` into the target working repo)
- omp-ws: type-aware freshness tests (`test/wiki-freshness.test.ts`) covering the working/input/output split, legacy `role:` mapping, CRLF input, non-`repos:` blocks, malformed entries, the standalone walk, a twin-parity guard that fails when the extension source and the hook template drift, and a shell-vs-TypeScript parity suite that runs the real bash hook against `collectStale` — 184 tests
- Cross-harness orchestration ownership (ADR 0009) — Herdr is the automatic outer scheduler only for 2+ substantial, independent, long-lived repo or subsystem lanes when `HERDR_ENV=1`; each stamped lane may use one batched inner `task` wave for disjoint slices, while review axes, research questions, TDD seams, docs audits, and other short fan-outs stay in one same-session Task/task wave. The same work unit is never submitted at both layers, and parallel Herdr edits require worktrees
- English-only artifact policy across the full WS surface — Claude Code receives the contract from a universal SessionStart hook, omp receives it from the packaged always-apply rule, all 14 worker prompts enforce it directly, and newly generated hub `AGENTS.md` files preserve it for code, specs, tickets, ADRs, changelogs, commits, reviews, research notes, docs, and HTML

### Changed

- **BREAKING:** Hub repo types (ADR 0006) — every `project.yaml` entry now carries `type: working | input | output` (outputs add `purpose: docs | explained | <custom>`, max one per known purpose). Product-level internal docs (cross-repo architecture, product ADRs, runbooks, scoping docs) now ALWAYS live in the hub's own `dev-docs/` beside `openwiki/`; the docs repo shrinks to the user track (`docs/` → Outline). Client deliveries live in dedicated `type: input` repos (`<project>-client`, `<project>-design`, …) with the dated-folder + `history.md` convention. Legacy `role: docs|explained` entries map to `type: output` + matching `purpose:`; unmarked entries are `type: working`. Existing hubs migrate with `/ws-hub update`
- All OpenWiki staleness detection is type-aware (walks `type: working` repos, plus legacy entries carrying neither `type` nor `role`, parsed from `project.yaml`): the Claude Stop hook (`openwiki-freshness.sh`), the omp per-project hook template, the omp extension's `wiki-freshness.ts`, `/ws-hub doctor`'s knowledge-freshness check, and the `openwiki-freshness` TTSR rule — output/input repos and the hub's own `dev-docs/` no longer false-positive the stale-wiki banner (`@wsagency/omp-ws` 0.4.0)
- `hub-architect` writes cross-repo synthesis into the hub's `dev-docs/` unconditionally (no more docs-repo fallback inversion) and analyzes `type: working` repos only; `/ws-hub explained` synthesizes from the hub's `dev-docs/` instead of the docs repo's
- `/ws-docs` hub mode: sweeps `type: working` repos only; user-track product writes route to the `purpose: docs` output repo, product-internal writes to the hub's `dev-docs/` (available even with no docs repo registered); `ws-setup-matt-pocock-skills` product-ADR routing becomes three-state — hub sub-repo → hub `dev-docs/decisions/`, standalone → the repo's own `dev-docs/decisions/`, repo-specific decisions always stay local
- `/ws-hub doctor` gains a conventions-version check (points at `/ws-hub update` when behind); `/ws-hub init` scaffolds the hub `dev-docs/` root and offers input/output repo creation (client materials, docs); `/ws-hub add` asks `type`/`purpose` and can mark existing repos as outputs
- `/ws-hub update` remediation is version-independent: a detection-only scan resolves every migration/remediation choice, then one unified pre-flight covers every existing worktree the plan will touch before any mutation (including legacy-typed sources and unregistered destinations). A create-destination exemption applies only to a path verified absent. Pending migrations run before outstanding remediation; a migration the user skips suppresses the work it owns for that run, while left-behind content re-offers at any marker
- `/ws-hub explained` generates the product explainer in standalone repos too, not only from a hub's `dev-docs/`; it validates every selected output location, merges valid ws-artefacts manifests without dropping unrelated entries, and requires an explicit dedicated subdirectory, replace, or cancel choice for authored/unknown collisions
- ws-tdd is return-only: review/refactor belongs to the caller; it no longer declares outward edges to `ws-code-review` or `ws-codebase-design`, and `graph.md` drops both
- Matt-skill maintenance is now a gated, pin-aware orchestration across the upstream delta, WS adaptations, graph routing, and the omp distribution: dirty-tree isolation, mutually exclusive delta classes, parallel audits before porting, path-by-path WS-preserving updates, graph/frontmatter/reference validation, conditional rebuild, and an outcome log. Non-vendored-only upstream changes no longer advance the vendored pin
- ws-matt graph contracts now route product ADRs to the parent hub's `dev-docs/decisions/` while keeping repo- and bounded-context ADRs local, name the `researcher` worker explicitly, and support repeated waves of independent `tdd-runner` red-green cycles from `ws-implement`; source, reference, and generated omp surfaces are aligned
- `@wsagency/omp-ws` 0.5.0 maps every generated worker to a purpose-specific fixed role (`@slow`, `@plan`, `@task`, `@smol`, or `@tiny`), enables schema-gated per-task `lo|med|hi` effort in the hub preset, and now ships the templates and runtime helper scripts referenced by generated commands. Its SDK/typecheck pin now matches omp 17.2.4, and the isolated smoke uses the runtime's fixed `--no-extensions` + explicit `-e` behavior. WS review, implementation, research, maintenance, docs, hub, design, and ticket flows default to parallel fan-out when their units are independent, with sequential execution retained for dependent, overlapping, or trivial work

### Fixed

Seven-axis review sweep of the hub-repo-types change — 88 findings across Standards, Spec, freshness code, `/ws-hub` flows, skill surfaces, published docs and a repo-wide legacy sweep, all remediated.

- **Data loss in `/ws-hub update`:** the v1→v2 migration scaffolded the hub `dev-docs/{decisions/, runbooks/, architecture.md}` and then moved the docs repo's identically-named tree onto it with no collision rule — three of five signature paths collided by construction, nesting `decisions/decisions/` or silently overwriting product ADRs (all numbered from `0001-`), unrecoverably, since `update` commits nothing. The move is now per-file, detects ADR collisions by number even when slugs/paths differ, merges canonical collection indexes instead of stranding them in side files, refuses other existing destinations, lists and resolves collisions before touching anything, requires clean worktrees, and runs before the gap-filling scaffold
- `/ws-hub update` could never create the `project.conventions` marker it bumped (a v1 hub has no such key by definition, so the hub was re-offered the same migration forever). The marker is now inserted when absent; an idempotent step detected as already applied and a `leave` on an optional relocation both count as completed, while every left-behind content class stays discoverable at any marker. Only a USER migration skip, abort, unresolved collision, or failure leaves the marker behind; skipped/aborted work is never reapplied through remediation in the same run
- `/ws-hub update` pre-flight and client-materials collision handling no longer trust labels or choices over filesystem state: legacy entries that will be retyped and every existing destination are checked before mutation; every `<project>-client` creation path, including intake, first proves the path absent, initializes git, and fully registers it as `type: input`, while an existing path is never scaffolded over; and colliding dated deliveries remain valid `YYYY-MM-DD/` intake targets via explicit per-file resolution instead of an unprocessable `YYYY-MM-DD-from-<source>/` side folder, with merged deliveries recorded `pending` so intake re-lists them
- `/ws-hub intake` keyed "already processed" on a bare date, which collided with the scoping template's own `Processed: <date>` line and was not repo-qualified — one delivery marked a same-dated delivery in another input repo as done. The key is now a structured, repo-qualified `Delivery:` line the template emits; a resolved pass reuses the existing scoping doc for decisions/tickets only and clears its `pending` history entry instead of duplicating or overwriting either record. Intake also refuses to run on an unmigrated hub instead of scaffolding a duplicate client repo
- Every prose surface that filtered on `type: working` now also accepts the legacy form (entries with neither `type` nor `role`), matching the code detectors — `/ws-docs`'s hub sweep previously targeted zero repos on an unmigrated hub, silently no-opping on exactly the hubs that still needed migrating. Same fix in `/ws-hub doctor`, `explained` and `docs`
- `/ws-hub docs` never received the type filter: it analyzed every registered sub-repo and fed input/output repos into the OpenWiki re-scan list, against ADR 0006. It now filters, and gates the `architecture.md` overwrite behind the same diff-and-confirm posture `/ws-docs architecture` already used
- `/ws-hub add`'s OpenWiki pointer instructions added every new input/output repo to coverage despite ADR 0006; the registration flow now adds only `type: working` repos and removes a working repo when it is reclassified as output
- `/ws-hub status`, `repos`, `add`, `describe`, and `docs` retained local "missing `./project.yaml` → run init" fallbacks after project-shape routing became shared, so an invocation inside a registered sub-repo could still suggest scaffolding a second hub there. Every verb now defers to the single ancestor-hub/standalone dispatch before its hub-root precondition
- omp-ws freshness parser: it had no notion of the `repos:` block, so any indented `type:`/`role:`/`path:` key anywhere in `project.yaml` was consumed — a `deploy:` block carrying `type: kubernetes` silently dropped the last working repo, and a `tmux:` block with a `- name:`/`path:` pair invented a phantom working repo pointed at an output repo. A CRLF `project.yaml` returned zero repos and permanently disabled both omp hooks; an entry with an empty `name:` absorbed the following keys into the previous repo and could zero the list; a `repos:` header with a trailing comment was never recognised (hub-mode walked zero repos and all three hooks went silently dead); a column-0 or in-list comment inside `repos:` truncated the list; comment-only values and quoted values with trailing whitespace/CRLF stranded a quote and dropped the repo. All three implementations now scope to `repos:`, tolerate CRLF and trailing-comment headers, drop empty/comment-only entries, clean quoted values without stranding quotes, and parse `purpose:`
- `openwiki-freshness.sh` aborted silently under `set -euo pipefail`: `find … | head -5` took SIGPIPE on a large working repo (reproduced at 20,000 stale files — exit 141, no reminder, every turn) and a single unreadable directory made `find` exit 1 and kill the hook. Both paths now tolerate a non-zero `find` and truncate without SIGPIPE; the hook also prunes `node_modules`/`.git`/all hidden paths, skips symlinked standalone subdirectories for twin parity, reports the true stale count, and lists all working repos in the rescan prompt
- The standalone case is decided rather than divergent (ADR 0007 A6): with no `project.yaml` the repo's own `dev-docs/` IS the product knowledge root, so all three detectors walk it plus each immediate sub-directory's — previously the shell hook fired and both omp hooks stayed silent
- Duplicated-code guard: the omp extension source and the per-project hook template are byte-identical over a marked twin region, now asserted by a test so future drift fails the suite instead of shipping (the review found a live shell-vs-omp divergence of exactly this kind)
- omp-ws ignores per-worktree `banks/` runtime state created by Mnemopi-enabled plugin/smoke runs, preventing SQLite database and WAL files from entering commits
- Stale public surface: both plugin descriptions and the `/ws-hub` frontmatter (`description`, `argument-hint`) omitted `update` and `intake`, so the two new verbs were invisible in the marketplace blurb, the slash-command picker and the generated omp package; `README.md` still taught the retired `role: docs`/`role: explained` model in four passages and omitted both verbs; `/ws-help` gave legacy-hub users no path to the one command that migrates them; the hub `README.md.tmpl` never mentioned the `dev-docs/` knowledge root that `init` creates; `dual-track-docs` still documented the `client-materials/` layout the migration removes
- `hub-architect` carried a drive-by `model: "@task"` frontmatter key that is dead on the omp side (`generate.ts` strips and re-appends it from `AGENT_MODEL_MAP`) and invalid on the Claude Code side; its input-repo `contracts.md` exception is now backed by a footnote on the ADR 0006 semantics table. ADR 0006's numbered `/ws-hub doctor` reference was stale at birth — doctor checks are now referenced by name everywhere

## [4.4.0] - 2026-07-27

### Added

- omp-ws guard hardening: unwraps `bash|sh|zsh -c` wrappers and blocks `git reset --hard` to `upstream/*` / `@{u}` / `@{upstream}` (not just `origin/*`); `generate.ts` now fails the build when a `plugins/ws/rules/` file is neither packaged nor explicitly excluded (no more silently dropped rules); `ws_ticket` close/move refuses to overwrite an existing destination ticket — `@wsagency/omp-ws` 0.3.0, with the package bump rule documented in its README

### Fixed

- Five-agent repo review sweep: ADR 0004 no longer attributes the omp "stays compat" clause to ADR 0003 (the real source is the 2026-07-23 omp dual-agent design spec); graph.md gains the declared `ws-to-spec → ws-domain-modeling` and `ws-implement → ws-domain-modeling` edges and ws-tdd now declares its vocabulary edge to ws-codebase-design; the guard is documented as fail-safe (fails OPEN on internal error) instead of "fail-closed" everywhere; the changelog gate no longer treats `git add -A && echo commit` as a commit; enforce-changelog.sh honors `--amend` (as its comment promised) and reads the commit type out of heredoc `-m "$(cat <<'EOF' ...)"` messages; `/ws-help` lists `/ws-init`; ws-docs init names the Task tool (not "Agent tool"); arch-watcher's broken awk example replaced with the working `git log --grep` form; ws-grilling points at `plugins/ws/UPSTREAM.md`; ADRs 0003–0005 use the same YAML frontmatter as 0001–0002; AGENTS.md states the single-plugin reality up front; dead root scaffolding dirs (`agents/`, `workflows/`, `mcp-servers/`) removed

## [4.3.0] - 2026-07-27

### Added

- `ws-repo-maintenance` skill — the written AI-driven maintenance process for this repo: vendored-upstream refresh (Matt Pocock skills per UPSTREAM.md, herdr per its pin), external-tool version + doc-drift audit (jira-cli, tea, omp, herdr, openwiki, bun, skills CLI — with the exact invocations to re-verify), omp capability adoption, rebuild + release, dated log in dev-docs/maintenance-log.md
- `herdr` skill vendored VERBATIM from ogulcancelik/herdr (pin a979916; self-guarded by HERDR_ENV=1) — ships with the plugin everywhere; global npx install now needed only on machines without the plugin; /ws-hub init herdr step rewritten accordingly
- ADR 0005 — skill and omp-rule naming rule (ws- prefix = WS graph/flow skills and convention-enforcement rules; unprefixed = vendored/generic standards and conventions)

### Fixed

- Three-angle review sweep (wiring/flows, naming/language, docs freshness — 53 findings, 0 broken flows): /ws-hub init omp preset lifted out of the OpenWiki branch (hubs without a wiki now get the preset; new step 5b), stale `pull-back` verb removed from AGENTS.md, `/ws-docs explain` vs `/ws-hub explained` cross-pointers, removed `/contributing` references, `ws-matt-*` agent names in the edge-discipline rule, `name:` frontmatter added to 10 agents and 6 skills (nonstandard `triggers:` keys folded into trigger-bearing descriptions), runbooks now document the real `argument-hint`/`$1` pattern and end with the omp-package regenerate step, release checklist gains the rebuild step (ADR 0004), known-gaps docs scoped to the compat install, /ws-init description and /ws-commit comment gating corrected, English example values in ws-artefacts-explained, and ~30 more doc-freshness corrections

## [4.2.0] - 2026-07-27

### Added

- `@wsagency/omp-ws` 0.2.0 is now the FULL-native omp distribution (ADR 0004): `scripts/generate.ts` builds the complete suite (7 commands, 28 skills, 14 agents with omp frontmatter transform — `@role` model aliases, `name` injection; 4 TTSR rules) from `plugins/ws/` at build time — one source of truth, two complete artifacts; on omp you install ONLY the npm package, no marketplace. Native discovery proven with the Claude-compat provider disabled
- omp package improvements from the 17.1.5 source audit: typed plugin `settings` (jiraProject/guard/dashboard with env fallback), both-installed duplication warning with source-traced remedy (`omp plugin disable ws@ws-marketplace`), compaction preservation (open tickets + changelog state survive `session.compacting`); 139 tests
- ADR 0004 (full-native omp package, generated from single source — supersedes the "stays compat" clause of ADR 0003); capability audit updated in dev-docs/omp-native-improvements.md

### Changed

- omp install docs (README, omp-setup, use-with-omp): native package is the recommended complete path; marketplace install demoted to compat alternative; never run both in omp

## [4.1.0] - 2026-07-27

### Added

- `extensions/omp-ws/` — native omp extension `@wsagency/omp-ws` 0.1.0 (Tier 1+2 of dev-docs/omp-native-improvements.md): fail-safe dangerous-git guard (blocks force-push/reset-hard-origin/clean-fd/rm-rf-escapes at the tool_call layer — verified live), opt-in per-commit changelog gate, Jira session dashboard widget, docs-drift stop nudge, global OpenWiki freshness (defers to per-hub hook), and schema-validated `ws_ticket`/`ws_changelog`/`ws_adr` tools; 104 unit/integration tests, typechecked against omp 17.1.5; installed via `omp plugin link` (marketplace cannot carry TS extensions)
- /ws-hub doctor omp harness check now also reports when the `@wsagency/omp-ws` extension is absent (informational)
- docs/how-to/omp-setup.md gains the extension install section; capability audit recorded in dev-docs/omp-native-improvements.md

## [4.0.0] - 2026-07-27

### Changed

- **BREAKING:** the four plugins (docs-agent, ws-commit-commands, ws-matt, ws-project-hub) are merged into ONE plugin **`ws`** (ADR 0003). Migrate — Claude Code: `claude plugin uninstall docs-agent@ws-marketplace ws-commit-commands@ws-marketplace ws-matt@ws-marketplace ws-project-hub@ws-marketplace && claude plugin marketplace update ws-marketplace && claude plugin install ws@ws-marketplace`; omp: `omp plugin marketplace update ws-marketplace && omp plugin uninstall docs-agent ws-commit-commands ws-matt ws-project-hub && omp plugin install ws` (restart sessions after)
- **BREAKING:** command surface consolidated 15 → 7: `/ws-commit-push-pr` → `/ws-commit pr`; `/ws-clean-gone` → `/ws-commit clean`; `/ws-hub-init|-status|-repos|-add-repo|-describe|-docs|-explained` → `/ws-hub init|status|repos|add|describe|docs|explained` (+ new explicit `/ws-hub doctor`); `/ws-help`, `/ws-matt`, `/ws-docs`, `/ws-status`, `/ws-init` keep their names
- **BREAKING:** worker agents lose the double prefix: `ws-matt:ws-matt-reviewer|researcher|tdd-runner` → `ws:reviewer|researcher|tdd-runner`; all docs agents and hub-architect are now `ws:<name>`
- All content moved via `git mv` (history preserved); merged hooks.json carries the Jira session dashboard (SessionStart), docs enforcement (PreToolUse + Stop), and OpenWiki freshness (Stop); the union allowed-tools of merged routers is unrestricted Bash — the former read-only guards of ws-hub-status and ws-clean-gone are given up consciously

### Removed

- docs-agent UPGRADE-NOTES.md (v2→v3 history lives in git and this changelog)

## [3.13.0] - 2026-07-27

### Added

- docs-agent /ws-docs is now position-aware in hubs — no new command: invoked at the HUB ROOT it runs a **hub sweep** across all dev sub-repos (one subagent per repo in parallel, each repo its own git so runs never conflict): discovery/audit aggregate per-repo reports, catchup presents one combined triage then commits per repo, repair fixes gaps per repo, init offers per-repo init (never scaffolds docs in the hub itself), write/adr/architecture default to product scope without asking; invoked inside a sub-repo, behavior is unchanged (repo-level + product routing)

### Changed

- Hub detection in /ws-docs no longer requires a `role: docs` repo — any hub `project.yaml` triggers hub mode, with a graceful repo-level fallback (pointer to /ws-hub-init step 4) when no docs repo is registered
- /ws-hub-docs scope clarified: it produces the cross-repo synthesis layer only; per-repo docs maintenance across the hub is /ws-docs at the hub root

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
