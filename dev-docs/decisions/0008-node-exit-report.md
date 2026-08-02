---
status: accepted
date: 2026-08-02
decision-makers: Kristijan Lukačin
---

# 0008 — Graph nodes end with a 2-3 sentence exit report

Every graph node ends its run by telling the user, in two or three sentences,
what landed and where it went, then the single most likely next move plus one
alternative — each a concrete entry point (`/ws-command` or `ws-skill-name`)
taken from the node's own declared edges. Never a bullet dump, never "let me
know how you'd like to proceed." The canonical wording lives in exactly two
places: `omp-edge-discipline` (a new bullet extending the existing entry→entry
rule) and the `ws-graph-engineering` skill (part of the node contract); each
node skill that has a `## Graph node` section adds only its own routing as a
final `- **Exit report:**` bullet, not the format. Entry → entry stays
user-mediated: a node recommends the next entry, it never auto-invokes it — so
this extends the existing edge-discipline rule rather than adding a mechanism.
Revisit if exit reports start feeling like boilerplate the user skips, or if a
node genuinely has no declared next entry.
