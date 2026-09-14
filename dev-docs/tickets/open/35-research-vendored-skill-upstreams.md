# Research the skill upstreams and their update signals

Map: extend-ws-to-codex-and-sustain-skills
Label: wayfinder:research
Type: research
Status: ready-for-agent
Claimed by: charting session 2026-09-14 (researcher SkillUpstreams)
Blocked by: None — can start immediately.

## Question

Which skill sets in `plugins/ws/skills/` are vendored from an upstream source rather than authored here, and what update signal does each upstream expose? For every vendored set, identify the upstream repository or distribution, the evidence in-repo that ties our copy to a specific upstream revision (version markers, vendoring notes, `ws-repo-maintenance` guidance), the release signal available for change detection (tags, releases, commit feed, package versions), and the licence or attribution constraint that continued vendoring must respect. Name each set that has no detectable upstream signal, since those force manual review cadence.
