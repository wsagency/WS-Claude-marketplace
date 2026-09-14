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
- Stale-but-redirected herdr upstream references (`ogulcancelik/herdr` → `herdrdev/herdr`) exist in `UPSTREAM.md`, `ws-repo-maintenance`, and `project-hub-conventions`. Correcting them is `ws-repo-maintenance` work, not this map's; the cadence decision only has to account for identity drift happening at all.

## Decisions so far

<!-- One line per resolved child ticket: linked title plus a one-line gist. -->
- [Research what a third party can ship to Codex](../done/34-research-codex-extension-surface.md) — Codex loads skills, custom subagent TOML, hooks, MCP servers, and experimental `.rules`; plugin marketplaces read the legacy `.claude-plugin/marketplace.json` and `codex plugin marketplace add` accepts GitHub/Git/local/npm, while `AGENTS.md` declares nothing and slash prompts cannot ship from a repo; findings in `dev-docs/research/2026-09-14-codex-extension-surface.md`.
- [Research the skill upstreams and their update signals](../done/35-research-vendored-skill-upstreams.md) — 18 of 31 skill sets are vendored from two upstreams (`mattpocock/skills` pin `ed37663`, `herdr` pin `a979916`); both publish machine-checkable tags/releases, both have drifted past our untagged pins, and the herdr upstream has moved org; findings in `dev-docs/research/2026-09-14-skill-upstreams-and-update-signals.md`.

## Not yet specified

<!-- In-scope fog: questions that cannot be stated sharply until a frontier decision resolves. -->
- Whether recurring skill updates need a tracked upstream manifest in-repo, and where it lives — hangs on the cadence and ownership decision.

## Out of scope

- Implementing Codex packaging, writing sync automation, or cutting any release during this map.
- Changing Claude Code or omp distribution mechanics beyond what a third target strictly requires.
- Redesigning the ws-matt graph node set itself; only how its semantics are carried across harnesses is in scope.
