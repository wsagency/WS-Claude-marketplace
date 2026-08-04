---
name: ws-resolving-merge-conflicts
description: "Use when you need to resolve an in-progress git merge/rebase conflict."
---

1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check original issues/tickets.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Resolve every hunk you can without inventing behaviour; never `--abort`. If a hunk cannot be resolved without inventing behaviour, stop — do not commit, leave the merge in progress, and return the blocked hunks to the caller (the Graph node's blocked edge).

4. Discover the project's **automated checks** and run them — typically typecheck, then tests, then format. Fix anything the merge broke. If a check the merge broke cannot be made green without inventing behaviour the merge's stated goal does not justify, do not commit — leave the merge in progress and return the failing checks to the caller (the blocked edge). A check that was already red before the merge is not this node's to fix: record it and do not let it block the commit.

5. **Finish the merge/rebase** only when every hunk is resolved and no check the merge broke is still failing: stage everything and commit. If rebasing, continue the rebase process until all commits are rebased. If a hunk is blocked or the merge broke a check you cannot fix, do not commit — follow the blocked edge and leave the merge in progress (never `--abort`).

## Graph node

- **Tier:** model-invoked (worker)
- **Reads:** the in-progress merge/rebase state; every conflicting hunk; each side's primary sources — commit messages, PRs, original issues/tickets
- **Emits:** every hunk resolved by intent (both intents preserved where possible, trade-offs noted, no invented behaviour); the checks the merge broke green (a check already red before the merge is recorded, not fixed); the merge or rebase finished — never `--abort`. Where a hunk cannot be resolved without inventing behaviour, or a check the merge broke cannot be made green, this node emits neither a green-checks commit nor an `--abort`: it leaves the merge in progress and returns the blocked hunks / failing checks to the caller (blocked edge).
- **Edges:**
  - then → discover and run the project's automated checks (typecheck, then tests, then format) and fix what the merge broke
  - then → done: staged, committed, and any rebase continued to completion, only when every hunk is resolved and no check the merge broke is still failing (terminal worker — no outward skill edges)
  - when a hunk cannot be resolved without inventing behaviour, or a check the merge broke cannot be made green → stop, leave the merge in progress (never `--abort`), and return the blocked hunks and failing checks to the caller — do not commit red and do not `--abort`
- **Handoff protocol:** the resolution is the merge commit itself; note non-obvious intent trade-offs in the commit message (DONE|{merge commit}). When blocked, there is no commit — return `DONE|BLOCKED|{blocked hunks / failing checks}` instead and leave the merge in progress.
- **Exit report:** terminal after the already-created merge/rebase commit — as a worker it returns `DONE|{merge commit}` to its caller (the resolution IS the commit, step 5) when no check the merge broke is still failing, or `DONE|BLOCKED|{blocked hunks / failing checks}` when a hunk cannot be resolved without inventing behaviour or a check the merge broke cannot be made green (leave the merge in progress, never `--abort`); report the outcome and stop. Do not recommend another commit or an undeclared review route. (Format: `ws-graph-engineering`.)
