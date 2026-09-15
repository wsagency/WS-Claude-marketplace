# Upstream — herdr agent skill

- Source: https://github.com/herdrdev/herdr (`SKILL.md` at repo root; docs: https://herdr.dev/docs/agent-skill/).
  The repository moved from `ogulcancelik/herdr`; old URLs still redirect, but this is the canonical path.
- License: **Apache-2.0**. `LICENSE` in this directory is the upstream licence
  text, shipped beside the vendored file it covers, as Apache-2.0 section 4(a)
  requires of any redistribution. It governs `SKILL.md` in THIS directory only.
  Three licence scopes coexist under `plugins/ws/` and must not be conflated:
  this directory is Apache-2.0 (herdr upstream); `plugins/ws/LICENSE` is the
  MIT notice of the ws-matt upstream, retained byte-identical for the 17
  vendored ws-matt skills and covering those only; everything WS authored is
  governed by the repository's root `LICENSE` (MIT, (c) WEB Solutions Ltd.), not by
  either vendored notice.
  Upstream ships no `NOTICE` file, so there is none to propagate.
- Modifications: **none**. `SKILL.md` is byte-verbatim upstream apart from the
  conventional trailing newline, which is the section 4(b) change statement in
  full. Any future WS edit to that file must be stated here explicitly.
- The author distributes the skill for exactly this use ("for agents without a
  skill system, paste the file into instructions")
- Pinned commit: `a979916` (master, 2026-07-27)
- Policy: vendored VERBATIM — no WS-local adaptations. This directory holds TWO
  vendored files and a refresh carries both, from the SAME upstream ref (never
  one from `master` and the other from the pin). On refresh
  (ws-repo-maintenance skill, phase 1) fetch:
  - `https://raw.githubusercontent.com/herdrdev/herdr/<ref>/SKILL.md`
  - `https://raw.githubusercontent.com/herdrdev/herdr/<ref>/LICENSE`

  Replace both wholesale, check whether upstream has gained a `NOTICE` file
  (none at pin `a979916`) and vendor it too if it appears, verify both files
  exist here afterwards, then update the pin below. A refresh that replaces
  `SKILL.md` without its `LICENSE` puts the repository back in breach of
  section 4(a).
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
