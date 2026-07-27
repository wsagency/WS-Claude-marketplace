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

- **Markdown prose** — Follow the [style-guide skill](../plugins/ws/skills/style-guide/SKILL.md) for documentation tone, structure, and formatting
- **Hook scripts** — Bash scripts in `plugins/*/hooks/` use `set -euo pipefail` at the top and target bash 3.2+ for macOS compatibility (no `mapfile`, no associative arrays)
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

The marketplace uses **lockstep versioning** ([ADR 0002](decisions/0002-lockstep-marketplace-versioning.md)): every plugin's `version` field in `.claude-plugin/marketplace.json` equals the marketplace release version, and all entries are bumped together at release time.

- `marketplace.json` is the **single version authority** — `plugin.json` files carry no version field
- Never bump a single plugin's version on its own; versions only move as part of a release
- Day-to-day, record changes in `CHANGELOG.md` under `[Unreleased]`; per-entry **BREAKING:** lines carry the per-plugin breaking-change signal
- Keep the `description` field in `marketplace.json` in sync with the plugin's `plugin.json` description

## Documentation

This project follows a dual-track docs convention:

1. After code changes, add an entry to `CHANGELOG.md` under `[Unreleased]`
2. For architectural decisions, run `/ws-docs adr "<decision>"` to create an ADR in `dev-docs/decisions/` (two-tier convention: lightweight ADR by default, full MADR for big decisions)

## Testing

There is no automated test harness for markdown plugins. Verification is manual:

- **JSON validity** — Ensure `marketplace.json` and all `plugin.json` files are valid JSON
- **Markdown syntax** — Check that command and agent files have valid YAML frontmatter
- **Bash scripts** — Run `bash -n script.sh` to check for syntax errors
- **Dogfooding** — The marketplace is self-hosting; if a change breaks the marketplace's own `/ws-docs` or `/ws-commit` workflows, that's a failure

## Release / push

Direct commits to `main` are the convention for day-to-day changes:

- Record each change in `CHANGELOG.md` under `[Unreleased]` — no version bumps outside a release
- Push to `main` — no PR review required for small plugin updates, but mention the change to the team
- For major plugin additions or restructuring, open a pull request for visibility

### Cutting a release (lockstep, per ADR 0002)

1. Cut `[Unreleased]` in `CHANGELOG.md` to a new `[X.Y.Z]` section
2. Mirror the changelog to `docs/changelog.md`
3. Set **every** `version` field in `.claude-plugin/marketplace.json` to `X.Y.Z`
4. Tag the release: `git tag vX.Y.Z`

Never bump a single plugin on its own — all versions move together.

## Questions?

Ask in #claude-marketplace on the WS internal Slack or open a GitHub Discussion.
