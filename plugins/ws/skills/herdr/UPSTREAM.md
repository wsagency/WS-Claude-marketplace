# Upstream — herdr agent skill

- Source: https://github.com/ogulcancelik/herdr (`SKILL.md` at repo root; docs: https://herdr.dev/docs/agent-skill/)
- License-bearing repo; skill distributed by the author for exactly this use
  ("for agents without a skill system, paste the file into instructions")
- Pinned commit: `a979916` (master, 2026-07-27)
- Policy: vendored VERBATIM — no WS-local adaptations. On refresh
  (ws-repo-maintenance skill, phase 1): fetch
  `https://raw.githubusercontent.com/ogulcancelik/herdr/master/SKILL.md`,
  replace `SKILL.md` wholesale, update the pin here.
- Shipping the skill in the ws plugin makes it available in every WS project
  (Claude Code and omp); the global `npx skills add ogulcancelik/herdr
  --skill herdr -g` install remains only for machines WITHOUT the plugin.
  The skill self-guards with `HERDR_ENV=1`, so it is inert outside
  herdr-managed panes.
