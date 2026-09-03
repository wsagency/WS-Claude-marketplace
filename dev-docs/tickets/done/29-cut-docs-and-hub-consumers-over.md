# Cut docs and hub consumers over

**What to build:** Migrate documentation commands, documentation hooks, and project-hub workflows to canonical policy, shared bootstrap behavior, and explicit project-shape readiness without retaining legacy documentation or setup readers.

**Blocked by:** 18-recover-hub-setup-after-drift-and-failure, 23-enforce-lossless-migration-and-cleanup

**Status:** done

- [x] Documentation commands and hooks read audience, scope, paths, ADR routing, changelog policy, and maintenance behavior from canonical policy and the shared docs-bootstrap contract.
- [x] Hub workflows read canonical hub policy and materialized child policy, distinguish hub-owned product artifacts from repository-local work, and never infer runtime inheritance.
- [x] Each consumer requires only documentation, changelog, hub, or repository readiness relevant to its operation and reports specific blockers.
- [x] Detected legacy documentation or setup state fails closed and directs the user to /ws-setup; no migrated consumer performs a fallback read or invents missing values.
- [x] Missing product output repositories remain an explicit hub/documentation concern and are not created or initialized implicitly by setup consumers.
- [x] Existing docs status, init, repair, catch-up, publish, explain, hub docs, and related hook behaviors remain correct against canonical standalone and hub fixtures.
- [x] Consumer and generated-surface tests keep the batch green while the final contraction ticket still owns removal of obsolete public files and references.
