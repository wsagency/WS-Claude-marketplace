# Research the skill upstreams and their update signals

Map: sustain-the-ws-matt-skill-set
Label: wayfinder:research
Type: research
Status: resolved
Claimed by: charting session 2026-09-14 (researcher SkillUpstreams, returned)
Blocked by: None — can start immediately.

## Question

Which upstream does the vendored ws-matt skill set track, how is our copy tied to a specific upstream revision, which change-detection signal does that upstream publish, and what licence or attribution constraint does continued vendoring carry? Scope is the ws-matt set, because the decision this unblocks is the recurring ws-matt update cadence; other vendored or convention-tracking skill sets are context only.

## Comments

### Resolution — 2026-09-14

Findings: `dev-docs/research/2026-09-14-skill-upstreams-and-update-signals.md`

The ws-matt set is 17 skills (16 engineering plus `ws-grilling`) vendored from `mattpocock/skills`, pinned at `ed37663` (2026-07-21, MIT), with the rename map, preserve list, and pin policy recorded in `plugins/ws/UPSTREAM.md` and dated audits in `dev-docs/maintenance-log.md`. Git history is a single squash origin, so those files are the durable provenance. The upstream publishes tags, GitHub releases, and a commit feed — all machine-checkable — and has advanced to v1.2.3 (2026-08-06, HEAD 2026-09-04). Our pin corresponds to no published tag, so currency can only be read by diffing `pin..HEAD`, which is exactly what the documented sync procedure does. MIT obligations are satisfied: `plugins/ws/LICENSE` is byte-identical to upstream.

The audit returned two adjacent facts that are load-bearing elsewhere and must not be lost. First, `herdr` is vendored verbatim from an Apache-2.0 upstream while `plugins/ws/` ships no Apache licence text — an **unresolved compliance gap**, not a satisfied posture; it is tracked as `40-ship-herdr-license-and-fix-upstream-refs` and is deliberately outside this map. Second, that upstream has moved to `herdrdev/herdr`, leaving every in-repo reference stale-but-redirected. The five convention skills (adr, conventional-commits, diataxis, keep-a-changelog, style-guide) are in-house distillations carrying no upstream licence burden; their signals range from GitHub releases (MADR, Keep a Changelog) to dated HTML pages only (Google and Microsoft style guides).

**Status:** done
