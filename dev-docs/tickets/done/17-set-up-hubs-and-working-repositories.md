# Set up hubs and working repositories

**What to build:** Make a hub-root /ws-setup run configure the hub and selected locally present working repositories through one visible, ordered transaction while treating input and output repositories as explicit non-targets.

**Blocked by:** 12-enforce-repository-and-origin-boundaries

**Status:** done

- [x] Hub discovery validates the registry and displays the hub, every locally present working repository, and every input or output repository with its exclusion reason before choices are collected.
- [x] The initial selection includes the hub and eligible working repositories in registry order, and the user can remove a blocked working repository before the final plan.
- [x] The hub owns its own complete policy and proposes defaults to children; each selected working repository receives a complete materialized configuration whose valid explicit values win.
- [x] Later hub-default changes do not implicitly rewrite configured children, and aligning a child remains an explicit reconfiguration operation.
- [x] Input and output repositories are never cloned, initialized, or given repository-local WS setup state by the hub transaction.
- [x] One complete cross-repository plan and one confirmation authorize sequential writes in registry order, with repository boundaries and readiness reported separately.
- [x] Real temporary worktree scenarios prove hub-root scope, hub-sub-repository non-fan-out, child-value preservation, exclusions, selection changes, and an aligned no-op rerun.
