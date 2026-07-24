---
name: ws-resolving-merge-conflicts
description: "Use when you need to resolve an in-progress git merge/rebase conflict."
---

1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check original issues/tickets.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

4. Discover the project's **automated checks** and run them — typically typecheck, then tests, then format. Fix anything the merge broke.

5. **Finish the merge/rebase.** Stage everything and commit. If rebasing, continue the rebase process until all commits are rebased.

## Graph node

- **Tier:** model-invoked (worker)
- **Reads:** the in-progress merge/rebase state; every conflicting hunk; each side's primary sources — commit messages, PRs, original issues/tickets
- **Emits:** every hunk resolved by intent (both intents preserved where possible, trade-offs noted, no invented behaviour); the project's automated checks green; the merge or rebase finished — never `--abort`
- **Edges:**
  - then → discover and run the project's automated checks (typecheck, then tests, then format) and fix what the merge broke
  - then → done: staged, committed, and any rebase continued to completion (terminal worker — no outward skill edges)
- **Handoff protocol:** the resolution is the merge commit itself; note non-obvious intent trade-offs in the commit message (DONE|{merge commit}).
