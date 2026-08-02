---
status: accepted
date: 2026-08-02
decision-makers: Kristijan Lukačin
---

# 0008 — Graph node exits are invocation-aware

A node's exit behavior depends on how it was reached, not on one fixed format:

- **Directly invoked node** — renders a two-or-three-sentence exit report: what landed and where it went, then the single most likely next entry point plus at most one alternative, each a concrete entry point (`/ws-command` or `ws-skill-name`) taken from the node's own declared edges.
- **Nested worker** — returns a state delta only; the calling node decides what to surface, so it emits no prose exit report.
- **Terminal or return-only node** — reports the outcome and stops, since there is no further step to take and no next entry to recommend.
- **Entry reports** choose one likely route plus at most one alternative — never a bullet dump, never "let me know how you'd like to proceed."

Entry → entry stays user-mediated: a node recommends the next entry, it never auto-invokes it — so this extends the existing edge-discipline rule rather than adding a mechanism. The canonical wording lives in exactly two places: `omp-edge-discipline` (a bullet extending the existing entry→entry rule) and the `ws-graph-engineering` skill (part of the node contract); each node skill that has a `## Graph node` section adds only its own routing as a final `- **Exit report:**` bullet, not the format.

This refines the original decision (a fixed 2-3 sentence report on every node) into invocation-aware behavior: directly invoked nodes render the report, nested workers return a state delta, and terminal/return-only nodes report the outcome and stop. Revisit if exit reports start feeling like boilerplate the user skips, or if a node genuinely has no declared next entry.
