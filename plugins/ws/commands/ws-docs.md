---
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
description: "Unified docs entry: discovery, init, audit, catchup, repair, write, adr, architecture, contributing, changelog, release-notes, explain, publish"
argument-hint: "[init | audit | catchup | repair | write | adr | architecture | contributing | changelog | release-notes | explain | publish] [verb args...]"
---

# /ws-docs — Unified Documentation Entry

Single entry point for all documentation operations in this project. Follows the dual-track-docs convention, with track paths supplied by canonical project policy rather than assumed directory names.

## Canonical policy and capability readiness

Before project-shape routing or verb dispatch, import `inspectCanonicalPolicy`,
`derivePolicyReadiness`, and `deriveDocumentationReadiness` from
`plugins/ws/skills/ws-docs-bootstrap/policy.mjs`. A repository reads policy
ONLY from its own `.wsagency/config.yaml`; never walk upward for configuration.
If that file is absent and `.claude/docs-config.yaml` or
`.claude/ws-project.yaml` exists, stop, name every detected legacy source, and
direct the user to `/ws-setup`. Never read a legacy file's contents or use it
as a fallback. Invalid or older canonical policy also stops with `/ws-setup`;
a future schema stops with an instruction to update the ws plugin.

Require only the capability used by the verb:

- discovery, `audit`, `init`, and `repair` may inspect missing canonical state;
  they report it, while `init` may add a confirmed docs/changelog fragment.
- `write`, `adr`, `architecture`, `contributing`, `explain`, and `publish`
  require `documentation` readiness.
- `changelog` requires `changelog` readiness. `catchup` and `release-notes`
  require `maintenance` because they also route documentation/ADR artifacts.

After policy validation, take `user_track`, `dev_track`,
`default_audience`, `default_scope`, and `adr_for_arch_changes` only from
`config.docs`; take `update_mode`, `path`, and `skip_types` only from
`config.changelog`. Do not fill a missing runtime value with a convention
default.

## Skills loaded

- `dual-track-docs` — convention single source of truth
- `diataxis` — quadrant definitions (loaded when relevant)
- `keep-a-changelog` — changelog format (auto-loads on "changelog")
- `style-guide` — prose + code style
- `adr` — MADR format (loaded for adr verb)

## Repo shape — standalone vs hub

Run **project shape detection** (see `project-hub-conventions`) — it returns
one of three shapes. The result decides behavior before any verb dispatches:

- **Standalone repo** — no `project.yaml` found (ADR 0007): operate locally
  using this repository's configured user and contributor tracks. Repo-wide
  ADRs use `<config.docs.dev_track>/decisions/`; when `CONTEXT-MAP.md` exists,
  bounded-context ADRs use that context's mapped contributor track. No hub,
  no sweep, no warning: every verb below runs locally, so skip the hub scope
  routing and the Hub sweep section entirely.
- **Hub sub-repo** — `project.yaml` was found in a PARENT directory: run
  repo-level with the product scope routing below (the original hub mode).
- **Hub root** — `./project.yaml` belongs to the cwd itself: there is no local
  repo to document (hubs never carry `docs/`), so verbs run as a **hub sweep**
  across the sub-repos (section below).

In a hub, resolve policy at two explicit ownership boundaries:

- **Hub policy** is the hub root's own `.wsagency/config.yaml`. It governs
  product user docs and hub-owned internal product artifacts.
- **Repository policy** is each working repository's own materialized
  `.wsagency/config.yaml`. It governs only that repository's local docs and
  changelog work. Never fall back to or merge with hub policy at runtime.

Resolve `DOCS_REPO` from the hub registry as the path of the single
`type: output, purpose: docs` repository. It receives product user-track
writes at `<DOCS_REPO>/<hub config.docs.user_track>`. Product internal writes
go to `<hub>/<hub config.docs.dev_track>`. Missing or inaccessible output
repositories are explicit blockers for user-track operations: report the
registry/path problem and point to `/ws-hub add`; never create, clone,
initialize, or substitute a repository implicitly.

Scope routing in a hub sub-repo:

- `write` with user audience → product `DOCS_REPO`, using hub policy.
- `write` with dev audience → use child `default_scope`; if `ask`, ask for
  this repository or product. Repository scope uses child `dev_track`;
  product scope uses hub `dev_track`.
- `adr` → resolve repository vs product from child `default_scope`; then use
  that owner's configured `dev_track/decisions/`, with bounded-context
  narrowing only for repository scope.
- `architecture` → resolve scope the same way. Product scope delegates to
  `hub-architect` and targets the hub's configured `dev_track`.
- `changelog`, `release-notes` → repository-local child policy.
- `explain`, `publish` → product `DOCS_REPO` using hub policy.
- `init`, `repair`, discovery → repository-local contributor artifacts using
  child policy. They never scaffold a local user track in a working repo.

At a hub root, product scope is implicit and uses hub policy. Product-internal
operations remain available without a docs output repository; user-track
operations do not.

### Worker dispatch (all scopes)

- **Claude Code:** issue all independent Task calls in one message. Use
  background execution only while the main session has independent preparation
  to do; collect every result before synthesis.
- **omp:** issue one batched `task` call per wave, with shared context at the
  top and one item per unprefixed agent name. Include `effort` only when the
  active task schema exposes it.
- **Herdr outer:** only a hub-root sweep with 2+ substantial, independent repo
  lanes qualifies. The director stamps each pane `WS-HERDR-LANE`; parallel
  writes need `herdr worktree`. A lane may use inner `task` workers for
  disjoint slices it alone owns. Never dispatch the same repo at both layers.

Single-worker verbs use one Task/task worker, never a Herdr pane. The canonical
chooser and lane definition live in `ws-graph-engineering`.

### Hub sweep (invoked at the hub root)

Sweep targets are every accessible `type: working` repository in
`project.yaml`; input and output repositories are excluded. Each working
repository is an independent policy and git boundary. Dispatch one worker per
target through the Worker dispatch contract and pass that repository's
absolute root. Every worker validates only the materialized
`.wsagency/config.yaml` at that root. A missing or blocked child config is a
repository-specific blocker; never substitute hub policy. Aggregate only
after all workers report.

Verb behavior at the hub root:

- **no verb (discovery)** — one `docs-doctor` per working repository with its
  child policy, plus product rows from hub policy. Render configured
  `dev_track`, changelog path, and config readiness per child; then render the
  registered docs output, hub `dev_track`, and `openwiki/` freshness. Do not
  render a local user-track row for working repositories.
- **audit** — for every policy-ready working repository, fan out one
  `docs-doctor` (`mode: audit`), `public-api-watcher`, and `arch-watcher`.
  Report policy blockers beside skipped repositories and merge the rest by
  repository.
- **catchup** — one proposal worker per maintenance-ready repository. Use each
  child's changelog path/skip types and docs paths. Present one combined
  triage, then write and commit per repository. If
  `docs.adr_for_arch_changes` is false, report ADR candidates without
  proposing automatic ADR creation.
- **repair** — discover configured paths per child, list missing-only effects
  grouped by repository, obtain one confirmation, and apply through
  `ws-docs-bootstrap`. Policy blockers are not repair guesses.
- **init** — select working repositories, resolve user-facing choices once,
  then invoke `discoverDocumentation(root, "hub_subrepository", childConfig)`,
  `planDocumentation`, and `applyDocumentation` for each child. The shared
  worker owns every missing-only docs write; it must produce no effect beneath
  `childConfig.docs.user_track`. Each child policy must already be
  materialized, or the repository is blocked with `/ws-setup`; never copy hub
  values at runtime. Compose returned AGENTS.md/CLAUDE.md fragments once in
  the caller.
- **write / adr / architecture** — product scope by default. Use hub policy:
  user writes target the explicit docs output and internal writes target the
  hub `dev_track`. Product architecture delegates to `hub-architect` through
  the same scratch/diff/confirmation gate as `/ws-hub docs`.
- **changelog / release-notes** — ask for a working repository, validate its
  child changelog capability, and run there.
- **explain / publish** — require the registered, locally accessible docs
  output and use the hub-configured `user_track`. Never fall back to the hub
  or initialize an output repository.

## Routing

The verb is `$1` (the first word of `$ARGUMENTS`). If empty → **discovery** mode. Otherwise dispatch the verb.

### No verb → Discovery

Run one `docs-doctor` worker through the Worker dispatch contract (foreground;
it is fast). It returns a structured report. Render this exact table format:

```
ws-docs status
─────────────────────────────────────────────────────────────────
Artifact                                  Status      Notes
─────────────────────────────────────────────────────────────────
<config.docs.user_track>/                 <state>     <note>
  <user_track>/index.md                   <state>     <note>
  <user_track>/tutorials/                 <state>     <note>
  <user_track>/how-to/                    <state>     <note>
  <user_track>/reference/                 <state>     <note>
  <user_track>/explanation/               <state>     <note>
<config.docs.dev_track>/                  <state>     <note>
<config.changelog.path>                   <state>     <note>
<user_track>/changelog.md                 <state>     <note>
CONTRIBUTING.md                           <state>     <note>
.wsagency/config.yaml                     <state>     <note>

Suggested:
  <recommended verbs or exact policy blockers>
```

When canonical config is missing with no legacy source, show the config row as
missing and suggest `/ws-docs init` or `/ws-setup`. A detected legacy source
is a blocker, not a missing row. State icons are `✓ present`,
`⚠ stale|behind|empty`, and `✗ missing`. Do not write anything.

### verb = init

First-time documentation setup delegates every documentation artifact write
to the shared `ws-docs-bootstrap` worker:

1. Inspect canonical policy. Legacy, malformed, older, and future state follows
   the fail-closed rules above. If canonical policy is missing, propose a
   docs-only schema-version-1 config containing the worker's `docs` and
   `changelog` fragments; if valid canonical policy exists, preserve every
   configured value and propose only explicitly missing docs/changelog
   sections.
2. Resolve and confirm all policy choices once. There is no
   `enforce_via_hooks` setting: `changelog.update_mode` is the sole maintenance
   cadence (`commit`, `pull_request`, or `disabled`).
3. Write or merge `.wsagency/config.yaml`, validate it with
   `validateCanonicalConfig`, then call
   `discoverDocumentation(root, projectShape, validatedConfig)`.
4. Run `planDocumentation(discovery)`. Show every create, preserve, skip, and
   conflict. The worker is missing-only and never performs catch-up or
   regeneration.
5. Resolve any real `CLAUDE.md` migration, then compose the worker's
   `contextFragments` with other managed AGENTS.md content exactly once.
6. After confirmation call
   `applyDocumentation(root, plan, plan.hash, failureInjection)`. On failure,
   report `.completed` and `.pending` exactly so a rerun plans only remaining
   missing work.

Print the created paths and a suggested commit using only those paths plus
`.wsagency/config.yaml`, AGENTS.md, and CLAUDE.md. Never commit automatically.

### verb = audit

Verbose diagnosis. Run these 3 agents as one parallel wave through the Worker
dispatch contract:
1. `docs-doctor` with `mode: audit` and the canonical policy
2. `public-api-watcher` with the configured user-reference destination
3. `arch-watcher` with `adr_for_arch_changes`

Collect all three reports, then merge them: render the same table as discovery
(from `docs-doctor`), then a follow-up section combining the watcher findings:

```
─────────────────
Audit details
─────────────────
Commits since last CHANGELOG entry: N
  abc1234  feat(auth): add OTP screen
  def5678  fix: token refresh race
  ...

Public API changes detected:
  src/api.ts: new exports — getUser, listSessions

ADR candidates (architectural signals):
  feb1234  "Migrate auth to JWT"  signals: keyword(migrate), new dep(jsonwebtoken)
```

Optionally write the report to `docs-audit-<YYYY-MM-DD>.md` if the user opts in (AskUserQuestion).

### verb = catchup

Run `changelog-analyzer`, `public-api-watcher`, and `arch-watcher` as one
parallel wave. Pass the configured changelog path and skip types, configured
user/dev tracks, and `adr_for_arch_changes`. If `changelog.update_mode` is
`disabled`, omit automatic changelog proposals; an explicit `changelog` verb
remains available. If `adr_for_arch_changes` is false, list architectural
candidates for awareness but do not offer automatic ADR creation.

Present one interactive triage, then write only accepted changes. The
changelog source is `config.changelog.path`; its user-facing mirror is
`<config.docs.user_track>/changelog.md`. Reference updates and ADRs use the
configured track paths and resolved scope. Stage only paths written in this
run and skip the commit when the write set is empty. Use the last version tag
when one exists, otherwise the SHA of the last commit that changed the
configured changelog. In a hub with `openwiki/`, offer refresh only after
significant internal documentation changes.

### verb = repair

Re-run discovery with canonical policy and pass the result to the shared
missing-only bootstrap planner. Repair may create missing configured
directories, indexes, contributing files, changelog, and managed context
fragments; it preserves authored content and does not repair stale prose or a
behind changelog. The one safe refresh is the derived changelog mirror:
copy `config.changelog.path` to
`<config.docs.user_track>/changelog.md` when the mirror is missing or stale.

Missing docs/changelog policy is a specific blocker, not permission to write
defaults. Direct the user to `/ws-docs init` or `/ws-setup`. Apply the
confirmed missing-only plan through `applyDocumentation`, compose AGENTS.md
and CLAUDE.md fragments once, and print completed/pending paths.

### verb = write

`$2` = type (`tutorial | howto | reference | explanation`), `$3` = topic.

If type is missing or invalid → AskUserQuestion to pick from the 4 options. If topic is missing → AskUserQuestion for it.

Audience routing:

- `tutorial` always uses the configured user track.
- Other types use `config.docs.default_audience`; ask only when it is `ask`.

Resolve the destination from the selected policy owner and configured track.
Do not use literal `docs/` or `dev-docs/` as runtime fallbacks.

Dispatch the matching agent (foreground, single):
- `tutorial` → `diataxis-writer` with `quadrant: tutorial`
- `howto` → `diataxis-writer` with `quadrant: howto`
- `reference` → `api-documenter`
- `explanation` → `diataxis-writer` with `quadrant: explanation`

Pass `destination_track`, `destination_path`, and `topic` inputs to the agent (plus `quadrant` for `diataxis-writer`). `topic` is a declared input of `diataxis-writer` — without it the worker cannot know what to write — so always pass it even though the type is already resolved. After the agent returns, print a one-line spinner status and a final "✓ wrote `<path>`" line.

### verb = adr

`$2` = decision text (required; AskUserQuestion if missing).

Resolve one policy owner and destination directory, then reuse it. Product
scope uses `<hub>/<hubConfig.docs.dev_track>/decisions/`; repository scope
uses `<repo>/<childConfig.docs.dev_track>/decisions/`. For local ADRs, inspect
`CONTEXT-MAP.md` and ask repo-wide vs a mapped bounded context when needed;
never infer context from the edited file. Explicit `adr` always runs:
`adr_for_arch_changes` controls automatic maintenance suggestions, not a
direct user request.

Scan the resolved directory for the highest number, create the next
zero-padded filename, dispatch `adr-writer`, and report the configured path.
Use the lightweight ADR by default and full MADR only for a breaking,
costly-to-undo, or genuinely multi-option decision.

In a hub with `openwiki/`, significant dev-docs changes warrant an OpenWiki refresh (see the hub AGENTS.md; AI-driven).

### verb = architecture

Resolve repository or product policy first. Generate into a scratch directory,
diff against `<resolved dev_track>/architecture.md`, and ask
**proceed | cancel** before copying. Product scope delegates to
`hub-architect`; repository scope uses `architecture-documenter`. When an
OpenWiki exists, keep the architecture document thin: intended boundaries,
contracts, and invariants with a pointer to the derived map.

### verb = contributing

Run one `contributing-generator` with the configured `user_track` and
`dev_track`. It produces the root router,
`<user_track>/contributing.md`, and `<dev_track>/development.md`. Show a diff
and obtain write/skip confirmation per file.

### verb = changelog

`$2` is an optional version. Dispatch `changelog-analyzer` against
`config.changelog.path`, passing `skip_types`. Without a version, update
`[Unreleased]`; with one, cut the version using today's ISO date and open a
fresh `[Unreleased]`. This explicit verb may run even when `update_mode` is
`disabled`.

Afterward mirror the configured changelog to
`<config.docs.user_track>/changelog.md` when documentation policy is present.
If docs policy is absent, report the unavailable mirror without inventing a
user track.

### verb = release-notes

Resolve the version from `$2` or the latest tag, then write
`<config.docs.user_track>/release-notes/<version>.md`. This operation requires
both documentation and changelog policy even though it does not update the
changelog.

### verb = explain

Not to be confused with `/ws-hub explained`. Regenerate
`<resolved user_track>/explained.md` in the standalone repository or explicit
hub docs output. Require the output repository to be registered and present;
never create or initialize it. Generate from the available project registry,
README files, configured internal track, and existing user track. Preserve
the generated marker and Outline-safe profile, then lint with
`outline-sync.py lint --root <target-repository>`.

### verb = publish

Push the configured user track to Outline. In hub mode, run against the
explicit docs output repository while using hub policy; standalone uses the
current repository. Refuse a missing/unavailable output repository without
falling back or creating it.

Run `outline-sync.py lint --root <target-repository>`, then `push --root` (show
a dry-run plan before first publication). Report created, updated, skipped,
conflicted, and archived pages. Outline edits never sync back; `--force`
overwrites conflicts only after the normal lint gate. Commit
`.outline-sync.json` only when it changed. Relay missing Python/token setup
instructions from the script.

## Canonical initialization policy

The bootstrap worker proposes these values only during a confirmed first-time
docs initialization; consumers never use them as runtime fallbacks:

```yaml
schema_version: 1

changelog:
  update_mode: pull_request
  path: CHANGELOG.md
  skip_types: [docs, chore, test, style, build, ci]

docs:
  user_track: docs
  dev_track: dev-docs
  default_audience: ask
  default_scope: repo
  adr_for_arch_changes: true
```

## Constraints

- Never overwrite files without prompt + confirmation (except in `init` when files are missing).
- Never push or commit on the user's behalf without explicit verb authorization (only `catchup` commits automatically after user triage; `publish` commits `.outline-sync.json`).
- All file paths are relative to the project root unless explicitly noted.
- Parallel worker verbs (`init`, `audit`, `catchup`) dispatch one complete wave through the Worker dispatch contract; `architecture` and `contributing` use one worker and may overlap only independent main-session preparation. Other verbs (`repair`, `write`, `adr`, `changelog`, `release-notes`, `explain`, `publish`) run foreground. At the hub root, the same contract decides between Herdr repo lanes and same-session workers.


## When you finish

In two or three sentences, name what the verb changed and the configured path,
then point at the next move. After a writing verb the files are uncommitted —
run `/ws-commit`; after `publish` or `explain`, re-run `/ws-docs` discovery or
`/ws-docs catchup` when maintenance remains. Routes are real `/ws-*` commands
in this plugin.