# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- **BREAKING:** ws-claude-sync plugin (8 commands, 1 agent, 1 skill) removed from the marketplace
- **BREAKING:** ws-clamp plugin (4 commands, 1 agent, 1 skill) removed from the marketplace

## [2.0.0] - 2026-06-02

### Added

- Marketplace configuration with docs-agent and ws-commit-commands plugins
- ws-jira-enhancer plugin for transforming brief task descriptions into structured Jira tickets with user stories and acceptance criteria
- ws-claude-sync plugin for cross-machine context sync via GitHub (8 commands, 1 agent, 1 skill)
- ws-clamp plugin for project management with session history preservation (4 commands, 1 agent, 1 skill)
- docs-agent v2.0.0 with ADRs, style guide, conventional commits support, and auto-enforcement via CLAUDE.md hooks
- ws-project-hub plugin for managing multi-repo projects through a single hub repo with subfolder layout and invocation launcher
- ws-project-hub commands: hub-init, hub-launch, hub-sync, hub-status, hub-add-repo, hub-scan, hub-describe, hub-clone-all
- ws-project-hub hub-architect subagent for cross-repo documentation
- ws-commit-commands v2.0.0 with Jira-aware workflows including OAuth onboarding, status dashboard, and Smart Commit worklogs
- ws-commit-commands /ws-init for OAuth onboarding via Atlassian MCP with global and per-project config
- ws-commit-commands /ws-status dashboard showing assigned tickets grouped by status with smart suggestions
- ws-commit-commands /ws-commit with Conventional Commits format, ticket detection, and automatic worklog tracking
- ws-commit-commands /ws-commit-push-pr for end-to-end workflow with Jira linking and optional issue transitions
- ws-commit-commands SessionStart hook injecting compact Jira dashboard on session open
- ws-commit-commands ws-jira-conventions skill documenting branch naming, commit format, and Smart Commit syntax
- ws-commit-commands v2.1.0 with automatic CHANGELOG.md updates in Keep a Changelog format during PR flow
- docs-agent dual-track-docs convention skill separating user-facing (docs/) and contributor-facing (dev-docs/) documentation
- docs-agent /docs command scaffolding and writing across both documentation tracks
- docs-agent audience-aware routing for howto/reference/explanation commands to correct documentation track
- docs-agent /adr and /architecture commands writing to dev-docs/
- docs-agent /contributing command generating 3 files (root router, user guide, dev guide)
- docs-agent changelog commands mirroring CHANGELOG.md updates to docs/changelog.md
- docs-agent /release-notes command writing to docs/release-notes/
- docs-agent v2.1.0 with dual-track documentation convention and revised command structure
- docs-agent /ws-docs unified entry point with 10 documentation verbs
- docs-agent docs-doctor agent for documentation discovery and audit
- docs-agent public-api-watcher agent for monitoring public API changes
- docs-agent arch-watcher agent for architecture documentation monitoring
- docs-agent enforce-changelog and enforce-stop hook scripts for documentation enforcement
- docs-agent PreToolUse and Stop hooks gated by .claude/docs-config.yaml for opt-in enforcement
- docs-agent v3.0.0 with unified /ws-docs entry replacing 11 separate documentation commands
- docs-agent 3 new subagents: docs-doctor, public-api-watcher, arch-watcher

### Changed

- **BREAKING:** docs-agent v3.0.0 removes old documentation commands (/docs, /docs-tutorial, /docs-howto, /docs-reference, /docs-explanation, /adr, /architecture, /contributing, /changelog, /changelog-entry, /release-notes) in favor of unified /ws-docs with 10 verbs

### Fixed

- Correct plugin marketplace command syntax in README (from `claude marketplace` to `/plugin` format)
- ws-project-hub invoke-ai.sh bash compatibility by replacing mapfile calls with portable while-read loops for bash 3.2 support on macOS
