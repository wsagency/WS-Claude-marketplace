# Extend WS to Codex

Label: wayfinder:map

## Destination

A locked set of decisions covering how the single `ws` plugin surface reaches Codex alongside Claude Code and omp: what travels and what deliberately does not, which channel users install from, what the release gate verifies, and how graph-engineering semantics carry identically across all three harnesses. **The end state is the decision lock itself — nothing here obliges a build.** The decisions may stay unrealized until every one of them has landed; implementation is a later, separate call.

## Notes

- Settled by the grill 2026-09-14: the end state is a decision lock (no build obligation), and this effort is **one of two maps**. The recurring ws-matt update cadence lives in [Sustain the ws-matt skill set](./sustain-the-ws-matt-skill-set.md) because the two efforts have independent purposes and share no blocking edge — that cadence decision is resolvable on its own in a single session, and bundling it here would only make this map's handoff wait on an unrelated answer.
- Originating plan (2026-09-04 session): decide Codex distribution strategy; integrate graph engineering across WS work; chart the decisions on the canonical tracker.
- Planning only: this map resolves decisions and does not implement packaging, automation, or a release.
- Verified 2026-09-04 (primary docs): Codex runs parallel native subagents by default with built-ins `default`, `worker`, and `explorer`; delegation triggers on a direct request **or when `AGENTS.md`/skill instructions ask for it**. Our `## Graph node` fan-out edges can therefore drive Codex delegation directly. The earlier assumption "14 agents collapse into inline workers" is void and must not be re-derived.
- Verified 2026-09-14 by [Research what a third party can ship to Codex](../done/34-research-codex-extension-surface.md): Codex loads skills, custom subagent TOML, hooks, MCP servers, and experimental `.rules`; plugin marketplaces read the **legacy `.claude-plugin/marketplace.json`**. `codex plugin marketplace add` takes a marketplace location — `owner/repo`, a Git URL, or a local path — while `npm` is one of the `source` types (`local | url | git-subdir | npm`) a catalog entry may declare, not a CLI argument. `AGENTS.md` declares no surface, and slash prompts cannot ship from a repo.
- Binding constraints: lockstep versioning across the marketplace (ADR 0002), exactly one shipped plugin (ADR 0003), invocation-aware node exit reports (ADR 0008), and orchestration-layer ownership (ADR 0009).
- The native omp package is generated from `plugins/ws/` by `extensions/omp-ws/scripts/generate.ts`; any third target must keep that single-source property rather than forking the surface. `extensions/omp-ws/scripts/verify-release-artifacts.mjs` is today's release gate and sets the bar a Codex target inherits.
- Consult `ws-graph-engineering`, `project-hub-conventions`, and `dual-track-docs` while resolving tickets.
- Tracker: local Markdown. Child ticket order is the numeric filename prefix.

## Decisions so far

<!-- One line per resolved child ticket: linked title plus a one-line gist. -->
- [Research what a third party can ship to Codex](../done/34-research-codex-extension-surface.md) — Codex loads skills, custom subagent TOML, hooks, MCP servers, and experimental `.rules`; plugin marketplaces read the legacy `.claude-plugin/marketplace.json`, `marketplace add` takes an `owner/repo`, Git URL, or local path, and `npm` is an entry `source` type rather than a CLI argument, while `AGENTS.md` declares nothing and slash prompts cannot ship from a repo; findings in `dev-docs/research/2026-09-14-codex-extension-surface.md`.
- [Decide the Codex distribution channel](../done/36-decide-codex-distribution-channel.md) — a Codex-specific target generated from `plugins/ws/`, listed as a second entry in the existing marketplace catalog under lockstep versioning, carried through git via the committed per-project layer with plugin-bundled assets primary; commands convert to skills, skills travel, enforcement hooks bundle, the three tools become a bundled MCP server, the 14 agents and the TTSR rules do not travel in the first step.

## Not yet specified

<!-- In-scope fog: questions that cannot be stated sharply until a frontier decision resolves. None recorded — every question sharp enough to state is a live ticket, Codex's trust-gated layers included (carried by "Decide the Codex distribution channel"). Fog graduates here as decisions resolve. -->

## Out of scope

- Implementing Codex packaging, writing sync automation, or cutting any release during this map.
- Changing Claude Code or omp distribution mechanics beyond what a third target strictly requires.
- Redesigning the ws-matt graph node set itself; only how its semantics are carried across harnesses is in scope.
- The recurring ws-matt update cadence — sibling map [Sustain the ws-matt skill set](./sustain-the-ws-matt-skill-set.md).
- Closing the herdr Apache-2.0 licence gap and correcting its upstream references — maintenance work tracked in [Ship the herdr Apache-2.0 licence text and correct its upstream references](./40-ship-herdr-license-and-fix-upstream-refs.md).
