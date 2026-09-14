# Extend WS to Codex and sustain its skill surface

Label: wayfinder:map

## Destination

A locked set of decisions — ready to hand to `/ws-to-spec` — covering how the single `ws` plugin surface reaches Codex alongside Claude Code and omp, how vendored and in-house skill sets stay current on a recurring cadence with named ownership, and how graph-engineering semantics are carried across every harness. Decisions only; no packaging, automation, or release work inside this map.

## Notes

- Planning only: this map resolves decisions and hands a clear route to specification; it does not implement distribution or write sync automation.
- Verified 2026-09-04 (prior session, primary docs): Codex runs parallel native subagents by default with built-ins `default`, `worker`, and `explorer`; delegation triggers on a direct request **or when `AGENTS.md`/skill instructions ask for it**. Our `## Graph node` fan-out edges can therefore drive Codex delegation directly. The earlier assumption "14 agents collapse into inline workers" is void and must not be re-derived.
- Binding constraints: lockstep versioning across the marketplace (ADR 0002), exactly one shipped plugin (ADR 0003), invocation-aware node exit reports (ADR 0008), and orchestration-layer ownership (ADR 0009).
- The native omp package is generated from `plugins/ws/` by `extensions/omp-ws/scripts/generate.ts`; any third target must keep that single-source property rather than forking the surface.
- Installed-artifact verification (`extensions/omp-ws/scripts/verify-release-artifacts.mjs`) is the release gate today; a third target inherits that bar.
- Consult `ws-graph-engineering`, `ws-repo-maintenance`, `project-hub-conventions`, and `dual-track-docs` while resolving tickets.
- Tracker: local Markdown. Child ticket order is the numeric filename prefix.

## Decisions so far

<!-- One line per resolved child ticket: linked title plus a one-line gist. -->

## Not yet specified

<!-- In-scope fog: questions that cannot be stated sharply until a frontier decision resolves. -->
- Whether a Codex target needs its own version lane or joins marketplace lockstep — hangs on the distribution-channel decision.
- How installed-surface verification extends to a Codex target, and what its absence gates are — hangs on what Codex can actually load.
- Whether recurring skill updates need a tracked upstream manifest in-repo, and where it lives — hangs on the cadence and ownership decision.

## Out of scope

- Implementing Codex packaging, writing sync automation, or cutting any release during this map.
- Changing Claude Code or omp distribution mechanics beyond what a third target strictly requires.
- Redesigning the ws-matt graph node set itself; only how its semantics are carried across harnesses is in scope.
