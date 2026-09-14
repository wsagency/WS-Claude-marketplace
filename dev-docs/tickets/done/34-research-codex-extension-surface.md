# Research what a third party can ship to Codex

Map: extend-ws-to-codex
Label: wayfinder:research
Type: research
Status: resolved
Claimed by: charting session 2026-09-14 (researcher CodexSurface, returned)
Blocked by: None — can start immediately.

## Question

What extension surface does Codex actually load from a third party, and through which exact paths, manifests, and install channels? Establish from primary Codex documentation: whether skills, slash commands, agent definitions, hooks, and MCP servers are each supported; the file/directory layout and any manifest schema that declares them; how `AGENTS.md` relates to that surface; which install channel exists (npm, git, marketplace, manual copy); and what version or compatibility constraints a publisher must respect. Record what is explicitly unsupported, since absence decides how much of the WS surface can travel.

## Comments

### Resolution — 2026-09-14

Findings: `dev-docs/research/2026-09-14-codex-extension-surface.md`

Codex loads five third-party surfaces: skills (`SKILL.md` directories under `.agents/skills` in any repo ancestor, `~/.agents/skills` for the user, plus deprecated `~/.codex/skills` and an admin layer — enumerated in `codex-rs/ext/skills/src/host_roots.rs`), custom subagent definitions (standalone TOML in `~/.codex/agents/` or `.codex/agents/`, requiring `name`/`description`/`developer_instructions`, alongside built-ins `default`, `worker`, `explorer`), lifecycle hooks (`hooks.json` or inline `[hooks]` at user and trusted-project layers, `command` and `mcp_tool` handlers, per-hash trust review), MCP servers (`[mcp_servers.*]` in user/project `config.toml`, STDIO and streamable HTTP, plus plugin-bundled `mcp.json`), and experimental `.rules` Starlark files.

Distribution has a direct path for us: plugin marketplaces read `.agents/plugins/marketplace.json`, the personal `~/.agents/plugins/marketplace.json`, **and the legacy `.claude-plugin/marketplace.json`**. Two things are easy to conflate: `codex plugin marketplace add` takes a marketplace *location* — `owner/repo` (with optional `--ref`/`--sparse`), a Git URL, or a local path — whereas `npm` is one of the `source` types a catalog *entry* may declare (`local | url | git-subdir | npm`); an npm source needs the npm CLI, accepts version ranges or tags rather than paths, and runs no lifecycle scripts. A reviewed universal Plugins Directory exists for public listing (verified developer identity, five positive and three negative test cases, HTTPS-only remote MCP, tool annotations), and enterprise GitHub workspace import is available.

Constraints that bound the distribution decision: `AGENTS.md` is free-form guidance only — it declares no config, skills, hooks, or agents, though its instructions can trigger native subagent delegation (confirming the prior finding). Slash custom prompts are deprecated and user-level only, so they cannot ship from a repo, and no documented mechanism adds native built-in tools. The only concrete version floor documented is Codex 0.138.0+ for managed permission profiles; project `.codex/` layers are trust-gated. Explicitly unstable or removed: `.rules` (experimental), the custom-agent file format ("may evolve"), the app-server protocol (experimental), custom prompts (deprecated), and `codex mcp-server` (removed).

**Status:** done
