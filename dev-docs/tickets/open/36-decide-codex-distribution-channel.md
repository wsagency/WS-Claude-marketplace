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
