# Maintenance Log

## 2026-08-01 — Herdr and omp orchestration architecture audit

### Scope

| Area | Result |
|---|---|
| Herdr vendored skill | Current — pinned `a979916` matches upstream `master` |
| omp runtime and task schema | Audited on omp 17.2.4 |
| WS commands, skills, and agents | Scheduler ownership, fan-out, roles, effort, and artifact language aligned |
| omp generated distribution | Rebuilt and packaged as `@wsagency/omp-ws` 0.5.0 |

### Outcome

- ADR 0009 defines one scheduling owner per work unit: Herdr owns only 2+ substantial, independent, long-lived repo/subsystem lanes; a stamped pane may fan out its own disjoint inner slices through one batched `task` call; shorter review, research, TDD, docs, design, ticket, and maintenance waves use Task/task directly.
- Every WS worker agent remains a leaf. omp role aliases are purpose-specific (`@slow`, `@plan`, `@task`, `@smol`, `@tiny`), while `task.enableEffort` exposes per-item `hi|med|lo` without multiplying model definitions.
- The English-artifact contract now reaches every harness: Claude SessionStart context, omp's always-apply rule, all 14 agent prompts, public guidance, and generated hub `AGENTS.md`.
- The native generator now ships the templates and runtime scripts referenced by generated commands; package publication no longer omits those runtime dependencies.

### Evidence

- Herdr's vendored `SKILL.md` is content-identical to pinned upstream `a979916` (the local file adds only the conventional terminal newline); proactive WS scheduling lives only in the rule, graph-engineering skill, SessionStart hook, and hub templates.
- `bun run build`: 7 commands, 30 skills, 14 agents, 4 rules, templates, and 3 runtime scripts.
- `bun test`: 186 passed, 0 failed, 352 assertions; `bun run typecheck`: passed.
- The native SDK/typecheck pin now matches installed omp 17.2.4; the audit confirmed `task.enableEffort` (introduced in 17.1.6), fixed role aliases, and isolated explicit `-e` loading under `--no-extensions`.
- `npm pack --dry-run`: 123 entries and all required templates, runtime helpers, policy rules, and agents present.
- Graph lint, changelog validation/mirror, and `git diff --check` passed; the changelog validator reports only the repository's existing historical empty-section and missing-comparison-link warnings.

## 2026-08-01 — Matt skills refresh audit and orchestration hardening

### Scope

| Area | Result |
|---|---|
| ws-matt vendored upstream | Checked |
| herdr vendored upstream | Skipped — outside this run |
| External tool/version audit | Skipped — outside this run |
| omp capability adoption | Skipped — no omp version audit requested |
| omp generated distribution | Rebuilt because the WS skill surface changed |

### ws-matt outcome

- `pin_before`: `ed37663cc5fbef691ddfecd080dff42f7e7e350d`
- `candidate_head`: `2ab958093e83e0ec752e6c1c5932da465bf23e0c`
- `class`: `non-vendored-docs-only`
- `skills_touched`: `[]` — no upstream skill content was copied
- `unexpected_drift`: none in the upstream vendored surface; the local integration audit found and repaired ADR-routing and worker-agent graph gaps
- `graph_changed`: yes — WS-local contract repair, not an upstream skill delta
- `omp_rebuild`: yes
- `pin_after`: `ed37663cc5fbef691ddfecd080dff42f7e7e350d` (unchanged)
- `deferred`: none

### Evidence

- The pin is an ancestor of the candidate. The two intervening commits change only upstream `README.md`; `skills/engineering/` (17 skills, 52 files), `skills/productivity/grilling/`, and `LICENSE` are byte-identical.
- No upstream skill directory was added or removed, and no release tag newer than `v1.1.0` exists.
- `plugins/ws/UPSTREAM.md` and `ws-repo-maintenance` now define dirty-tree isolation, mutually exclusive delta classes, parallel upstream/WS/graph/omp audits, conscious path-by-path porting, WS-local precedence, graph/reference gates, conditional omp regeneration, validation, and pin/no-op logging.
- The WS-local preserve inventory now explicitly includes the `ws-to-tickets` omp orchestration section, the `ws-research` default `dev-docs/research/` path, and the local-ticket `share:` evidence link.
- Graph integration now routes product ADRs to a registered parent hub's `dev-docs/decisions/`, keeps repo- and bounded-context decisions at their narrowest local scope, names the `researcher` worker, and records optional repeated waves of independent `tdd-runner` red-green cycles from `ws-implement`.

### Verification

- Rename map: 18 mapped skills (17 engineering plus `ws-grilling`), each with exactly one `## Graph node`.
- Manual-only frontmatter: exactly 9 skills carry both Claude/omp disable keys and Codex `allow_implicit_invocation: false`; the remaining 9 mapped workers do not.
- Boundary-aware bare upstream skill references outside `UPSTREAM.md`: 0.
- Upstream vendored-path delta: 0 files; WS `LICENSE` remains byte-identical.
- Graph lint: clean (`python3 plugins/ws/scripts/outline-sync.py lint --root plugins/ws/docs`).
- omp generation: 7 commands, 30 skills, 14 agents, 4 rules; corrected contracts confirmed in generated skill copies.
- omp gates: TypeScript typecheck passed; Bun tests passed (184 tests, 0 failures, 292 assertions).
- Changelog mirror and structural validation passed; the validator still reports the repository's existing historical empty-section and missing-comparison-link warnings.
- Repository whitespace diff check: clean (`git diff --check`).
