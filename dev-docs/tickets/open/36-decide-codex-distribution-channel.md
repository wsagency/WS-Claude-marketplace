# Decide the Codex distribution channel

Map: extend-ws-to-codex
Label: wayfinder:grilling
Type: grilling
Status: ready-for-human
Blocked by: 34-research-codex-extension-surface

## Question

How does the `ws` surface reach Codex? Three axes are independent and each needs its own answer — a generated artifact can still be published as its own package and installed through a marketplace, so they must not collapse into one choice. The map's standing rule applies throughout: any third target is generated from `plugins/ws/`, never hand-authored beside it.

1. **Artifact shape.** Does Codex consume a surface we already generate as-is, or does the generator emit a Codex-specific target with its own layout (plugin-bundled `skills/`, `hooks/hooks.json`, `mcp.json`, `agents/*.toml`)? Both remain single-source from `plugins/ws/`; the question is only how much shape translation the generator owes Codex, and which parts translate one-to-one.
2. **Distribution and versioning.** Which install channel: a marketplace manifest Codex already reads (`.agents/plugins/marketplace.json`, or the legacy `.claude-plugin/marketplace.json` this repository already ships), `codex plugin marketplace add` against a GitHub, Git, local, or npm source, the reviewed universal Plugins Directory for public listing, enterprise GitHub workspace import, or manual copy. Then settle whether the target rides the marketplace lockstep version (ADR 0002) or needs a separately published package with its own lane — and if the latter, that ADR needs amending rather than bending.
3. **Carrier layer.** Assets the plugin bundles itself (cached under `~/.codex/plugins`), the repository's trusted project layer (`.codex/` paths gated by per-project trust and per-hash hook review), or user-level paths an installer places (`~/.agents/skills`, `~/.codex/agents/`). Compare them on what the user must opt into and what silently stops working when trust is withheld.

Then settle which parts of the surface (commands, skills, agents, hooks, tools) deliberately do not travel — noting that slash prompts cannot ship from a repository at all, and that `AGENTS.md` declares no surface even though its instructions can trigger native subagent delegation.

The release gate for that target is owned by [Decide the Codex release gate and absence verification](./39-decide-codex-release-gate-and-absence.md), which consumes the channel and asset facts this ticket settles; do not decide it here.
