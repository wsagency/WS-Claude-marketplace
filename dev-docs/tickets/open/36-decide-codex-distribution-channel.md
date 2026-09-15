# Decide the Codex distribution channel

Map: extend-ws-to-codex
Label: wayfinder:grilling
Type: grilling
Status: ready-for-human
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
