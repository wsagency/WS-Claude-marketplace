# Development guide

This guide covers setting up the WS Claude Marketplace repository for contribution and the conventions we follow for plugins, commits, and releases.

## Local setup

The marketplace is a registry of plugins and source code — no build step required.

1. Clone the repository:
   ```bash
   git clone https://github.com/wsagency/WS-Claude-marketplace.git
   cd WS-Claude-marketplace
   ```

2. To test a plugin locally before pushing:
   ```bash
   claude plugin marketplace add /path/to/local/clone
   claude plugin install <plugin-name>@ws-marketplace
   ```

   This installs the plugin from your local checkout for manual testing.

## Adding a new plugin

See [dev-docs/runbooks/create-plugin.md](runbooks/create-plugin.md) for the complete walkthrough.

## Modifying an existing plugin

- **Adding a command** — See [dev-docs/runbooks/add-command.md](runbooks/add-command.md)
- **Adding an agent** — See [dev-docs/runbooks/add-agent.md](runbooks/add-agent.md)

## Code style

The marketplace is markdown and JSON only — no compiled code.

- **Markdown prose** — Follow the [style-guide skill](/docs-agent) for documentation tone, structure, and formatting
- **Hook scripts** — Bash scripts in `.claude/hooks/` use `set -euo pipefail` at the top and target bash 3.2+ for macOS compatibility (no `mapfile`, no associative arrays)
- **JSON** — Keep `.claude-plugin/marketplace.json` and `plugin.json` files valid and human-readable

## Commit format

Follow Conventional Commits:

```
feat: add ws-sync plugin
fix: correct hook script quoting
docs: update development guide
```

If a Jira ticket exists, append it to the subject:

```
feat: add ws-sync plugin (WSC-123)
```

For breaking changes, use `feat!:` or include `BREAKING CHANGE:` in the body:

```
feat!: restructure plugin.json format (WSC-456)

BREAKING CHANGE: Plugin authors must now include a `version` field in plugin.json
```

## Versioning

Each plugin follows SemVer in its `marketplace.json` entry:

```json
{
  "name": "ws-docs",
  "version": "1.2.3",
  "description": "..."
}
```

When you modify a plugin, bump its version. Keep the `description` field in `marketplace.json` in sync with the plugin's `plugin.json` description.

## Documentation

This project follows a dual-track docs convention:

1. After code changes, add an entry to `CHANGELOG.md` under `[Unreleased]`
2. For architectural decisions, run `/docs-agent adr "<decision>"` to create an ADR

## Testing

There is no automated test harness for markdown plugins. Verification is manual:

- **JSON validity** — Ensure `marketplace.json` and all `plugin.json` files are valid JSON
- **Markdown syntax** — Check that command and agent files have valid YAML frontmatter
- **Bash scripts** — Run `bash -n script.sh` to check for syntax errors
- **Dogfooding** — The marketplace is self-hosting; if a change breaks the marketplace's own `/ws-docs` or `/ws-commit-commands` workflows, that's a failure

## Release / push

Direct commits to `main` are the convention:

1. Bump the plugin version in `marketplace.json` and its `plugin.json` description
2. Update `CHANGELOG.md`
3. Push to `main` — no PR review required for small plugin updates, but mention the change to the team
4. For major plugin additions or restructuring, open a pull request for visibility

## Questions?

Ask in #claude-marketplace on the WS internal Slack or open a GitHub Discussion.
