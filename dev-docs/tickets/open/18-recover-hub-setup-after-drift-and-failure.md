# Recover hub setup after drift and failure

**What to build:** Harden the multi-repository setup transaction so complete preflight, dirty-overlap handling, per-worktree drift checks, core-before-docs ordering, first-failure stop, and missing-only recovery remain understandable across a hub run.

**Blocked by:** 16-integrate-reusable-docs-bootstrap, 17-set-up-hubs-and-working-repositories

**Status:** ready-for-agent

- [ ] Before confirmation, every selected target is validated as an accessible independent git worktree with the required origin, canonical or migration state, exact planned paths and ranges, and a normalized registry identity.
- [ ] A missing, escaping, non-git, inaccessible, or invalid selected target blocks that target until repaired or explicitly excluded; setup never silently skips a selected repository.
- [ ] Unrelated dirty content is named and allowed, while overlap with a planned path or an unprovable managed range blocks the affected repository before any cross-repository write begins.
- [ ] Machine-global prerequisites execute once, hub core writes execute first, working-repository core writes follow sequentially in registry order, and optional documentation begins only after every selected core target verifies.
- [ ] Each worktree fingerprint is revalidated immediately before its first write; drift or the first failed item leaves that repository and all later targets pending and performs no rollback.
- [ ] The failure report classifies completed, failed, pending, preserved, skipped, excluded, and no-op work and provides the exact safe rerun instruction.
- [ ] Rerun rediscovers verified work as aligned, preserves authored and customized content, and applies only the remaining plan after fresh authorization.
- [ ] Multi-worktree scenarios inject dirty overlap, pre-write drift, core failure, docs failure, unavailable targets, and recovery at each repository boundary.
