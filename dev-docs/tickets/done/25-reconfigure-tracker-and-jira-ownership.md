# Reconfigure tracker and Jira ownership

**What to build:** Let a configured repository change its primary tracker, Local/Jira synchronization, or Jira project through an explicit data-disposition and remote-drift-safe transaction that never abandons or deletes existing work.

**Blocked by:** 15-add-local-jira-transactional-synchronization, 24-reconfigure-runtime-policy-with-safe-resume

**Status:** done

- [x] Changing primary tracker requires an explicit preserve-as-history, copy-selected, copy-open, copy-all, or cancel disposition for every existing store.
- [x] Source tickets and issues are never automatically deleted, closed, moved, reassigned, or stripped of unsupported fields; copies retain source links and list any semantic loss before confirmation.
- [x] Claimed local work, unresolved same-field conflicts, and pending synchronization block only the affected migration until resolved or explicitly excluded.
- [x] Changing Jira projects preserves old keys as inactive history or creates verified copies in the new project; old issues are never cross-project moved or deleted automatically.
- [x] Every external create or update uses a deterministic correlation token, and the journal records returned identities before another dependent operation runs.
- [x] Remote fingerprints include item identity, version or update time, and mapped-field hashes and are re-fetched immediately before each mutation; drift stops for fresh authorization.
- [x] Canonical ownership, active mappings, adapters, readiness, source preservation, and audit records are verified before cleanup completes.
- [x] Deterministic fake-adapter scenarios cover each disposition, unsupported fields, claimed-work blocking, pending sync, conflict resolution, project rebinding, remote drift, interruption, resume, and no-op.
