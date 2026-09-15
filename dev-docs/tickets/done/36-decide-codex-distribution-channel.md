# Decide the Codex distribution channel

Map: extend-ws-to-codex
Label: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: 34-research-codex-extension-surface

## Question

How does the `ws` surface reach Codex? Three axes are independent and each needs its own answer — a generated artifact can still be published as its own package and installed through a marketplace, so they must not collapse into one choice. The map's standing rule applies throughout: any third target is generated from `plugins/ws/`, never hand-authored beside it.

1. **Artifact shape.** Does Codex consume a surface we already generate as-is, or does the generator emit a Codex-specific target with its own layout? The documented plugin package paths are `skills/`, `mcp.json`, optional `hooks/hooks.json`, and `assets/` — custom subagents are **not** plugin-bundlable, so our 14 agents either translate into skill-invoked instructions, land as `agents/*.toml` that an installer writes at a user or trusted-project layer (axis 3), or deliberately do not travel. Both options stay single-source from `plugins/ws/`; the question is how much shape translation the generator owes Codex, and which parts translate one-to-one.
2. **Distribution and versioning.** Which install channel: a marketplace manifest Codex already reads (`.agents/plugins/marketplace.json`, the personal `~/.agents/plugins/marketplace.json`, or the legacy `.claude-plugin/marketplace.json` this repository already ships), the public universal Plugins Directory for listing, enterprise GitHub workspace import, or manual copy. Two distinct decisions hide inside the marketplace option: the **location** a user adds — `codex plugin marketplace add` takes `owner/repo`, a Git URL, or a local path — and the **`source` type of our entry inside that catalog**, one of `local | url | git-subdir | npm` (an `npm` source needs the npm CLI, takes version ranges or tags rather than paths, and runs no lifecycle scripts). Then settle the version lane: does the target ride the marketplace lockstep version (ADR 0002) or carry its own, the way the native package `@wsagency/omp-ws` already sits at 0.7.0 beside marketplace 5.0.0? ADR 0002 binds the `version` fields inside `marketplace.json` and names that file the single version authority, so an independently published package needs no amendment — only a design that moves or duplicates that authority would.
3. **Carrier layer.** Assets the plugin bundles itself (installed plugins cache under `~/.codex/plugins/cache/...`), the repository's trusted project layer (`.codex/` paths — `config.toml`, `hooks.json`, `agents/`), or user-level paths an installer places (`~/.agents/skills`, `~/.codex/agents/`). Compare them on what the user must opt into, keeping the two trust gates separate: **project trust** gates the repository's `.codex/` layer entirely, while **per-hash hook trust** applies to every non-managed hook including plugin-bundled ones — so bundling does not make hooks trust-free. Settle what silently stops working when either gate is withheld.

Then settle which parts of the surface (commands, skills, agents, hooks, tools) deliberately do not travel — noting that slash prompts cannot ship from a repository at all, and that `AGENTS.md` declares no surface even though its instructions can trigger native subagent delegation.

The release gate for that target is owned by [Decide the Codex release gate and absence verification](./39-decide-codex-release-gate-and-absence.md), which consumes the channel and asset facts this ticket settles; do not decide it here.

## Comments

### Grill note — 2026-09-14 (partial, ticket still open)

**Axis 1 — artifact shape: settled.** The generator emits a **Codex-specific target** from `plugins/ws/`, rather than handing Codex a surface we already generate as-is. Single-source generation is preserved.

**Axis 2 — distribution: settled in part, one sub-decision left.** The catalog is the marketplace manifest Codex already reads, and the target rides marketplace lockstep versioning (ADR 0002) rather than a separate lane. **Caveat that must be resolved before this axis closes:** reusing the same catalog FILE does not mean reusing the same catalog ENTRY. The present entry resolves `source: ./plugins/ws`, which cannot deliver a Codex-specific generated target unchanged — so the manifest needs a distinct entry (or source) pointing at the generated Codex output. Either add that entry, or axis 1 collapses back to "consume `plugins/ws/` as-is"; the two cannot both stand as written.

**Axis 3 — carrier layer: settled.** Plugin-bundled assets are the primary carrier, and the design must ALSO let the plugin travel through git: a per-project override is available for everything, so a developer who clones the repository gets the plugin with it rather than having to install it separately. Consequence to carry into the design, not a reopening: the repository-committed project layer lives under `.codex/`, which Codex gates on per-project trust, and hooks require per-hash trust wherever they live — including plugin-bundled ones. So "shipped through git" means present-on-clone, not active-without-consent.

Still open, and NOT to be inferred — the surface matrix, one ruling per surface (translate versus deliberately omit):

- **Commands** — Codex cannot ship repository slash prompts at all. Convert the seven commands into skills, or omit them and let skills carry the behaviour?
- **Skills** — travel natively; confirm all 30 travel, or name exclusions.
- **Hooks** — each hook: travel as a plugin-bundled hook (per-hash trust), or omit?
- **Native tools** (`ws_ticket`, `ws_changelog`, `ws_adr`) — omit, or replace with a bundled MCP server?
- **Agents** — the 14 agents cannot be plugin-bundled; translate into skill-invoked instructions, have an installer write `agents/*.toml` at a user or trusted-project layer, or omit in the first step?

### Resolution — 2026-09-15 (surface matrix decided by the agent, at the user's direction)

The three axes were settled by the user; the per-surface matrix was delegated. Rulings, each with the reason it beats the alternative:

**Catalog entry (the axis-2 caveat).** The existing `.claude-plugin/marketplace.json` is reused as the catalog FILE, with a **second entry** whose source resolves the generated Codex target. The current entry keeps resolving `./plugins/ws` for Claude Code; one entry cannot serve both, and adding an entry is cheaper than a second catalog or a separate registry.

**Commands (7) — converted to skills, not omitted.** Codex cannot ship repository slash prompts at all, and the seven commands ARE the product surface, so omitting them would gut the target. They are already prose-driven flows, so each generates as a skill under the same name (`ws-setup`, `ws-docs`, `ws-commit`, `ws-hub`, `ws-help`, `ws-matt`, `ws-status`); no name collides with the existing 30. Consequence to document: on Codex these are invoked by name in conversation, not with a slash.

**Skills — all travel, minus the exclusion the omp target already applies.** They are Codex's native unit and need no translation. The source-checkout maintenance workflow stays excluded exactly as it is for omp; the spec verifies that exclusion list rather than restating a count.

**Hooks — travel as plugin-bundled `hooks/hooks.json`, enforcement first.** The dangerous-git guard and the changelog gate are required, because they are the enforcement the suite exists for; the Jira dashboard is optional and may land later. Per-hash trust applies to every non-managed hook including bundled ones, so the spec states what degrades when trust is withheld rather than assuming silent coverage. Mapping each WS hook to a Codex lifecycle event is mechanical spec work, not a further decision.

**Native tools (`ws_ticket`, `ws_changelog`, `ws_adr`) — bundled MCP server.** Codex documents no way to add native built-in tools, but a plugin may bundle MCP servers through `mcp.json`, and these three are thin wrappers over file conventions, which is exactly what an MCP server carries well. Omission was the alternative and remains the fallback if the effort proves disproportionate: the tools are optional conveniences by design, and the prose conventions stay authoritative either way.

**Agents (14) — do not travel in the first step.** They cannot be plugin-bundled at all: custom subagents load only from `~/.codex/agents/` or a trusted project `.codex/agents/`, and the format is documented as liable to evolve. Codex already runs native `default`/`worker`/`explorer` subagents and delegates when `AGENTS.md` or skill instructions ask, so the `## Graph node` fan-out edges drive delegation directly. Having an installer write TOML into a trust-gated layer buys little and couples us to an unstable format.

**Rules — not as Codex `.rules`.** That mechanism is documented experimental. The always-apply content (edge discipline, English artifacts, git guard) is delivered through the committed per-project layer instead, which is also what carries the plugin through git per the axis-3 decision.

**Status:** done
