# Unify WS setup entry points

Label: wayfinder:map

## Destination

A buildable specification for replacing `/ws-init` and `/ws-matt setup` with one public `/ws-setup` entry point that configures user and repository state idempotently, keeps Jira optional, and offers an optional documentation bootstrap without violating graph ownership.

## Notes

- Planning only: this map resolves decisions and hands a clear route to specification; it does not implement the command.
- The public clean cutover is fixed: `/ws-setup` remains; `/ws-init` and `/ws-matt setup` are removed rather than retained as aliases.
- Jira is optional. A user without jira-cli must still be able to complete a useful local-first setup.
- The command offers an optional documentation bootstrap; the ownership boundary with `/ws-docs init` remains to be decided.
- Preserve Claude Code and omp parity, existing user-customized configuration, the entry-to-worker graph rule, and native-package generation.
- Consult `ws-graph-engineering`, `project-hub-conventions`, `dual-track-docs`, and `ws-jira-conventions` while resolving tickets.
- Tracker: local Markdown. Child ticket order is the numeric filename prefix.

## Decisions so far

<!-- One line per resolved child ticket: linked title plus a one-line gist. -->
- [Define the unified setup state machine](../done/01-define-unified-setup-state-machine.md) — `/ws-setup` uses a read-only discover/decide/validate/plan phase, one final confirmation, ordered idempotent writes, verification, and safe resume without rollback.
- [Define tracker and Jira configuration ownership](../done/02-define-tracker-and-jira-ownership.md) — committed `.wsagency/config.yaml` is the sole WS machine config; Local is the default primary tracker, and optional all-ticket Local/Jira synchronization is operation-boundary, conflict-safe, and outage-tolerant.
- [Define the optional documentation bootstrap boundary](../done/03-define-optional-docs-bootstrap-boundary.md) — the docs domain owns one reusable full-init worker; `/ws-setup` includes its missing-only manifest in the single confirmation, invokes the worker directly, and alone composes shared context-file patches.
- [Prototype the first-run and re-run setup experience](../done/04-prototype-first-run-and-rerun-setup-ux.md) — validated UX starts with discovery, asks only unresolved choices, categorizes the complete one-confirmation plan, makes aligned reruns prompt-free, and resumes only pending work after failure.
- [Define the command and skill clean cutover](../done/05-define-command-and-skill-clean-cutover.md) — `/ws-setup` is the sole public entry, backed by internal `ws-project-bootstrap` and `ws-docs-bootstrap` workers; all legacy routes, names, config readers, and generated artifacts are removed atomically and guarded by absence tests.
- [Define the migration, verification, and release contract](../done/06-define-migration-verification-and-release-contract.md) — all known pre-5 formats receive fail-closed verified migration through plain `/ws-setup`; full fixture and installed-artifact gates precede coordinated `ws` 5.0.0 and `omp-ws` 0.7.0 releases.
- [Define the canonical WS project configuration schema](../done/07-define-canonical-ws-project-configuration-schema.md) — strict `schema_version: 1` owns all machine policy in typed sections, permits valid docs-only partial config, and derives capability readiness from one packaged JSON Schema plus repo and machine invariants.
- [Define the complete legacy migration and cleanup matrix](../done/08-define-complete-legacy-migration-and-cleanup-matrix.md) — deterministic pre-5 values migrate through explicit precedence, conflicts and custom/unknown state fail closed, authored state is preserved, and repo-local legacy sources are removed only after semantic read-back.
- [Define hub-root setup scope and transaction boundaries](../done/09-define-hub-root-setup-scope-and-transaction-boundaries.md) — hub setup materializes per-repo defaults across the hub and every working repo, excludes input/output repos, and applies one fingerprinted, sequential, failure-stopping plan with safe resume.
- [Define the reconfiguration scope and safety contract](../done/10-define-reconfiguration-scope-and-safety-contract.md) — explicit repository/domain/field selection expands dependencies visibly; data migrations preserve sources and use a journaled prepare-cutover-cleanup transaction with local/remote drift guards, audit, and safe resume.

## Not yet specified

<!-- No fog recorded yet. Add only questions that cannot be stated precisely until a frontier decision resolves. -->

## Out of scope

- Implementing or releasing `/ws-setup` during this Wayfinder map.
- Compatibility aliases for `/ws-init` or `/ws-matt setup`.
- Redesigning unrelated `/ws-docs`, `/ws-hub`, or `/ws-matt` workflows.
