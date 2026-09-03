# Define the canonical WS project configuration schema

Map: unify-ws-setup-entrypoints
Label: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: None — can start immediately.

## Question

What exact versioned schema must `.wsagency/config.yaml` expose for tracker selection, optional Jira synchronization, commit and changelog policy, dashboard behavior, documentation, and runtime policy; which fields and artifacts constitute core setup readiness; and how must unknown, malformed, older, and future schema versions be validated without silently applying defaults?

## Answer

`.wsagency/config.yaml` uses a strict, versioned YAML envelope with snake_case keys:

```yaml
schema_version: 1

tracker:
  primary: local                # local | github | gitlab | jira
  pull_requests: ignore         # ignore | triage

triage:
  labels:
    needs_triage: needs-triage
    needs_info: needs-info
    ready_for_agent: ready-for-agent
    ready_for_human: ready-for-human
    wontfix: wontfix

domain:
  layout: single_context        # single_context | multi_context

commit:
  jira:
    actions: disabled           # disabled | ask | always
    smart_commit_trailer: false
    post_commit_comment: false
    pr_transition: null         # null or a non-empty transition name

changelog:
  update_mode: pull_request     # pull_request | commit | disabled
  path: CHANGELOG.md
  skip_types: [docs, chore, test, style, build, ci]

ui:
  session_start_dashboard: disabled  # disabled | jira_assignments

runtime:
  session_discipline: required
  dangerous_git_guard: enabled       # enabled | disabled

# Optional; present when Jira is bound for a primary tracker, synchronization,
# commit behavior, or the dashboard.
jira:
  project: WSC
  board: 42                     # optional positive integer
  default_issue_type: Task
  sync: all_local_tickets       # disabled | all_local_tickets

# Optional; present only when documentation policy is configured.
docs:
  user_track: docs
  dev_track: dev-docs
  default_audience: ask         # user | dev | ask
  default_scope: ask            # repo | product | ask
  adr_for_arch_changes: true
```

`tracker` is a discriminated union. Local uses the fixed `dev-docs/tickets/` convention; GitHub and GitLab identity comes from the validated git origin; Jira identity comes from the `jira` section. Adapter paths are fixed conventions rather than configurable values. `tracker.pull_requests` owns the external-PR intake policy for every backend.

The `jira` section contains no site, user, token, or authentication data; jira-cli owns those outside the repository. `tracker.primary: jira` requires `jira` and requires `jira.sync: disabled`. `jira.sync: all_local_tickets` is valid only with `tracker.primary: local`. `commit.jira.actions: ask | always` and `ui.session_start_dashboard: jira_assignments` also require `jira`. A Jira section may remain with synchronization disabled when it is used only for commit behavior or to preserve an explicit binding.

`.wsagency/config.yaml` is the sole machine-readable owner of tracker selection, PR intake, triage label mappings, domain layout, Jira binding, commit behavior, changelog policy, dashboard policy, documentation policy, and cross-harness runtime policy. The three `dev-docs/agents/` files remain human- and agent-readable operational adapters, but they do not duplicate configurable values: they instruct consumers to read this config.

The docs section stores desired policy only. It does not store an initialized date, completion flag, docs schema version, or generated-state marker; actual documentation readiness is rediscovered from the filesystem. Changelog behavior exists only in the root `changelog` section, where `update_mode` replaces the contradictory legacy `auto_update` and `changelog_per_commit` booleans.

The runtime section stores team policy, never machine state. It does not record whether Claude Code or omp is installed. Each machine discovers its current harness and verifies that session discipline and the dangerous-git guard are delivered according to the committed policy.

The base schema permits a schema-valid partial config: only `schema_version` is required at the envelope level, and every section that is present must be complete. This allows `/ws-docs init` to create or merge a docs-only config without inventing engineering choices. Engineering readiness requires complete `tracker`, `triage`, `domain`, `commit`, `changelog`, `ui`, and `runtime` sections.

Readiness is always derived, never persisted:

- `config_valid` — strict schema and cross-field validation succeeds;
- `engineering_ready` — all core sections are complete; `dev-docs/agents/issue-tracker.md`, `domain.md`, and `triage-labels.md` exist and satisfy their operational contracts; canonical `AGENTS.md` has the matching managed `## Agent skills` section; and an existing `CLAUDE.md` is a thin import;
- `tracker_ready` — the selected backend's origin, CLI, and authentication are usable on the current machine. This is separate so expired external authentication does not invalidate local/domain work; Jira-primary operations fail closed when it is false, while Local/Jira may complete locally and record pending synchronization;
- `docs_ready` — the optional docs section is valid and the project-shape-specific required manifest is present;
- `runtime_ready` — the active harness delivers the committed runtime policy.

Consumers require only the capabilities their operation needs. `/ws-matt` requires engineering and current-runtime readiness; tracker operations additionally require tracker readiness according to backend semantics. `/ws-docs` can operate from a valid docs-only partial config.

One versioned JSON Schema file in marketplace source is the executable syntax contract and is packaged into the native omp distribution by generation. Claude Code commands/workers, omp validators, deterministic tests, and reference documentation consume or verify against that same source. Cross-file, project-shape, git-origin, CLI/authentication, and capability checks layer on top of JSON Schema rather than being duplicated in prose implementations.

Validation is fail-closed. Reject malformed YAML, duplicate keys, custom tags, unknown keys at every level, wrong scalar types, invalid enums, duplicate or empty triage labels, secrets, absolute paths, path traversal, and conflicting or non-normalized repository-relative paths. No missing value receives a runtime default. Setup writes every selected value explicitly and preserves comments and ordering outside fields it intentionally changes.

Every incompatible schema change increments `schema_version`. A recognized older version is migration-required: normal consumers stop and direct the user to `/ws-setup`. A version newer than the installed package is never rewritten; consumers stop and direct the user to update the package. Unknown keys in the current version are errors rather than forward-compatible guesses, so adding a newly written field requires a schema-version decision.
