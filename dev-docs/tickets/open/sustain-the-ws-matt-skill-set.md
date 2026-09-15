# Sustain the ws-matt skill set

Label: wayfinder:map

## Destination

A locked decision for the recurring process that keeps the vendored ws-matt skill set current: what triggers a refresh, who owns it, how an upstream change is reviewed before it lands, how the documented WS adaptations survive, and what state the repository tracks so the process is resumable rather than remembered. **The end state is the decision lock itself — nothing here obliges a build.** Running the first refresh is a later, separate call.

## Notes

- Settled by the grill 2026-09-14: the end state is a decision lock (no build obligation), and this is one of two maps. The Codex distribution effort is the sibling map [Extend WS to Codex](./extend-ws-to-codex.md). The split exists because the two efforts have independent purposes and share no blocking edge; this one is small and resolvable in a single session, so it does not need to travel with the Codex branch.
- Originating plan (2026-09-04 session): design recurring Matt skill updates.
- Planning only: this map decides the process; it does not perform a refresh or write automation.
- Verified 2026-09-14 by [Research the skill upstreams and their update signals](../done/35-research-vendored-skill-upstreams.md): the ws-matt set is 17 skills vendored from `mattpocock/skills` at pin `ed37663` (2026-07-21, MIT, `plugins/ws/LICENSE` byte-identical, obligations met). The upstream publishes machine-checkable tags, releases, and a commit feed, and has advanced to v1.2.3 (2026-08-06, HEAD 2026-09-04). Our pin matches no published tag, so currency can only be read by diffing `pin..HEAD`.
- Provenance is carried by `plugins/ws/UPSTREAM.md` (source, pin, rename map, preserve list, pin policy), `plugins/ws/skills/ws-repo-maintenance/SKILL.md` (gate sequence and refresh procedure), and dated audits in `dev-docs/maintenance-log.md` — git history is a single squash origin and proves nothing about provenance.
- Scope is the ws-matt set named in the originating plan. `herdr` and the convention-tracking skills (adr, conventional-commits, diataxis, keep-a-changelog, style-guide) are out of scope; their signals are recorded in the findings if that scope is ever redrawn.
- Consult `ws-repo-maintenance` and `keep-a-changelog` while resolving tickets.
- Tracker: local Markdown. Child ticket order is the numeric filename prefix.

## Decisions so far

<!-- One line per resolved child ticket: linked title plus a one-line gist. -->
- [Research the skill upstreams and their update signals](../done/35-research-vendored-skill-upstreams.md) — the ws-matt set (17 skills) is pinned at `ed37663` against `mattpocock/skills`, whose tags and releases are machine-checkable and have advanced to v1.2.3; the pin matches no published tag, so currency needs a `pin..HEAD` diff, and MIT obligations are met; findings in `dev-docs/research/2026-09-14-skill-upstreams-and-update-signals.md`.
- [Decide the recurring ws-matt skill update cadence and ownership](../done/37-decide-skill-update-cadence-and-ownership.md) — no standing cadence: detection only (Gates 0-2 plus a log entry) at the start of new-release development on a clean HEAD, owned by that release's developer; a contentful or inventory delta becomes its own ticket and never expands the release, new upstream skills stay out until an eval capability exists, and the maintenance log plus the `UPSTREAM.md` pin are the whole durable state.

## Not yet specified

<!-- In-scope fog: questions that cannot be stated sharply until a frontier decision resolves. None recorded — the repository-state question (whether a tracked upstream manifest is needed, and where it lives) is already inside "Decide the recurring ws-matt skill update cadence and ownership". Fog graduates here as that decision resolves. -->

## Out of scope

- Performing an actual ws-matt refresh, bumping the pin, or writing sync automation during this map.
- Extending the mechanism to `herdr` or the convention-tracking skills.
- Closing the herdr Apache-2.0 licence gap and correcting its upstream references — maintenance work tracked in [Ship the herdr Apache-2.0 licence text and correct its upstream references](./40-ship-herdr-license-and-fix-upstream-refs.md).
