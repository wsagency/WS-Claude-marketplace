# Remove OpenWiki from the WS surface

Label: maintenance
Status: needs-info
Blocked by: None — but the scope questions below must be answered before work starts.

**Requested by the user (2026-09-14):** "izbacio bih openwiki skroz" — remove OpenWiki entirely. This is a breaking change to public surface across both harnesses, so it gets its own effort rather than riding along with unrelated work.

**Scope questions — not settled, do not infer:**

- Does removing OpenWiki also remove the *hub knowledge-freshness concept*, or does the hub `dev-docs/` remain the product knowledge root, simply without staleness detection?
- The `ws-project-bootstrap` fixtures mention OpenWiki as part of released repository state. Each mention is either fixture **input** (a released repo we must still migrate correctly — keep verbatim) or **expected output** (must change). Which fixtures fall in which class needs an explicit ruling.

**Acceptance, once scope is fixed:**

- [ ] Claude hook removed: `plugins/ws/hooks/openwiki-freshness.sh` deleted and its registration dropped from `plugins/ws/hooks/hooks.json`.
- [ ] omp delivery removed: `plugins/ws/templates/omp/hooks/openwiki-freshness.ts` and the always-apply rule `plugins/ws/rules/openwiki-freshness.md` deleted.
- [ ] Extension implementation removed: `extensions/omp-ws/src/wiki-freshness.ts`, its registration in `src/index.ts`, and `test/wiki-freshness.test.ts` deleted.
- [ ] Generator and release gate updated: `extensions/omp-ws/scripts/generate.ts`, the `EXPECTED_CLAUDE_HOOK_ASSETS` / `EXPECTED_OMP_HOOK_EVENTS` / `EXPECTED_OMP_RULES` sets in `scripts/verify-release-artifacts.mjs`, the counts in `test/generate.test.ts`, the `package.json` description, and `extensions/omp-ws/README.md` all reflect one fewer rule and one fewer hook event.
- [ ] Public surface prose cleared: `plugins/ws/commands/ws-hub.md` (init scaffold and doctor knowledge-freshness check), `ws-docs.md`, `ws-help.md`, `plugins/ws/agents/hub-architect.md`, and the skills `project-hub-conventions`, `dual-track-docs`, `ws-artefacts-explained`, `ws-repo-maintenance`.
- [ ] The `ws-generated-files` rule (`plugins/ws/templates/omp/rules/ws-generated-files.md`) no longer names OpenWiki pages as a protected generated path, while keeping the changelog-mirror and explained-artefact protections intact.
- [ ] User docs updated: `docs/how-to/omp-setup.md`, `docs/reference/commands.md`, plus `dev-docs/architecture.md` and root `README.md`.
- [ ] Root `CHANGELOG.md` carries a `**BREAKING:**` entry under `[Unreleased]`; `docs/changelog.md` is refreshed by copying the root file, never hand-edited.
- [ ] A new ADR records the removal and supersedes the OpenWiki parts of ADRs 0005, 0006, and 0007. Those ADRs, dated specs, and closed tickets are historical records and are NOT rewritten.
- [ ] The native package is rebuilt from a clean commit; `bun run test`, `bun run typecheck`, the node bootstrap suites, and `verify-release-artifacts.mjs` all pass against the new expectations.
- [ ] A case-insensitive search for `openwiki` returns hits only in historical records (ADRs, dated specs, closed tickets, changelog history).
