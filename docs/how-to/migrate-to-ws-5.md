# Migrate an existing project to WS 5

WS 5 replaces every earlier setup entry point and repository policy file with `/ws-setup` and `.wsagency/config.yaml`. Run the migration once in each repository you actively use.

## Before you start

Commit or stash changes to files that WS setup manages. `/ws-setup` preserves unrelated work, but it blocks when an uncommitted change overlaps a planned file or managed range.

If your project uses Jira, verify jira-cli authentication:

```bash
jira me
```

The migration never copies Jira tokens, site details, or user identity into the repository.

## Update the WS installation

### Claude Code

Refresh the marketplace, then reinstall the plugin so the installed checkout contains WS 5:

```bash
claude plugin marketplace update ws-marketplace
claude plugin uninstall ws@ws-marketplace
claude plugin install ws@ws-marketplace
```

Restart Claude Code after installation.

### omp

Upgrade the native package to the matching `@wsagency/omp-ws` 0.7 release:

```bash
omp plugin install @wsagency/omp-ws@0.7.0
```

Disable or uninstall `ws@ws-marketplace` inside omp if it is also enabled. The native package already contains the complete WS command, skill, and agent surface.

## Review the migration plan

Enter the repository and start the updated harness:

```bash
cd /path/to/project
```

Run:

```text
/ws-setup
```

The command discovers the project without writing. It converts recognized pre-5 state, including:

- `.claude/ws-project.yaml` Jira, changelog, dashboard, and hook choices;
- `.claude/docs-config.yaml` documentation and changelog policy;
- released or customized tracker, triage, and domain adapters;
- `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, and `CONTEXT-MAP.md` routing;
- repository-owned runtime markers;
- Local tickets, Jira mappings, pending synchronization, comments, claims, and history.

Canonical values win over legacy values. If repository-local sources disagree, `/ws-setup` asks you to resolve the specific field. Machine or user-global values appear only as suggestions that you must confirm. Unknown fields, malformed content, unsupported custom trackers, ambiguous prose, or unsafe managed ranges block all writes instead of guessing.

Inspect the complete manifest. It lists each `CREATE`, `UPDATE`, `PRESERVE`, `SKIP`, `NO-OP`, and `BLOCKING_CONFLICT` effect, including exact diffs and external Jira operations. No worker writes until you approve the single final plan.

Select **Apply plan** only when the scope and effects are correct. Setup verifies each result before continuing and stops at the first failure without rollback. If a failure occurs, fix the named problem and rerun `/ws-setup`; the new plan contains only the missing remainder.

## Verify the canonical result

Confirm that the repository contains:

```text
.wsagency/config.yaml
```

The file contains committed project policy only. It must not contain credentials, Jira site or identity data, home paths, machine installation state, or Git-origin identity.

Run `/ws-setup` again. A fully aligned repository asks no questions, writes nothing, and ends with:

```text
No changes required
```

Check the reported readiness independently:

- `config` validates the installed schema;
- `engineering` validates tracker, triage, domain, context, and managed adapters;
- `tracker` validates only the selected tracker and synchronization capabilities;
- `documentation` validates configured documentation artifacts and dependencies;
- `runtime` validates committed runtime requirements against the active harness.

An unavailable optional integration does not block unrelated capabilities.

## Migrate a hub

Run `/ws-setup` at the hub root to plan one transaction for the hub and every registered, locally present `type: working` repository. The manifest shows input, output, and absent repositories as excluded. Setup never clones them or initializes repository-local WS state inside them.

The hub policy proposes defaults for missing child choices. Each working repository receives a complete materialized `.wsagency/config.yaml`; children do not inherit hub policy at runtime. A failure stops before the affected repository's first unverified write and leaves every later repository pending.

Running `/ws-setup` inside a hub working repository targets only that repository and leaves hub-owned product artifacts untouched.

## Change policy after migration

Ordinary `/ws-setup` repairs missing or invalid managed state without reopening valid choices. To change a valid choice intentionally, run:

```text
/ws-setup reconfigure
```

Select the repository scope, domain, and concrete fields. Reconfiguration shows dependency closure and data disposition before confirmation, preserves every unselected field and authored artifact, and records resumable prepare, cutover, cleanup, and audit state.

## Removed setup conventions

WS 5 does not provide aliases or fallback readers for the removed setup surface. Do not run `/ws-init` or `/ws-matt setup`, and do not edit `.claude/ws-project.yaml`, `.claude/docs-config.yaml`, or native package settings as active project policy. If a current WS command detects those sources without a valid canonical configuration, it stops and directs you to `/ws-setup`.
