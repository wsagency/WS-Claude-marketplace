# Define the optional documentation bootstrap boundary

Map: unify-ws-setup-entrypoints
Label: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: None — can start immediately.

## Question

How should `/ws-setup` offer documentation bootstrap while preserving the entry-to-worker graph rule: own a reusable docs-initialization module, emit a user-mediated handoff to `/ws-docs init`, or establish another explicit boundary—and what artifacts may each side write?

## Answer

The docs domain owns one reusable, internal documentation-bootstrap worker contract and its templates. Both `/ws-docs init` and `/ws-setup` may invoke that worker directly; `/ws-setup` must never invoke the `/ws-docs` entry node. This preserves the entry-to-worker graph rule and prevents a second implementation of documentation initialization.

The worker implements the complete project-shape-aware `/ws-docs init` contract. For a standalone repository, it plans both user and internal tracks plus the applicable root documentation artifacts. At a hub root, it plans the normal eligible `type: working` repository sweep and product-level artifacts. The caller supplies a discovered, validated manifest of exact targets.

When called by `/ws-setup`, every docs create, preserved artifact, conflict, worker dispatch, and shared-file change appears in `/ws-setup`'s complete plan before its single final confirmation. The docs worker receives that confirmed manifest and must not prompt again. It creates only missing artifacts and preserves existing authored documentation and customized values; regeneration of existing documents is outside bootstrap.

Documentation configuration moves into the `docs:` section of the committed `.wsagency/config.yaml`. Legacy `.claude/docs-config.yaml` is migration input only. The docs worker owns docs-specific files and returns the canonical documentation-maintenance fragment for shared context files. In the unified setup flow, `/ws-setup` alone composes and applies the final `AGENTS.md` and thin `CLAUDE.md` patches so two workers never write the same shared file. When `/ws-docs init` is the direct caller, that caller applies the same returned fragment.

A docs-worker failure stops `/ws-setup` and reports completed and pending manifest entries. There is no rollback: a re-run rediscovers the state and resumes the missing-only manifest safely.
