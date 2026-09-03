# Upstream: mattpocock/skills

This plugin vendors 16 engineering skills from Matt Pocock's skills repo,
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

Upstream's retired project-setup skill is intentionally excluded from the active
surface. `/ws-setup` plus the internal `ws-project-bootstrap` and
`ws-docs-bootstrap` skills own project setup. Never restore the retired skill
or add it back to the rename map during an upstream sync.

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

- **Frozen pre-5 migration fixtures** —
  `ws-project-bootstrap/fixtures/pre-5-engineering/` contains the seven
  byte-preserved tracker, triage, and domain templates needed to recognize
  repositories created by the retired setup skill. They are migration-only
  evidence, not active templates or a vendored skill, and upstream syncs must
  never refresh their bytes.
- **Local-first tracker in dev-docs** — the DEFAULT issue tracker is local
  markdown under `dev-docs/tickets/` (`open/` + `done/`, one kebab-case file
  per ticket, blocking edges as `Blocked by:` lines), replacing upstream's
  `.scratch/` convention. Rationale: local tickets are the fastest tracker for
  agents (fewest tokens); DONE tickets whose results are coded AND dev-docs
  updated are archive — agents don't re-read them. Canonical tracker policy and
  operational adapters are owned by `/ws-setup` and `ws-project-bootstrap`;
  `.scratch/` survives only as a legacy migration/spec-source signal. Active
  local-path references are adapted in `ws-to-tickets`, `ws-implement`,
  `ws-ask-matt`, and `ws-code-review`. Re-apply these active adaptations after
  an upstream refresh; never turn the frozen migration fixtures into runtime
  policy.
- **WS commit/PR close-out in ws-implement** — commits follow the WS
  conventions (Conventional Commits with the ticket reference; `/ws-commit`
  when available), and the PR flow is `/ws-commit pr`, which also handles
  the CHANGELOG entry and the Jira transition when the project is bound —
  ws-implement itself never hand-writes changelog entries (the PR-time entry
  is canonical). A matching Graph-node edge (then → /ws-commit pr at
  branch completion) is WS-authored. Upstream says only "commit your work" —
  re-apply on sync.
- **ADR home + two-tier format** — ADRs live in `dev-docs/decisions/` (single
  home, single numbering), not upstream's `docs/adr/`. The Matt-style lightweight
  template (1-3 sentences) stays the default; big decisions (breaking, expensive
  to undo, or multiple serious options) get the full MADR v4.0.0 template from
  the ws plugin's `adr` skill (`/ws-docs adr`). Applied in
  `ws-domain-modeling/ADR-FORMAT.md` and `SKILL.md`, `ws-grill-with-docs`, and
  `ws-improve-codebase-architecture`. `CONTEXT.md` stays at the repo root.
- **Worker alignment** — `ws-code-review` names `ws-reviewer` for both axis
  reviewers (not `general-purpose`); `agents/ws-reviewer.md` scopes to one
  review assignment (a single axis over the whole diff, or a single slice);
  `agents/tdd-runner.md` runs red-green only (no in-cycle refactor, no
  `refactored` output field — cleanup belongs to the caller's review stage
  (`ws-code-review`) per ws-tdd's rule); `ws-graph-engineering` describes the
  default `ws-implement` fan-out as repeatable waves of independent,
  disjoint-file red-green cycles; both `ws-research` and `ws-wayfinder` name
  `researcher` as the Claude Code research vehicle.
- **Post-publish scheduling in ws-to-tickets** — keep the
  `## After the tickets land` section in `ws-to-tickets/SKILL.md`: English
  artifact language, explicit blocked edges, ready-wave fan-out, one scheduling
  owner per work unit, and the `ws-graph-engineering` backend decision. Do not
  restore the retired `orchestrate` offer, `workflowz` batch note, or separate
  Claude Code sequential path. Not upstream; re-apply on sync.
- **Research-notes default path in ws-research** — `ws-research` defaults unsited
  findings to `dev-docs/research/` (the internal authored-docs track) when the
  repo has no existing research-notes convention. Upstream says only "put it
  somewhere sensible and say where"; re-apply if upstream changes the
  save-location sentence.
- **Session-evidence metadata on local tickets** — local ticket files may
  record an omp `/share` E2E-encrypted link (or an exported transcript) as
  local workflow metadata: the local-tracker equivalent of attaching the
  session to the ticket. Preserve this in the active canonical adapter and
  ticket-writing flows.

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

Upstream marks 8 of the 16 actively vendored engineering skills as reachable
only when the user types them, per harness (documented in upstream
`skills/engineering/README.md`):

- **Claude Code:** `disable-model-invocation: true` in the SKILL.md YAML
  frontmatter.
- **Codex:** `policy.allow_implicit_invocation: false` in the skill's
  `agents/openai.yaml`.

This plugin keeps both upstream keys verbatim and additionally sets
`disableModelInvocation: true` (the camelCase key omp honors) alongside
`disable-model-invocation: true` in the same 8 SKILL.md frontmatters:
ws-ask-matt, ws-grill-with-docs, ws-triage, ws-improve-codebase-architecture,
ws-to-spec, ws-to-tickets, ws-implement, ws-wayfinder. The other 8 engineering
skills and the separately vendored model-invoked `ws-grilling` carry none of
these keys. Across the full 17-entry rename map, exactly 8 carry the
manual-only keys and 9 do not.

## Local additions on top of upstream

- Frontmatter `name:` fields carry the ws- prefix; descriptions are unchanged.
- Every SKILL.md ends with a `## Graph node` section (tier, reads, emits, edges,
  handoff protocol; entry nodes also state the edge rule). These sections are
  WS-authored and do not exist upstream.
- `ws-graph-engineering`, `commands/`, `agents/`, `rules/`, and `docs/graph.md`
  are WS-authored, not vendored.

## Manual sync procedure

This is the detailed, durable version of the ws-matt sync; `ws-repo-maintenance`
§1 is the orchestration overview (the gate sequence) and everything below is the
contract those gates enforce. Run it from a checkout of the marketplace repo.
All artifacts are written in English.

### Preparation

1. **Dirty tree.** `git status --porcelain` must be clean on the paths a sync
   could touch. If uncommitted work overlaps, stop and surface an explicit
   choice to the user — commit it as its own already-green change, stash it,
   move the sync to a dedicated worktree, or abort. Never merge upstream into a
   dirty tree, and never destroy uncommitted work.
2. **Temporary full clone.** Clone upstream into a throwaway dir under `/tmp`
   (not `--depth 1` — the pinned commit must be fetchable so `pin..candidate`
   diffs resolve); nothing upstream is ever written into the repo:

   ```
   git clone https://github.com/mattpocock/skills /tmp/matt-skills-<date>
   candidate=$(git -C /tmp/matt-skills-<date> rev-parse HEAD)
   ```

### Delta classification

Inspect both the complete upstream range and the vendored subset. The complete
diff distinguishes a true no-op from non-vendored churn; the subset determines
whether anything can be ported:

```
git -C /tmp/matt-skills-<date> diff --name-status <pin> "$candidate"
git -C /tmp/matt-skills-<date> diff --name-status <pin> "$candidate" -- \
  skills/engineering skills/productivity/grilling LICENSE
```

Classify the result into exactly one class, applying the rows top to bottom:

| Class | Definition | Port vendored paths? | Bump pin? | omp rebuild? |
|---|---|---|---|---|
| `no-delta` | The complete `pin..candidate` tree diff is empty | no | no | no |
| `non-vendored-docs-only` | The complete diff is non-empty, but the vendored subset is byte-identical | no | no | no |
| `inventory` | An engineering skill directory was added or removed | yes — new/removed set | yes | yes |
| `contentful` | Vendored skill/companion-file or `LICENSE` bytes changed, with no inventory change | yes — changed paths only | yes | if `plugins/ws/` surface changed |

**Pin policy.** The vendored pin records the last *contentful* skill/`LICENSE`
source actually applied — not the last HEAD reviewed. `no-delta` and
`non-vendored-docs-only` runs keep the existing pin and log `candidate` only:
that is why a docs-only upstream bump must not advance the pin or copy skills.

`no-delta` and `non-vendored-docs-only` runs stop here — log the class and
`candidate`, then end the ws-matt phase (the tool/omp phases of the maintenance
run continue independently). `contentful` and `inventory` runs continue.

### Audits (before any port)

Fan out read-only audits in parallel and reconcile them before porting a single
byte — no porting until they agree:

- **Upstream delta** — exact changed paths, and whether each is an
  upstream-change, an expected WS adaptation, or unexpected drift.
- **WS adaptations** — does the change hit a preserve-list item (the
  "WS-local additions" block above)? Flag every re-apply obligation, including
  the three additions (ws-to-tickets post-publish scheduling, ws-research
  default path, local-ticket `share:` line).
- **Graph routing** — do nodes, tiers, or edges move? Must `docs/graph.md` or
  any `## Graph node` section change?
- **omp distribution** — will the regenerated `plugins/ws/` surface change, or
  is the build a no-op?

Unexpected drift (a change outside the known adaptations) stops the run for a
human decision; it is never silently absorbed.

### Porting (WS-local precedence)

Upstream never overwrites a WS adaptation — WS-local content always wins. Port
changed upstream content through the rename map, then re-apply the adaptations
per affected file:

1. Frontmatter `name:` → the `ws-` name; description unchanged.
2. Manual-only keys on the 8 user-invoked engineering skills — keep upstream's
   `disable-model-invocation: true` (and the Codex `agents/openai.yaml`
   `policy.allow_implicit_invocation: false`) verbatim, and keep the omp
   `disableModelInvocation: true` alongside it. The other 8 engineering skills
   and `ws-grilling` carry none of these keys.
3. Cross-reference rewrites — slash refs and plain-name mentions of vendored
   skills only (see the "Deliberately NOT rewritten" list for what stays).
4. The trailing `## Graph node` section — WS-authored, never overwritten; revise
   its content only if the skill's behaviour changed.
5. Every preserve-list item from the "WS-local additions" block above.

**No blind recursive copies.** Port path-by-path through the rename map, never
`cp -r` the upstream category over the vendored one — that would clobber WS-only
files (graph sections, templates, and the `agents/`, `rules/`, `commands/`, and
`docs/` additions). Never delete a WS-only file.

**Conflicts.** Where upstream and a WS adaptation touch the same line, the WS
version wins; record the conflict and the resolution in the log. If the upstream
intent cannot be preserved alongside the WS adaptation, stop for a decision
(possibly an ADR) rather than dropping either side silently.

### Graph integration

If the inventory or any edge/behaviour changed:

- every vendored `skills/ws-*/SKILL.md` has exactly one `## Graph node` section;
- entry tier (the 8 user-invoked skills) still matches the frontmatter keys and
  the `commands/ws-matt.md` route table;
- worker tier plus `ws-graph-engineering` match the subgraphs in `docs/graph.md`;
- each Graph node's edges agree with the skill body's handoffs (no stale edges,
  no missing ones);
- the agent legend names `ws-reviewer`, `researcher`, and the default repeatable
  `ws-implement` → `tdd-runner` fan-out.

### omp rebuild

If any `plugins/ws/` surface changed, regenerate the distribution:
`cd extensions/omp-ws && bun run build` (confirm the printed
command/skill/agent/rule counts) and rerun `bun test`. No `plugins/ws/` change →
skip the rebuild and say so in the log.

### Validation

Re-verify before recording:

- exactly one `## Graph node` per skill in the 17-entry rename map;
- the rename map above agrees with the live mapped skill directories;
- manual-only keys are present on exactly the 8 user-invoked engineering
  skills and absent on the other 8 engineering skills plus `ws-grilling`;
- `LICENSE` byte-identical to upstream;
- bare upstream refs (`/tdd`, `/code-review`, `/ask-matt`, `/implement`,
  `/to-tickets`, `/to-spec`, `/triage`, `/research`, `/wayfinder`) grep-hit only
  this file's rename map (plus the documented `/prototype/<name>` route example);
- `docs/graph.md` passes
  `python3 plugins/ws/scripts/outline-sync.py lint --root plugins/ws/docs`;
- the omp build (if run) regenerated cleanly.

### Pin update + maintenance log

Append the dated entry to `dev-docs/maintenance-log.md` (create it on first run).
The ws-matt phase of that entry records, at minimum:

- `pin_before`, `candidate_head`, `class`;
- `skills_touched` (empty for the no-op classes);
- `unexpected_drift` (none, or the items held for a decision);
- `graph_changed` (yes/no), `omp_rebuild` (yes/no);
- `pin_after` — bumped to `candidate` **iff** a contentful vendored byte or an
  inventory change was applied; otherwise unchanged;
- `actions` and `deferred`.

If a pin-policy or adaptation decision was made, it also gets an ADR per the
two-tier rule: product-scope ADRs route to the parent hub's
`dev-docs/decisions/` when a parent `project.yaml` registers the repo;
repo-wide ADRs stay in this repo's root `dev-docs/decisions/`, and
bounded-context ADRs stay in the context path mapped by `CONTEXT-MAP.md`.
