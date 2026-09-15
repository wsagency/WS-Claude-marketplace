# Ship the herdr Apache-2.0 licence text and correct its upstream references

Label: maintenance
Status: ready-for-agent
Blocked by: None — can start immediately.
Scheduled: next work set (user, 2026-09-14).

**What to build:** The vendored `herdr` skill redistributes an Apache-2.0 licensed file while `plugins/ws/` carries only the MIT `LICENSE` of the ws-matt upstream, so the repository currently redistributes Apache-2.0 work without the licence text that Apache-2.0 section 4 requires. Close that gap and correct the upstream identity that moved out from under our references.

- [ ] `plugins/ws/skills/herdr/` ships the upstream Apache-2.0 licence text (and `NOTICE`, if upstream carries one) alongside the vendored `SKILL.md`, placed so it is unambiguous that it covers the herdr file and not the MIT-licensed ws-matt content.
- [ ] `plugins/ws/skills/herdr/UPSTREAM.md` states the licence, the pin, and any WS modifications (currently none — the file is verbatim), satisfying the change-stating requirement explicitly rather than by implication.
- [ ] Every in-repo reference to `ogulcancelik/herdr` is updated to `herdrdev/herdr` — at minimum `plugins/ws/skills/herdr/UPSTREAM.md` (source and raw fetch URLs), `plugins/ws/skills/ws-repo-maintenance/SKILL.md`, and `plugins/ws/skills/project-hub-conventions/SKILL.md` (`npx skills add` command) — with the redirect noted rather than relied upon.
- [ ] The native omp package is regenerated from the clean commit so the packaged copy carries the same licence text, and the release-manifest parity check still passes.
- [ ] `dev-docs/maintenance-log.md` records the audit: the gap found, the pin state at the time, and what was applied.

Evidence: `dev-docs/research/2026-09-14-skill-upstreams-and-update-signals.md` (herdr section — Apache-2.0 upstream, verbatim vendoring, no licence text shipped, org move verified 2026-09-14).
