# Reconfigure runtime policy with safe resume

**What to build:** Introduce /ws-setup reconfigure as an intentional, minimal-diff policy-change transaction over a strict-valid baseline, proving scope selection, dependency closure, journaling, cutover, audit, and safe resume through a runtime-policy change.

**Blocked by:** 11-ship-standalone-local-setup-transaction

**Status:** ready-for-agent

- [ ] Reconfigure refuses missing, malformed, legacy, older-schema, or future-schema state and directs the user to ordinary setup migration or package update as appropriate.
- [ ] A standalone or hub-sub-repository invocation targets only the current repository; a hub-root invocation requires repository selection first and defaults to the hub alone.
- [ ] The user selects the runtime domain and concrete fields, while every unselected field, artifact, and managed fragment is explicitly preserved.
- [ ] Dependency closure is shown before confirmation, and cancelling a required dependent choice cancels the proposed change rather than silently resetting another value.
- [ ] The confirmed transaction writes a secret-free journal, performs prepare, cutover, and cleanup in order, revalidates local and machine fingerprints, and stops on the first failure without rollback.
- [ ] Disabling a repository runtime requirement never globally removes shared protection used by other repositories; only an exact authorized repository-owned duplicate may be cleaned up.
- [ ] Interrupted work can resume the confirmed remainder or explicitly accept a reviewed valid partial state, and a durable audit record is written before the transient journal is removed.
- [ ] Aligned reconfiguration writes nothing and requires no confirmation; deterministic scenarios cover drift, interruption in each phase, resume, partial acceptance eligibility, and final ownership reporting.
