# Prototype the first-run and re-run setup experience

Map: unify-ws-setup-entrypoints
Label: wayfinder:prototype
Type: prototype
Status: resolved
Blocked by: 01-define-unified-setup-state-machine, 02-define-tracker-and-jira-ownership, 03-define-optional-docs-bootstrap-boundary

## Question

What concrete prompt sequence, defaults, summaries, and recovery messages make `/ws-setup` understandable on first run and safe on re-run across standalone repos, hub roots, hub sub-repos, Claude Code, omp, optional Jira, and existing customized configuration?

## Answer

The validated UX is discovery-driven rather than a fixed wizard:

1. Show a compact detection summary first: project shape and scope, git/origin, canonical and legacy configuration, tracker/Jira readiness, runtime state, and documentation state.
2. Ask only unresolved decisions. On a new standalone repository the normal sequence is primary tracker (Local recommended), conditional Jira synchronization after Local, and optional full documentation bootstrap (recommended). Do not ask about values already established by valid canonical configuration.
3. Validate every choice without writing.
4. Show one complete categorized plan: `CREATE`, `UPDATE`, `PRESERVE`, `SKIP`, `NO-OP`, and any blocking conflicts, including the full docs manifest and exact scope.
5. Obtain one final confirmation, apply the ordered phases, verify them, and report every written, preserved, skipped, pending, and failed path.

An aligned re-run prints the discovered state and `No changes required`; it shows neither decision prompts nor a write confirmation. Reconfiguration requires an explicit user request. A conflicting re-run asks only about the concrete conflict, preserves `.wsagency/config.yaml` until the user decides, and then shows the minimal resulting diff.

At a hub root, the summary names eligible `type: working` repositories, excluded input/output repositories, and product-level targets before asking for hub defaults or docs sweep. In a hub sub-repository, it states that scope is the current repository and names hub-owned product targets that remain untouched.

Outside a git repository, the first screen explains the blocker and offers repository creation or a clean stop. A validated origin URL is required before `git init` and `git remote add origin` may enter the final plan.

After a partial failure, the next run reports completed and pending phases, preserves completed/customized artifacts, and plans only the missing work. The message explicitly states that no rollback occurred.

## Prototype evidence

The interactive prototype covers standalone first run, hub-root first run, hub sub-repository first run, aligned re-run, conflicting legacy re-run, outside-git setup, and resume after a docs failure. All seven scenarios completed through the same state model and preserved the single-confirmation boundary.

Primary source: branch `prototype/ws-setup-ux`, commit `47a8593` (`extensions/omp-ws/prototypes/setup-ux/`). The prototype is intentionally absent from `main`.
