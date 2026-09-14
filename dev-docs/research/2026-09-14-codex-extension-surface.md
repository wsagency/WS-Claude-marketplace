# Codex extension surface for third parties — what Codex loads, from where, and how it ships

Ticket: `dev-docs/tickets/done/34-research-codex-extension-surface.md` (map: extend-ws-to-codex).
Researched 2026-09-14 against official OpenAI/Codex documentation (learn.chatgpt.com / developers.openai.com) and the `openai/codex` source repository. Repo paths like `codex-rs/ext/skills/src/host_roots.rs` refer to `https://github.com/openai/codex` at `main`.

## Summary

1. **Skills: supported** — a directory with `SKILL.md` (`name` + `description` front matter, optional `agents/openai.yaml` metadata), discovered in repo, user, admin, and system scopes. Skills are the primary repo-checkin-able surface.
2. **Agent definitions: supported** — custom agents are standalone TOML files in `~/.codex/agents/` (user) or `.codex/agents/` (project) requiring `name`, `description`, `developer_instructions`; built-ins are `default`, `worker`, `explorer`. Subagents run by default; delegation fires on direct request or when `AGENTS.md`/skill instructions request it (confirms the prior verified finding).
3. **Hooks: supported** — `hooks.json` or inline `[hooks]` in `config.toml` at user (`~/.codex/`) and project (`.codex/`, trusted projects only) layers, plus plugin-bundled `hooks/hooks.json`; command and `mcp_tool` handlers are supported, `prompt`/`agent` handlers are parsed but skipped; non-managed hooks require explicit per-hash user trust.
4. **MCP servers: supported** — `[mcp_servers.<name>]` in `~/.codex/config.toml` (user) or `.codex/config.toml` (project, trusted only); STDIO and streamable-HTTP transports; plugins can bundle MCP servers via `mcp.json`.
5. **Slash/custom commands: deprecated** — custom prompts are user-level-only `~/.codex/prompts/*.md` invoked as `/prompts:<name>`; docs say "Deprecated. Use skills." They cannot be shipped from a repo. No mechanism is documented for third parties to add native built-in tools; MCP tools, hook scripts, and skill scripts are the tool surfaces (inference from documented absence).
6. **Distribution channels**: manual copy/git clone into the well-known directories; plugin marketplaces (repo `.agents/plugins/marketplace.json`, personal `~/.agents/plugins/marketplace.json`, legacy `.claude-plugin/marketplace.json`; `codex plugin marketplace add` supports GitHub/Git/local paths; npm-sourced plugin packages run no lifecycle scripts); the public universal Plugins Directory (submission portal with review, verified publisher identity, test cases); enterprise GitHub workspace import; `$skill-installer` for curated skills. `.codex/` surfaces are gated on project trust; `.agents/` skill discovery is not.
7. **Constraints**: the only documented version floor is that managed permission-profile requirements need Codex ≥ 0.138.0 (≤ 0.137.0 ignores them). Explicitly unstable/removed: `.rules` files ("Rules are experimental and may change"), the custom-agent file format ("may evolve"), the app-server protocol (experimental, not for production), custom prompts (deprecated), `codex mcp-server` (removed). `AGENTS.md` is free-form guidance only — it declares no config, skills, hooks, or agents.

## Findings

### 1. Per-surface support matrix

| Surface | Supported for third parties? | Primary evidence |
| --- | --- | --- |
| Skills | Yes — repo/user/admin/system scopes; progressive disclosure | [Build skills](https://learn.chatgpt.com/docs/build-skills.md) |
| Custom agents (subagent definitions) | Yes — TOML files in `~/.codex/agents/` and `.codex/agents/`, or inline `agents.<name>` in `config.toml` | [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents.md) |
| Hooks | Yes — `hooks.json` / inline `[hooks]`, user + trusted-project layers + plugins | [Hooks](https://learn.chatgpt.com/docs/hooks.md) |
| MCP servers | Yes — `[mcp_servers.*]` in user/project `config.toml`; plugin-bundled `mcp.json` | [MCP](https://learn.chatgpt.com/docs/extend/mcp.md) |
| Slash/custom commands | Deprecated — user-level only, replaced by skills | [Custom Prompts](https://learn.chatgpt.com/docs/custom-prompts.md) |
| Repo command rules | Yes, marked experimental — `.rules` (Starlark) files | [Rules](https://learn.chatgpt.com/docs/agent-configuration/rules.md) |
| Plugins (bundling the above) | Yes — the installable distribution unit | [Plugins](https://learn.chatgpt.com/docs/plugins.md), [Build plugins](https://developers.openai.com/plugins/build/plugins.md) |
| Native built-in tools | No mechanism documented to add new built-in tools; extension happens via MCP tools, hooks (`command`, `mcp_tool`), and skill scripts | [MCP](https://learn.chatgpt.com/docs/extend/mcp.md), [Hooks](https://learn.chatgpt.com/docs/hooks.md) |

The customization overview names exactly five extension layers — project guidance (`AGENTS.md`), memories, skills, MCP, subagents ([Customization](https://learn.chatgpt.com/docs/customization/overview.md)); hooks and plugins are documented on their own pages.

### 2. Skills

- A skill is a directory with a required `SKILL.md` containing `name` and `description` front matter; optional `scripts/`, `references/`, `assets/`, and `agents/openai.yaml` (UI metadata, `policy.allow_implicit_invocation`, `dependencies.tools` MCP declarations). Source: https://learn.chatgpt.com/docs/build-skills.md
- Invocation: explicit (`/skills`, `$skill` mention) or implicit via description match; `allow_implicit_invocation: false` disables implicit triggering. Source: https://learn.chatgpt.com/docs/build-skills.md
- The initial skills catalog is capped at 2% of the model's context window (configurable `skills.max_context_tokens`, hard cap 10,000 tokens); Codex shortens descriptions first and may omit skills in large sets. Sources: https://learn.chatgpt.com/docs/build-skills.md ; config reference `skills.max_context_tokens` / `skills.config.<index>.{path,enabled}` at https://learn.chatgpt.com/docs/config-file/config-reference.md
- Enable/disable without deletion via `[[skills.config]]` in `~/.codex/config.toml`. Source: https://learn.chatgpt.com/docs/build-skills.md

### 3. Exact directory layout (verified in source, `codex-rs/ext/skills/src/host_roots.rs`)

Source: https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/host_roots.rs (constants `AGENTS_DIR_NAME = ".agents"`, `SKILLS_DIR_NAME = "skills"`; `roots_from_layer_stack` + `repo_agents_skill_roots`), corroborated by https://learn.chatgpt.com/docs/build-skills.md:

| Scope | Location | Notes |
| --- | --- | --- |
| REPO | `.agents/skills` in every directory from project root down to CWD | scanned per ancestor dir; project root found via configurable `project_root_markers` (default markers e.g. `.git`) |
| REPO | project config-layer folder + `skills` → `<repo>/.codex/skills` | loaded only when the project layer is active/trusted; this is how the `openai/codex` repo's own `.codex/skills/` works |
| USER | `$HOME/.agents/skills` | cross-repo personal skills |
| USER | `$CODEX_HOME/skills` (`~/.codex/skills`) | source comment: "Deprecated user skills location, kept for backward compatibility" |
| ADMIN | system config layer + `skills` → `/etc/codex/skills` | machine/container defaults |
| SYSTEM | bundled with Codex by OpenAI | e.g. skill-creator, plan |
| PLUGIN | plugin-bundled `skills/` (auto-discovered from the plugin root) | loaded through `PluginSkillRoot` with plugin identity |

- Symlinked skill folders are followed; duplicate `name` values are not merged. Source: https://learn.chatgpt.com/docs/build-skills.md
- Skill scopes in code: `SkillScope::{User, Repo, System, Admin}` — `codex-rs/skills/src/model.rs` (https://github.com/openai/codex/blob/main/codex-rs/skills/src/model.rs); `codex-rs/core/src/skills.rs` maps scopes for telemetry.
- `agents/openai.yaml` fields parse into `SkillPolicy` (`allow_implicit_invocation`, `products`), `SkillInterface`, `SkillDependencies` — `codex-rs/skills/src/model.rs`.

### 4. Custom agents (subagent definitions)

- Built-ins: `default` (general fallback), `worker` (execution), `explorer` (read-heavy exploration). Custom agents override built-ins on name collision. Source: https://learn.chatgpt.com/docs/agent-configuration/subagents.md
- File layout: one standalone TOML file per agent under `~/.codex/agents/` (personal) or `.codex/agents/` (project). Required fields: `name`, `description`, `developer_instructions`; may also set `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config`. The `name` field, not the filename, is the source of truth. Source: https://learn.chatgpt.com/docs/agent-configuration/subagents.md
- Global `[agents]` keys in `config.toml`: `enabled` (default true), `max_concurrent_threads_per_session` (legacy alias `max_threads`), `default_subagent_model`, `default_subagent_reasoning_effort`, `interrupt_message`; inline role declarations via `agents.<name>.description` and `agents.<name>.config_file` (relative paths resolve from the declaring config file). Sources: https://learn.chatgpt.com/docs/agent-configuration/subagents.md ; https://learn.chatgpt.com/docs/config-file/config-reference.md
- **Delegation triggers** (confirms prior verified finding, no contradiction): "Current local Codex releases delegate when you ask directly or when applicable `AGENTS.md` or skill instructions request it"; "Current Codex releases enable subagent workflows by default." Sources: https://learn.chatgpt.com/docs/agent-configuration/subagents.md (app/cli/ide modes)
- Instability marker, verbatim: custom agents load "as configuration layers for spawned sessions … the format may evolve as authoring and sharing mature." Source: https://learn.chatgpt.com/docs/agent-configuration/subagents.md
- Subagents inherit the parent's sandbox/approval policy; per-agent overrides are possible (`sandbox_mode` in the agent file). Source: https://learn.chatgpt.com/docs/agent-configuration/subagents.md

### 5. Hooks

- Discovery: `hooks.json` or inline `[hooks]` tables next to active config layers — in practice `~/.codex/hooks.json`, `~/.codex/config.toml`, `<repo>/.codex/hooks.json`, `<repo>/.codex/config.toml`; all matching sources load (no override); plugin-bundled hooks load alongside. Project-local hooks load only when the project `.codex/` layer is trusted. Source: https://learn.chatgpt.com/docs/hooks.md
- Events: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, `Stop` (during a turn), `Interrupt` (not for subagents), `SessionStart`, `SubagentStart`, `SessionEnd` (not for subagents). Source: https://learn.chatgpt.com/docs/hooks.md
- Handler types: `command` and `mcp_tool` supported; `prompt` and `agent` handlers are "parsed but skipped." Config reference confirms: `hooks.<Event>[].hooks` — "Command and MCP tool hooks are supported while prompt and agent hook handlers are parsed but skipped." Sources: https://learn.chatgpt.com/docs/hooks.md ; https://learn.chatgpt.com/docs/config-file/config-reference.md
- Trust: non-managed hooks must be reviewed and trusted per exact-definition hash (`/hooks` UI); managed hooks (system, MDM, cloud, `requirements.toml`) are trusted by policy and cannot be user-disabled; `allow_managed_hooks_only` skips all non-managed hooks; `--dangerously-bypass-hook-trust` exists for one-off automation. Sources: https://learn.chatgpt.com/docs/hooks.md ; config reference
- Feature flag `features.hooks` enables hooks; `features.codex_hooks` is a deprecated alias. Source: https://learn.chatgpt.com/docs/config-file/config-reference.md
- Plugin hooks get `PLUGIN_ROOT`/`PLUGIN_DATA` env vars plus `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA` for compatibility with existing Claude-style plugin hooks. Source: https://developers.openai.com/plugins/build/plugins.md

### 6. MCP servers and tools

- Config: `[mcp_servers.<name>]` in `~/.codex/config.toml` (user) or `.codex/config.toml` (project; trusted projects only). CLI management: `codex mcp add|list|login`; TUI `/mcp`. Sources: https://learn.chatgpt.com/docs/extend/mcp.md
- Transports: STDIO (`command`, `args`, `env`, `env_vars`, `cwd`, `experimental_environment`) and streamable HTTP (`url`, `auth`, `bearer_token_env_var`, `http_headers`, `http_headers_helper`); server `instructions` field is read as cross-tool guidance (first 512 chars should be self-contained). Source: https://learn.chatgpt.com/docs/extend/mcp.md
- Tool policy per server: `enabled_tools`, `disabled_tools`, `default_tools_approval_mode`, per-tool `approval_mode` and `output_token_limit`; `startup_timeout_sec` (default 10), `tool_timeout_sec` (default 60), `enabled`, `required`. Source: https://learn.chatgpt.com/docs/extend/mcp.md
- Plugin-provided MCP servers are launched from the plugin; user config controls only on/off and tool policy under `plugins.<plugin>.mcp_servers.<server>`. Sources: https://learn.chatgpt.com/docs/extend/mcp.md ; https://developers.openai.com/plugins/build/plugins.md
- Skills can declare MCP dependencies in `agents/openai.yaml`; `features.skill_mcp_dependency_install` (stable, on by default) lets Codex prompt and install missing MCP dependencies for skills. Sources: https://learn.chatgpt.com/docs/build-skills.md ; config reference

### 7. `AGENTS.md` — role and limits

- Discovery (built once per run): global `~/.codex/AGENTS.override.md` else `AGENTS.md` (first non-empty wins); then per-directory from project root down to CWD, at most one file per directory, precedence `AGENTS.override.md` > `AGENTS.md` > fallback names from `project_doc_fallback_filenames`; concatenated root→CWD so closer files override. `project_doc_max_bytes` caps the combined chain (32 KiB default). `CODEX_HOME` relocates the home. Source: https://learn.chatgpt.com/docs/agent-configuration/agents-md.md
- What it is: free-form durable project guidance (build/test commands, review expectations, conventions, directory-specific instructions) plus a special-cased `## Code Review Rules` section consumed by GitHub code review. Sources: https://learn.chatgpt.com/docs/agent-configuration/agents-md.md ; https://learn.chatgpt.com/docs/customization/overview.md
- What it cannot declare: no documented manifest semantics — it cannot register skills, hooks, MCP servers, custom agents, or config keys; those live in `config.toml`, `hooks.json`, `.rules`, skill folders, and agent TOML files. `AGENTS.md` influences behavior only as instructions, including requesting subagent delegation. (Inference from absence across the configuration reference and customization docs; no doc states "AGENTS.md cannot declare X" explicitly.)
- Delegation: `AGENTS.md` instructions can trigger native subagent delegation ("applicable `AGENTS.md` or skill instructions request it"). Source: https://learn.chatgpt.com/docs/agent-configuration/subagents.md
- `instructions` config key is "Reserved for future use; prefer `model_instructions_file` or `AGENTS.md`"; `model_instructions_file` replaces built-in instructions entirely. Source: https://learn.chatgpt.com/docs/config-file/config-reference.md

### 8. Custom prompts (slash commands) — deprecated

- Markdown files directly under `~/.codex/prompts/` (top level only, non-Markdown ignored), YAML front matter `description` and `argument-hint`; placeholders `$1..$9`, `$ARGUMENTS`, named `$VAR` (`KEY=value`), `$$` escape; invoked as `/prompts:<name>`; explicit invocation only, user-level only, "not shared through your repository." Source: https://learn.chatgpt.com/docs/custom-prompts.md
- Doc headline: "Custom prompts are deprecated. Use skills for reusable instructions that Codex can invoke explicitly or implicitly." Source: https://learn.chatgpt.com/docs/custom-prompts.md

### 9. Repo command rules (`.rules`) — experimental

- `.rules` files (Starlark, `prefix_rule()` with `pattern`, `decision` allow/prompt/forbidden, `justification`, inline `match`/`not_match` tests) under a `rules/` folder next to any active config layer: `~/.codex/rules/` (user; TUI allow-list writes here) and `<repo>/.codex/rules/` (trusted projects only). Page states: "Rules are experimental and may change." Admin `requirements.toml` can enforce restrictive `prefix_rule`s. Test with `codex execpolicy check`. Source: https://learn.chatgpt.com/docs/agent-configuration/rules.md

### 10. Project trust gating

- Project-scoped `.codex/` layers (config, hooks, rules) load only for trusted projects; `projects.<path>.trust_level = "trusted" | "untrusted"` in user config; untrusted projects skip project `.codex/` layers entirely. Project config cannot override provider/auth/notification/telemetry keys (`model_provider`, `model_providers`, `notify`, `profile`, `profiles`, `openai_base_url`, `chatgpt_base_url`, `otel`, etc.). Sources: https://learn.chatgpt.com/docs/config-file/config-reference.md (`projects.<path>.trust_level`, project-scoped key ignore list)

### 11. Plugins — the distribution unit

- Manifest: root `plugin.json` declaring the Agent Plugins schema (`$schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`; required `$schema` + `name`; `name` pattern `^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$`, ≤ 64 chars; optional `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`; client-specific data under `extensions` — OpenAI's is `extensions.com.openai` with `apps`, `hooks`, `interface`). Sources: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json ; https://developers.openai.com/plugins/build/plugins.md
- Fixed package paths: `skills/` (auto-discovered; a manifest `skills` declaration cannot add/replace them for portable packages), `mcp.json` (`$schema` https://agent-plugins.org/schemas/1.0.0/mcp.schema.json, `mcpServers` with transport `type`), optional `hooks/` (`hooks/hooks.json` discovered by default), `assets/`. A legacy `.codex-plugin/plugin.json` overlay remains supported as a compatibility fallback (the `@plugin-creator` scaffold still emits it). Sources: https://developers.openai.com/plugins/build/plugins.md
- Claude compatibility: "OpenAI also accepts legacy and Claude-compatible manifests"; the desktop app reads a legacy-compatible `$REPO_ROOT/.claude-plugin/marketplace.json` marketplace; plugin hooks receive `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA`. Sources: https://developers.openai.com/plugins/build/plugins.md
- Installed plugins cache to `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`. Enable/disable per repo via `[plugins."my-plugin@marketplace-name"]` in `.codex/config.toml` (trusted projects). Sources: https://developers.openai.com/plugins/build/plugins.md
- Plugins can contain skills, MCP servers, browser extensions, and hooks; surface availability differs: ChatGPT desktop app and Codex CLI have the plugin browser (`/plugins`), the IDE extension does not. Sources: https://learn.chatgpt.com/docs/plugins.md

### 12. Install/distribution channels

1. **Manual copy / git clone into well-known directories** — `.agents/skills` (repo), `~/.agents/skills` (user), `.codex/skills`, `~/.codex/agents`/`.codex/agents`, `~/.codex/prompts`, `~/.codex/rules`/`.codex/rules`, `~/.codex/agents`; symlinked skill folders supported. Docs frame direct skill folders as "authoring and local discovery." Sources: https://learn.chatgpt.com/docs/build-skills.md ; https://learn.chatgpt.com/docs/custom-prompts.md ; https://learn.chatgpt.com/docs/agent-configuration/rules.md
2. **Plugin marketplaces** — JSON catalogs: repo `$REPO_ROOT/.agents/plugins/marketplace.json`, personal `~/.agents/plugins/marketplace.json`, legacy `$REPO_ROOT/.claude-plugin/marketplace.json`. CLI: `codex plugin marketplace add owner/repo [--ref R] [--sparse PATH] | git URL | ./local-path`, plus `list/upgrade/remove`. Marketplace entries support `source: local | url | git-subdir | npm` (npm downloads run **no lifecycle scripts**; requires the npm CLI; `version` accepts ranges/tags, not paths). Sources: https://developers.openai.com/plugins/build/plugins.md
3. **Universal public Plugins Directory** — one catalog shared by ChatGPT and Codex; publish once, discoverable everywhere plugins are supported. Sources: https://learn.chatgpt.com/docs/plugins.md ; https://learn.chatgpt.com/docs/build-plugins.md
4. **Enterprise workspace distribution** — workspace admins import/sync a GitHub marketplace (Admin > Plugins); local plugins can be published to the workspace by admins (`features.plugin_sharing = false` in `requirements.toml` disables); admin-defined marketplaces in system `config.toml` or cloud-managed config. Sources: https://developers.openai.com/plugins/build/plugins.md ; https://learn.chatgpt.com/docs/plugins.md
5. **Curated skills** — `$skill-installer <name>` installs curated skills; the installer can also be pointed at other repositories. Sources: https://learn.chatgpt.com/docs/build-skills.md
6. **MCP servers** — distributed as any executable reachable by STDIO command (e.g. npm package run via `npx`) or a public HTTPS streamable-HTTP endpoint. Source: https://learn.chatgpt.com/docs/extend/mcp.md

### 13. Publisher requirements (public universal-directory submission)

Source: https://developers.openai.com/plugins/deploy/submission.md

- Org role with **Apps Management** write permission; a **verified developer or business identity** in the OpenAI Platform (mismatched/unverified identity is grounds for rejection).
- Submission types: skills-only; remote-MCP-only (custom UI optional); combined. Public MCP submissions must use a **stable, public HTTPS endpoint** — local MCP servers are not accepted for public listing ("reach out to your OpenAI contact for local MCP support").
- Domain verification via `https://<host>/.well-known/openai-apps-challenge`; **tool annotations** `readOnlyHint`, `openWorldHint`, `destructiveHint` required for every tool and must match real behavior; OAuth workspace domain restrictions require a UserInfo endpoint with verified `email`.
- Materials: listing copy, logo, category, website/support/privacy/terms URLs, starter prompts, release notes, country availability, policy attestations, and **five positive + three negative test cases** with reviewer-runnable credentials (no MFA/private network).
- Skills are scanned for policy/security compliance and can block submission; MCP-imported skills are a submission-time snapshot, not live.
- Flow: portal draft → OpenAI review (timeline variable) → developer publishes → appears in the universal directory. Metadata/skill-snapshot changes require a new submitted and approved version.
- No cost or npm/git requirement is documented for marketplace channels; only the public directory has the review gate above.

### 14. Version/compatibility constraints and explicitly unstable areas

- **Version floor**: managed permission-profile allowlists (`allowed_permission_profiles`, managed `default_permissions`) in `requirements.toml` require Codex **0.138.0+**; 0.137.0 and earlier ignore them. This is the only concrete version constraint found in primary docs. Source: https://learn.chatgpt.com/docs/config-file/config-reference.md
- **No published compatibility matrix** for third-party surface versions; plugin manifests declare a schema version via `$schema` (`SUPPORTED_AGENT_PLUGIN_SCHEMA_URIS` in `codex-rs/utils/plugins/src/plugin_namespace.rs`, re-exported from `codex-rs/utils/plugins/src/lib.rs`), and OpenAI accepts multiple/legacy manifest formats.
- **Experimental/unstable (documented verbatim)**: `.rules` files — "Rules are experimental and may change" (https://learn.chatgpt.com/docs/agent-configuration/rules.md); custom-agent file format — "may evolve as authoring and sharing mature" (subagents page); app-server protocol — "experimental and isn't supported for production workloads"; the feature-maturity table defines Experimental as "Unstable and OpenAI may remove or change it. Use at your own risk" (https://learn.chatgpt.com/docs/feature-maturity.md).
- **Deprecated**: custom prompts → skills (https://learn.chatgpt.com/docs/custom-prompts.md); `features.codex_hooks` → `features.hooks`; `experimental_instructions_file` → `model_instructions_file`; `agents.max_threads` → `agents.max_concurrent_threads_per_session` (config reference); `approval_policy = "on-failure"` deprecated; `approval_policy = "untrusted"` removed entirely.
- **Removed**: the `codex mcp-server` command and `codex-mcp-server` binary are removed — Codex can no longer be hosted as an MCP server; integrations must use the app-server JSON-RPC protocol (experimental). Source: https://learn.chatgpt.com/docs/mcp-server.md
- **Hook handler limits**: `prompt` and `agent` hook handler types are parsed but skipped — only `command` and `mcp_tool` run. Source: https://learn.chatgpt.com/docs/hooks.md
- **Under-development feature flags** trigger a warning; `suppress_unstable_features_warning` silences it. Source: https://learn.chatgpt.com/docs/config-file/config-reference.md
- **Machine-readable config schema** for publishers/IDEs: https://learn.chatgpt.com/docs/config-schema.json (also referenced as https://developers.openai.com/codex/config-schema.json in the `#:schema` header snippet). Source: https://learn.chatgpt.com/docs/config-file/config-reference.md
- CLI itself ships via install script (releases.openai.com with GitHub Releases fallback), `npm install -g @openai/codex`, Homebrew cask `codex`, and GitHub release archives. Source: https://github.com/openai/codex (README)

## Open questions

- **Whether `.agents/skills` vs `.codex/skills` differ in trust**: source (`host_roots.rs`) shows `.codex/skills` rides the project config layer (which is trust-gated) while `.agents/skills` ancestors are scanned from the filesystem after project-root discovery; the docs do not state whether `.agents/skills` loading requires project trust. Not established from primary sources.
- **Exact current CLI version number** at research time and per-release changelogs for surface changes: the releases page was not fetched; only the 0.138.0 requirements floor is documented. Publishers tracking behavior changes need to watch release notes (https://github.com/openai/codex/releases), which were not examined.
- **Whether repo-root `.mcp.json` (Claude-Code-style, outside a plugin) is read by Codex**: not documented for plain repositories — only `config.toml` `[mcp_servers]` and plugin-bundled `mcp.json`/`.mcp.json` are documented. Unconfirmed either way.
- **Marketplace `policy.installation` full value set and marketplace JSON schema**: values `AVAILABLE`, `INSTALLED_BY_DEFAULT`, `NOT_AVAILABLE` are documented by example; no formal schema URL for `marketplace.json` was found.
- **`AGENTS.md` size/skill-list budgets interacting with delegation reliability**: the 32 KiB `AGENTS.md` cap and 2% skill-catalog cap are documented, but no guidance on how large instruction files affect subagent delegation triggering.

## Sources

- https://learn.chatgpt.com/docs/build-skills.md — skills format, scopes, budgets, `$skill-installer`, `agents/openai.yaml`
- https://learn.chatgpt.com/docs/extend/mcp.md — MCP transports, config keys, plugin-provided servers, OAuth
- https://learn.chatgpt.com/docs/agent-configuration/subagents.md — built-in agents, custom agent files, `[agents]` keys, delegation triggers
- https://learn.chatgpt.com/docs/hooks.md — hook events, files, handlers, trust model
- https://learn.chatgpt.com/docs/agent-configuration/agents-md.md — AGENTS.md discovery, overrides, fallbacks, caps
- https://learn.chatgpt.com/docs/customization/overview.md — layer map, skills vs plugins, AGENTS/skills global-vs-repo table
- https://learn.chatgpt.com/docs/custom-prompts.md — deprecated custom prompts
- https://learn.chatgpt.com/docs/agent-configuration/rules.md — experimental `.rules` files
- https://learn.chatgpt.com/docs/config-file/config-reference.md — config.toml/requirements.toml keys, trust, version floor, deprecations
- https://learn.chatgpt.com/docs/plugins.md — plugin surfaces, CLI plugin browser, universal directory
- https://learn.chatgpt.com/docs/build-plugins.md — plugin packaging intro, `.codex-plugin` scaffold
- https://developers.openai.com/plugins/build/plugins.md — manifest, path rules, marketplaces, npm source, plugin hooks
- https://developers.openai.com/plugins/deploy/submission.md — public submission/publisher requirements
- https://learn.chatgpt.com/docs/feature-maturity.md — maturity labels
- https://learn.chatgpt.com/docs/mcp-server.md — removed Codex MCP server, app-server status
- https://agent-plugins.org/schemas/1.0.0/plugin.schema.json — Agent Plugins manifest JSON schema
- https://github.com/openai/codex (README) — install channels (npm/brew/script/releases)
- https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/host_roots.rs — skill directory enumeration (source of truth for section 3)
- https://github.com/openai/codex/blob/main/codex-rs/skills/src/model.rs — `SkillScope`, `openai.yaml` parse model
- https://github.com/openai/codex/blob/main/codex-rs/utils/plugins/src/lib.rs — `PluginSkillRoot`, plugin manifest path constants, migrated Claude commands
