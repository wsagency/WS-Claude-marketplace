# Enforce repository and origin boundaries

**What to build:** Extend /ws-setup so that repository creation, origin validation, project-shape detection, drift protection, failure reporting, and safe resume are explicit parts of the same transaction instead of implicit shell side effects.

**Blocked by:** 11-ship-standalone-local-setup-transaction

**Status:** ready-for-agent

- [ ] Outside a git repository, discovery performs no mutation and offers the user an explicit choice to stop or include repository creation in the final plan.
- [ ] Repository creation includes initialization and a validated origin as planned items; a missing, malformed, or inaccessible required origin blocks before confirmation.
- [ ] Discovery distinguishes standalone repositories, hub roots, and working repositories inside a hub, and a non-hub-root invocation never fans out beyond the current repository.
- [ ] The plan fingerprints repository identity and every existing artifact or managed range it intends to change, then revalidates those fingerprints immediately before the first write.
- [ ] Unrelated dirty content is named and preserved, while overlap with a planned path or an unprovable managed range blocks without modifying the repository.
- [ ] The first failed write or verification stops later work, reports completed and pending items, states that no rollback occurred, and gives the exact safe rerun command.
- [ ] Rerunning after an injected partial failure rediscovers verified completed work as no-op and applies only the remaining authorized behavior after a fresh plan and confirmation.
