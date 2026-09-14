# Extend WS to Codex and sustain its skill surface

Label: wayfinder:map
Status: draft — the destination and frontier below are derived from the preserved 2026-09-04 plan, NOT yet settled by the charting grill (steps 1-2). Do not start a work-through session until that grill has run and this map has been revised.

## Destination

A locked set of decisions — ready to hand to `/ws-to-spec` — covering how the single `ws` plugin surface reaches Codex alongside Claude Code and omp, how the vendored ws-matt skill set stays current on a recurring cadence with named ownership, and how graph-engineering semantics are carried across every harness. Decisions only; no packaging, automation, or release work inside this map.

**Unsettled:** this wording is a draft derived from the four preserved plan items. The grill must confirm or redraw it — in particular whether Codex distribution and skill-update cadence belong to one effort at all, and whether "ready to hand to `/ws-to-spec`" is the right end state.

## Notes

- Planning only: this map resolves decisions and hands a clear route to specification; it does not implement distribution or write sync automation.
- Originating plan (2026-09-04 session, four items): decide Codex distribution strategy; design recurring Matt skill updates; integrate graph engineering across WS work; chart the decisions on the canonical tracker. Ticket scope stays inside those items.
- Verified 2026-09-04 (prior session, primary docs): Codex runs parallel native subagents by default with built-ins `default`, `worker`, and `explorer`; delegation triggers on a direct request **or when `AGENTS.md`/skill instructions ask for it**. Our `## Graph node` fan-out edges can therefore drive Codex delegation directly. The earlier assumption "14 agents collapse into inline workers" is void and must not be re-derived.
- Binding constraints: lockstep versioning across the marketplace (ADR 0002), exactly one shipped plugin (ADR 0003), invocation-aware node exit reports (ADR 0008), and orchestration-layer ownership (ADR 0009).
- The native omp package is generated from `plugins/ws/` by `extensions/omp-ws/scripts/generate.ts`; any third target must keep that single-source property rather than forking the surface.
- Installed-artifact verification (`extensions/omp-ws/scripts/verify-release-artifacts.mjs`) is the release gate today; a third target inherits that bar.
- Consult `ws-graph-engineering`, `ws-repo-maintenance`, `project-hub-conventions`, and `dual-track-docs` while resolving tickets.
- Tracker: local Markdown. Child ticket order is the numeric filename prefix.
- The `herdr` skill is vendored verbatim from an Apache-2.0 upstream while `plugins/ws/` ships no Apache licence text — an unresolved compliance gap — and that upstream has moved to `herdrdev/herdr`, leaving in-repo references stale-but-redirected. Both are tracked outside this map in `40-ship-herdr-license-and-fix-upstream-refs`; the cadence decision only has to account for upstream identity drift happening at all.

## Decisions so far

<!-- One line per resolved child ticket: linked title plus a one-line gist. -->
- [Research what a third party can ship to Codex](../done/34-research-codex-extension-surface.md) — Codex loads skills, custom subagent TOML, hooks, MCP servers, and experimental `.rules`; plugin marketplaces read the legacy `.claude-plugin/marketplace.json` and `codex plugin marketplace add` accepts GitHub/Git/local/npm, while `AGENTS.md` declares nothing and slash prompts cannot ship from a repo; findings in `dev-docs/research/2026-09-14-codex-extension-surface.md`.
- [Research the skill upstreams and their update signals](../done/35-research-vendored-skill-upstreams.md) — the ws-matt set (17 skills) is pinned at `ed37663` against `mattpocock/skills`, whose tags and releases are machine-checkable and have advanced to v1.2.3; the pin matches no published tag, so currency needs a `pin..HEAD` diff. MIT obligations are met. Incidental findings on `herdr` and the convention skills are recorded in the ticket and routed to ticket 40; findings in `dev-docs/research/2026-09-14-skill-upstreams-and-update-signals.md`.

## Not yet specified

<!-- In-scope fog: questions that cannot be stated sharply until a frontier decision resolves. -->
- Whether recurring ws-matt updates need a tracked upstream manifest in-repo, and where it lives — hangs on the cadence and ownership decision.

## Out of scope

- Implementing Codex packaging, writing sync automation, or cutting any release during this map.
- Changing Claude Code or omp distribution mechanics beyond what a third target strictly requires.
- Redesigning the ws-matt graph node set itself; only how its semantics are carried across harnesses is in scope.
- Extending the recurring-update mechanism beyond the ws-matt set (`herdr`, the convention-tracking skills) — the originating plan named Matt skills only; the signals are recorded in the findings if that scope is ever redrawn.
- Closing the herdr Apache-2.0 licence gap and correcting its upstream references — maintenance work tracked in `40-ship-herdr-license-and-fix-upstream-refs`.
