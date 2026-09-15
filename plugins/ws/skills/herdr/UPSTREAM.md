# Upstream — herdr agent skill

- Source: https://github.com/herdrdev/herdr (`SKILL.md` at repo root; docs: https://herdr.dev/docs/agent-skill/).
  The repository moved from `ogulcancelik/herdr`; old URLs still redirect, but this is the canonical path.
- License: **Apache-2.0**. `LICENSE` in this directory is the upstream licence
  text, shipped beside the vendored file it covers, as Apache-2.0 section 4(a)
  requires of any redistribution. It governs `SKILL.md` in this directory only;
  the rest of `plugins/ws/` is MIT (see `plugins/ws/LICENSE`). Upstream ships no
  `NOTICE` file, so there is none to propagate.
- Modifications: **none**. `SKILL.md` is byte-verbatim upstream apart from the
  conventional trailing newline, which is the section 4(b) change statement in
  full. Any future WS edit to that file must be stated here explicitly.
- The author distributes the skill for exactly this use ("for agents without a
  skill system, paste the file into instructions")
- Pinned commit: `a979916` (master, 2026-07-27)
- Policy: vendored VERBATIM — no WS-local adaptations. Refreshing replaces
  `SKILL.md` wholesale AND re-fetches `LICENSE` from the same pin. On refresh
  (ws-repo-maintenance skill, phase 1): fetch
  `https://raw.githubusercontent.com/herdrdev/herdr/master/SKILL.md`,
  replace `SKILL.md` wholesale, update the pin here.
- Shipping the skill in the ws plugin makes it available in every WS project
  (Claude Code and omp); the global `npx skills add herdrdev/herdr
  --skill herdr -g` install remains only for machines WITHOUT the plugin.
  The skill self-guards with `HERDR_ENV=1`, so it is inert outside
  herdr-managed panes.

## WS wrapper policy

- `SKILL.md` stays verbatim and is replaced wholesale on sync (see the pin and
  policy above); WS-specific proactive behaviour lives OUTSIDE this directory so
  a sync can never clobber it.
- Where WS behaviour lives: when to reach for Herdr, the director/worker prompt
  stamp, and worktrees for parallel edits are defined in the `omp-edge-discipline`
  rule, the `ws-graph-engineering` skill, and the SessionStart discipline hook.
- When the Herdr-director row fires, the binding WS rule explicitly authorizes
  loading this vendored skill for its CLI contract. The upstream description
  remains the guard against unrelated implicit self-selection.
- A syncer MUST NOT port those behaviours into `SKILL.md` — doing so would be
  silently overwritten on the next wholesale refresh.
