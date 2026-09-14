# Remove OpenWiki from the WS surface

Label: maintenance
Status: resolved
Blocked by: None.

**Requested by the user (2026-09-14):** "izbacio bih openwiki skroz" — remove OpenWiki entirely. This is a breaking change to public surface across both harnesses, so it gets its own effort rather than riding along with unrelated work.

**Scope questions — answered by evidence before work started:**

- The hub's `dev-docs/` remains the product knowledge root; only OpenWiki and its staleness detection are gone.
- The fixture mentions are **inputs**, not generated output: the current `ws-project-bootstrap` adapter templates emit no OpenWiki text, so those fixtures describe released repository state and stay verbatim.
- [x] Claude hook removed: `plugins/ws/hooks/openwiki-freshness.sh` deleted and its registration dropped from `plugins/ws/hooks/hooks.json`.
- [x] omp delivery removed: `plugins/ws/templates/omp/hooks/openwiki-freshness.ts` and the always-apply rule `plugins/ws/rules/openwiki-freshness.md` deleted.
- [x] Extension implementation removed: `extensions/omp-ws/src/wiki-freshness.ts`, its registration in `src/index.ts`, and `test/wiki-freshness.test.ts` deleted.
- [x] Generator and release gate updated: `extensions/omp-ws/scripts/generate.ts`, the `EXPECTED_CLAUDE_HOOK_ASSETS` / `EXPECTED_OMP_HOOK_EVENTS` / `EXPECTED_OMP_RULES` sets in `scripts/verify-release-artifacts.mjs`, the counts in `test/generate.test.ts`, the `package.json` description, and `extensions/omp-ws/README.md` all reflect one fewer Claude hook asset and one fewer omp hook event. The packaged rule count is unchanged at 4 — the hub-only rule MECHANISM disappears, not a packaged rule.
- [x] Public surface prose cleared: `plugins/ws/commands/ws-hub.md` (init scaffold and doctor knowledge-freshness check), `ws-docs.md`, `ws-help.md`, `plugins/ws/agents/hub-architect.md`, and the skills `project-hub-conventions`, `dual-track-docs`, `ws-artefacts-explained`, `ws-repo-maintenance`.
- [x] The `ws-generated-files` rule (`plugins/ws/templates/omp/rules/ws-generated-files.md`) no longer names OpenWiki pages as a protected generated path, while keeping the changelog-mirror and explained-artefact protections intact.
- [x] User docs updated: `docs/how-to/omp-setup.md`, `docs/reference/commands.md`, plus `dev-docs/architecture.md` and root `README.md`.
- [x] Root `CHANGELOG.md` carries a `**BREAKING:**` entry under `[Unreleased]`; `docs/changelog.md` is refreshed by copying the root file, never hand-edited.
- [x] A new ADR records the removal and supersedes the OpenWiki parts of ADRs 0005, 0006, and 0007. Those ADRs, dated specs, and closed tickets are historical records and are NOT rewritten.
- [x] The native package is rebuilt from a clean commit; `bun run test`, `bun run typecheck`, the node bootstrap suites, and `verify-release-artifacts.mjs` all pass against the new expectations.
- [x] A case-insensitive search for `openwiki` returns hits only in historical records (ADRs, dated specs, closed tickets, changelog history).

## Comments

### Resolution — 2026-09-14

OpenWiki is removed from every layer. Implementation deleted: the Claude Stop hook and its registration, the omp per-project hook template, the hub-only always-apply rule, the native extension's `wiki-freshness.ts` and its test suite. The generator's hub-rules packaging mechanism went with it, since the OpenWiki rule was its only member; the unaccounted-rules guard still fails closed and the packaged rule count is unchanged at 4.

Existing hubs are covered by an executable `/ws-hub update` migration v2 to v3 (conventions version bumped to 3, per the `project-hub-conventions` requirement): it removes WS-installed assets, the WS-authored hub section, the per-sub-repo pointer with an extended pre-flight over every sub-repo it edits, and the two generated scaffold snippets in `README.md` and `project.yaml`. It deliberately touches nothing OpenWiki owns — the `openwiki/` directory, its `INSTRUCTIONS.md` coverage section, and the tool-managed `OPENWIKI` marker blocks are reported for the owner to retire through OpenWiki itself. The generic tool-managed-marker-block invariant was restored in root `AGENTS.md`, `project-hub-conventions`, and doctor's registry check, so doctor can no longer undo that safety rule.

ADR 0011 records the decision and supersedes the OpenWiki parts of ADRs 0005, 0006, and 0007 without modifying those records. Root `CHANGELOG.md` carries one `**BREAKING:**` entry; `docs/changelog.md` was refreshed by copying the root file.

Verification: `bun run build`, `bun run typecheck`, `bun run test` (278/278 after aligning the runtime probe fixtures, which still declared the removed hook and a second `session_stop`), the node bootstrap suites (275/275), and the full release gate `verify-release-artifacts.mjs` against a freshly packed tarball — exit 0, with 4 Claude hook registrations (was 5), 5 Claude hook assets (was 6), 6 omp hook events (was 7), 4 omp rules unchanged, parity 211 files, and aligned migrations on both harnesses. A case-insensitive `openwiki` search now hits only historical records, the new ADR, changelog history, and the migration itself.

**Status:** done
