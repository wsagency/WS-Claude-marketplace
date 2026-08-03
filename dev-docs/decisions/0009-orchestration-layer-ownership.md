---
status: accepted
date: 2026-08-01
decision-makers: Kristijan Lukačin
---

# 0009 — Orchestration layer ownership

Adopt one scheduling owner per work unit: Herdr may partition top-level lanes,
and one lane may use `task` for disjoint sub-slices, but no layer may schedule
the same unit twice. With `HERDR_ENV=1` and 2+ substantial, independent,
long-lived repo or subsystem lanes, Herdr is the outer backend; otherwise
decomposable work uses one batched same-session `task` call. The canonical
wording lives in the `omp-edge-discipline` rule (binding bullets) and
`ws-graph-engineering` skill (full precedence table), while proactive Herdr
detection remains WS behaviour outside the verbatim vendored `herdr` skill.
Revisit if the substantial-lane trigger misfires in practice, or if omp exposes
a session-mode API that makes an "outer layer already active" check
implementable.
