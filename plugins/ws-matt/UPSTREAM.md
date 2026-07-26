# Upstream: mattpocock/skills

This plugin vendors the 17 engineering skills from Matt Pocock's skills repo,
renamed with a `ws-` prefix and adapted with graph-engineering `## Graph node`
sections. The upstream MIT license is retained verbatim in [LICENSE](LICENSE).

- **Source repo:** https://github.com/mattpocock/skills
- **Vendored path:** `skills/engineering/` (the whole category; sibling reference
  files and `agents/openai.yaml` included)
- **Vendored commit:** `ed37663cc5fbef691ddfecd080dff42f7e7e350d`
- **Vendored date:** 2026-07-24
- **License:** MIT (c) 2026 Matt Pocock — `LICENSE` is byte-identical to upstream

## Rename map

| Upstream skill | Vendored as |
|---|---|
| ask-matt | ws-ask-matt |
| grill-with-docs | ws-grill-with-docs |
| triage | ws-triage |
| improve-codebase-architecture | ws-improve-codebase-architecture |
| setup-matt-pocock-skills | ws-setup-matt-pocock-skills |
| to-spec | ws-to-spec |
| to-tickets | ws-to-tickets |
| implement | ws-implement |
| wayfinder | ws-wayfinder |
| prototype | ws-prototype |
| diagnosing-bugs | ws-diagnosing-bugs |
| research | ws-research |
| tdd | ws-tdd |
| domain-modeling | ws-domain-modeling |
| codebase-design | ws-codebase-design |
| code-review | ws-code-review |
| resolving-merge-conflicts | ws-resolving-merge-conflicts |
| grilling (upstream `skills/productivity/grilling`) | ws-grilling |

Cross-references between vendored skills are rewritten to the ws- names, in both
slash form (`/tdd` → `/ws-tdd`, `/code-review` → `/ws-code-review`, `/ask-matt` →
`/ws-ask-matt`, `/triage` → `/ws-triage`, `/to-spec` → `/ws-to-spec`,
`/to-tickets` → `/ws-to-tickets`, `/implement` → `/ws-implement`, `/wayfinder` →
`/ws-wayfinder`, `/prototype` → `/ws-prototype`, `/research` → `/ws-research`,
and likewise for the rest of the map) and plain-name form where the mention
functions as a skill reference.

**Exception — one productivity skill vendored:** `grilling` → `ws-grilling`
(upstream `skills/productivity/grilling`). It is a hard runtime dependency of
`ws-grill-with-docs` and of the HITL flows in `ws-triage` / `ws-wayfinder` /
`ws-improve-codebase-architecture` / `ws-ask-matt`, so it ships with the plugin
and all `/grilling` references are rewritten to `/ws-grilling`.

**WS-local additions (preserve on upstream sync — not present upstream):**

- `ws-setup-matt-pocock-skills/issue-tracker-jira.md` — Jira (jira-cli) tracker
  template, plus the Jira options and `.claude/ws-project.yaml` detection in
  that skill's Section A (a bound Jira project now proposes **Local + Jira
  sync** — see the local-first tracker bullet below; Jira-only remains for
  teams living in Jira). Re-apply after any upstream refresh of the setup
  skill.
- **Local-first tracker in dev-docs** — the DEFAULT issue tracker is local
  markdown under `dev-docs/tickets/` (`open/` + `done/`, one kebab-case file
  per ticket, blocking edges as `Blocked by:` lines), replacing upstream's
  `.scratch/` convention. Rationale: local tickets are the fastest tracker for
  agents (fewest tokens); DONE tickets whose results are coded AND dev-docs
  updated are archive — agents don't re-read them. Section A's proposal order
  is (1) Local, (2) Local + Jira sync — local is the working store, and when
  `.claude/ws-project.yaml` binds a Jira project, stakeholder-relevant tickets
  are mirrored to Jira via jira-cli (create on promotion, `jira issue move` on
  completion; the local file records the Jira key on a `jira: <KEY>` line) —
  then (3) GitHub, (4) GitLab, (5) Jira-only, (6) Other.
  `issue-tracker-local.md` is rewritten to the `dev-docs/tickets/` layout
  (ticket file shape, done-archive rule, wayfinding ops on files: map =
  `dev-docs/tickets/open/<map>.md`, frontier = open tickets with no open
  blockers), and `issue-tracker-local-jira.md` is a new WS-authored template
  for option 2. OpenWiki rule (setup Section A + both local templates):
  `dev-docs/tickets/` is working state, NOT knowledge — when the repo/hub uses
  OpenWiki, exclude it from wiki coverage via the wiki's INSTRUCTIONS.md ("do
  not index dev-docs/tickets/ — working state, redundant tokens, potential
  confusion; knowledge lands in decisions/ and code"). `.scratch/` survives
  only as a legacy signal (setup exploration, ws-code-review's spec-source
  list); the primary local-path references are updated in `ws-to-tickets`
  (step 5, local ticket template, Graph node), `ws-implement` (Reads),
  `ws-ask-matt` (main flow step 3), and `ws-code-review` (spec sources).
  Re-apply all of this after any upstream refresh.
- **WS commit/PR close-out in ws-implement** — commits follow the WS
  conventions (Conventional Commits with the ticket reference; `/ws-commit`
  when available), and the PR flow is `/ws-commit-push-pr`, which also handles
  the CHANGELOG entry and the Jira transition when the project is bound —
  ws-implement itself never hand-writes changelog entries (the PR-time entry
  is canonical). A matching Graph-node edge (then → /ws-commit-push-pr at
  branch completion) is WS-authored. Upstream says only "commit your work" —
  re-apply on sync.
- **ADR home + two-tier format** — ADRs live in `dev-docs/decisions/` (single
  home, single numbering), not upstream's `docs/adr/`. The Matt-style lightweight
  template (1-3 sentences) stays the default; big decisions (breaking, expensive
  to undo, or multiple serious options) get the full MADR v4.0.0 template from
  the docs-agent `adr` skill (`/ws-docs adr`). Applied in
  `ws-domain-modeling/ADR-FORMAT.md` and `SKILL.md`, `ws-grill-with-docs`,
  `ws-improve-codebase-architecture`, `ws-setup-matt-pocock-skills` (Section C,
  exploration, Graph node), and the setup skill's `domain.md` template.
  `CONTEXT.md` stays at the repo root.
- **Setup output relocation** — the setup skill writes `dev-docs/agents/`
  (`issue-tracker.md`, `domain.md`, `triage-labels.md`) instead of upstream's
  `docs/agents/`: internal agent config never goes under `docs/` (the
  publishable user track). All path references updated in `ws-code-review`,
  `ws-triage`, `ws-to-spec`, and the setup skill.
- **CLAUDE.md precedence flip** — setup step 4 edits `AGENTS.md` (creating it if
  missing; WS convention: AGENTS.md is canonical). A `CLAUDE.md` that is a thin
  `@AGENTS.md` import means "AGENTS.md is canonical" and never receives content.
  Only a legacy fat `CLAUDE.md` with no `AGENTS.md` gets the block, with a
  migration recommendation. Upstream prefers `CLAUDE.md` — invert on sync.
- **Hub awareness** — setup exploration also checks for a WS project-hub
  `project.yaml` with a `role: docs` repo (alongside the `.claude/ws-project.yaml`
  check); in a hub sub-repo, PRODUCT-level decisions belong in the docs repo's
  `dev-docs/decisions/` and only repo-specific ones stay local.
- **Worker alignment** — `ws-code-review` names `ws-matt-reviewer` for both axis
  reviewers (not `general-purpose`); `agents/ws-matt-reviewer.md` scopes to one
  review assignment (a single axis over the whole diff, or a single slice);
  `agents/ws-matt-tdd-runner.md` runs red-green only (no in-cycle refactor, no
  `refactored` output field — cleanup routes to `ws-code-review` per ws-tdd's
  rule); `ws-graph-engineering` describes the `ws-implement` tdd-runner fan-out
  as optional; `ws-wayfinder` names `ws-matt-researcher` as the Claude Code
  research vehicle.

**Deliberately NOT rewritten:**

- References to upstream skills outside the engineering category (other than
  `grilling`, above), which are not vendored here: `/grill-me`, `/handoff`,
  `/teach`, `/writing-great-skills` (upstream `skills/productivity/`), `/qa`
  (upstream deprecated), and the built-in `/compact`. They keep their upstream
  names; the referenced skills are not part of this plugin.
- Strings that merely contain a skill word: tracker label vocabulary
  (`needs-triage`, `wayfinder:map`, `wayfinder:<type>`), branch conventions
  (`research/<name>`), file paths (`dev-docs/agents/triage-labels.md`,
  `./triage-labels.md`), example paths/CLIs in `ws-triage/AGENT-BRIEF.md`
  (`src/triage/handler.ts`, `triage list --json`), and the throwaway-route
  example `/prototype/<name>` in `ws-prototype/UI.md` (a URL path, not a skill
  reference). A substring grep for `/triage` or `/prototype` will hit these;
  a boundary-aware grep (ref not followed by `[a-z0-9/-]`) hits nothing outside
  this file.

## Manual-only ("user-invoked") frontmatter mechanism

Upstream marks its 9 user-invoked skills as reachable only when the user types
them, per harness (documented in upstream `skills/engineering/README.md`):

- **Claude Code:** `disable-model-invocation: true` in the SKILL.md YAML
  frontmatter.
- **Codex:** `policy.allow_implicit_invocation: false` in the skill's
  `agents/openai.yaml`.

This plugin keeps both upstream keys verbatim and additionally sets
`disableModelInvocation: true` (the camelCase key omp honors) alongside
`disable-model-invocation: true` in the same 9 SKILL.md frontmatters:
ws-ask-matt, ws-grill-with-docs, ws-triage, ws-improve-codebase-architecture,
ws-setup-matt-pocock-skills, ws-to-spec, ws-to-tickets, ws-implement,
ws-wayfinder. The 8 model-invoked skills carry none of these keys, matching
upstream.

## Local additions on top of upstream

- Frontmatter `name:` fields carry the ws- prefix; descriptions are unchanged.
- Every SKILL.md ends with a `## Graph node` section (tier, reads, emits, edges,
  handoff protocol; entry nodes also state the edge rule). These sections are
  WS-authored and do not exist upstream.
- `ws-graph-engineering`, `commands/`, `agents/`, `rules/`, and `docs/graph.md`
  are WS-authored, not vendored.

## Manual sync procedure

Upstream is actively maintained and will drift. To sync:

1. Shallow-clone upstream and record the new commit:
   `git clone --depth 1 https://github.com/mattpocock/skills <tmp>` then
   `git -C <tmp> rev-parse HEAD`.
2. Diff each upstream skill against its vendored counterpart using the rename
   map above, ignoring the known adaptations:
   `diff -r <tmp>/skills/engineering/<name> plugins/ws-matt/skills/ws-<name>` —
   expected differences are the frontmatter `name:`, the added
   `disableModelInvocation: true` on the 9 user-invoked skills, the rewritten
   cross-references, and the trailing `## Graph node` section.
3. Check the upstream inventory: a skill added to or removed from
   `skills/engineering/` means adding/removing a `ws-` directory, updating the
   rename map here, and updating `docs/graph.md` (nodes and edges).
4. Apply upstream content changes, then re-apply the adaptations per file:
   ws- `name:`, the omp key on user-invoked skills, cross-reference rewrites
   (slash refs and plain-name mentions of vendored skills only — see the NOT
   rewritten list), and the `## Graph node` section (revise its content if the
   skill's behaviour changed).
5. Re-verify: 
   - every SKILL.md has exactly one `## Graph node` section;
   - grepping `plugins/ws-matt/` for bare upstream refs (`/tdd`,
     `/code-review`, `/ask-matt`, `/implement`, `/to-tickets`, `/to-spec`,
     `/triage`, `/research`, `/wayfinder`) hits only this file's rename map
     (plus the documented `/prototype/<name>` route example);
   - `LICENSE` still byte-identical to upstream;
   - `docs/graph.md` passes the Outline-safe lint
     (`outline-sync.py` `lint_markdown`).
6. Update the vendored commit SHA and date at the top of this file.
