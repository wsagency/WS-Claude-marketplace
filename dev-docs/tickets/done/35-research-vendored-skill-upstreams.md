# Research the skill upstreams and their update signals

Map: extend-ws-to-codex-and-sustain-skills
Label: wayfinder:research
Type: research
Status: resolved
Claimed by: charting session 2026-09-14 (researcher SkillUpstreams, returned)
Blocked by: None — can start immediately.

## Question

Which skill sets in `plugins/ws/skills/` are vendored from an upstream source rather than authored here, and what update signal does each upstream expose? For every vendored set, identify the upstream repository or distribution, the evidence in-repo that ties our copy to a specific upstream revision (version markers, vendoring notes, `ws-repo-maintenance` guidance), the release signal available for change detection (tags, releases, commit feed, package versions), and the licence or attribution constraint that continued vendoring must respect. Name each set that has no detectable upstream signal, since those force manual review cadence.

## Answer

Findings: `dev-docs/research/2026-09-14-skill-upstreams-and-update-signals.md`

Of 31 skill sets, 18 are vendored from exactly two upstreams and 13 are authored here. The vendored sets are the 17 ws-matt skills from `mattpocock/skills` (pin `ed37663`, 2026-07-21, MIT, `LICENSE` kept byte-identical) and `herdr` from `ogulcancelik/herdr` (pin `a979916`, 2026-07-27, Apache-2.0, verbatim). Provenance lives in `plugins/ws/UPSTREAM.md`, `plugins/ws/skills/herdr/UPSTREAM.md`, and dated `dev-docs/maintenance-log.md` audits, because git history is a single squash origin.

No vendored set lacks a machine-checkable signal: both upstreams publish tags, releases, and a commit feed. Both have drifted past our pins — `mattpocock/skills` is at v1.2.3 (2026-08-06, HEAD 2026-09-04) and herdr at v0.9.0 (2026-09-07, HEAD 2026-09-14) — and neither pin corresponds to a published tag, so currency can only be read by diffing `pin..HEAD`, exactly as the documented sync procedure does.

Two facts the cadence decision must absorb: the herdr upstream moved to `herdrdev/herdr`, leaving every in-repo reference stale-but-redirected, and Apache-2.0 notice propagation for the vendored herdr file is currently satisfied in substance without shipping upstream licence text — a posture to confirm or change. Five in-house convention skills (adr, conventional-commits, diataxis, keep-a-changelog, style-guide) track external standards with weaker signals: MADR and Keep a Changelog publish releases, while Conventional Commits and Diátaxis offer only a commit feed and the Google/Microsoft style guides only dated HTML pages.

**Status:** done
