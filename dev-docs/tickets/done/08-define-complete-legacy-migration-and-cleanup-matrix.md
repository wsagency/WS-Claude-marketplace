# Define the complete legacy migration and cleanup matrix

Map: unify-ws-setup-entrypoints
Label: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: 07-define-canonical-ws-project-configuration-schema, 09-define-hub-root-setup-scope-and-transaction-boundaries

## Question

For every known pre-5 marketplace configuration, adapter, context-file block, docs config, runtime-policy artifact, and omp plugin setting, what is the exact canonical destination and precedence; which values migrate automatically or require a choice; how are unsupported custom trackers, unknown fields, dirty overlapping worktrees, and conflicting sources handled; and which repo-local or user-global legacy artifacts are removed, preserved, or left as inert migration inputs after read-back verification?

## Answer

Migration is a fail-closed semantic conversion, not a file copy and not a dual-read compatibility layer. A valid existing `.wsagency/config.yaml` is canonical and remains unchanged unless the user explicitly invokes reconfiguration. Without canonical state, normalized legacy values that agree and have a one-to-one v1 meaning enter the confirmed plan automatically. Conflicting repo-local values, incomplete meanings, malformed or unknown content, and any lossy conversion require an explicit choice before that repository may be written. User-global and machine-local values are hints only.

The precedence is:

1. valid existing `.wsagency/config.yaml`;
2. an explicit user resolution of conflicting repo-local legacy sources;
3. agreeing, deterministic repo-local legacy values;
4. a user-confirmed value suggested by user-global Claude or omp state;
5. a newly selected value.

Modification time, document order, and runtime-specific source order never decide precedence. Known legacy values that differ from an existing canonical value are shown as obsolete in the removal plan; unknown legacy content is preserved until classified.

## Source and field matrix

| Legacy source | v1 destination or disposition | Automatic when unambiguous |
|---|---|---|
| `.claude/ws-project.yaml` `jira.project`, `board`, `default_issue_type` | `jira.project`, optional `jira.board`, `jira.default_issue_type` | yes |
| `.claude/ws-project.yaml` `hooks.session_start_dashboard` | `ui.session_start_dashboard`: `true` becomes `jira_assignments`, `false` becomes `disabled` | yes, only when the resulting Jira cross-field requirements are valid |
| `.claude/ws-project.yaml` `changelog.path`, `skip_types` | `changelog.path`, `changelog.skip_types` | yes after path and list validation |
| `.claude/ws-project.yaml` `changelog.auto_update` plus docs `auto.changelog_per_commit` | `changelog.update_mode` through the cadence table below | yes except conflicts or insufficient evidence |
| `.claude/docs-config.yaml` `docs.user_track`, `dev_track`, `default_audience`, `default_scope`, `auto.adr_for_arch_changes` | the matching `docs` fields | yes after path/enum validation |
| `.claude/docs-config.yaml` `docs.changelog.skip_types` | `changelog.skip_types` | yes when it agrees with any project-config value; otherwise choose |
| `.claude/docs-config.yaml` `initialized`, docs `version` | no destination; readiness and schema version are derived/canonical | discard after verification |
| `.claude/docs-config.yaml` `surface.subagent_status` | no destination; obsolete presentation preference | discard after verification |
| `.claude/docs-config.yaml` `auto.enforce_via_hooks` | canonical docs behavior is fixed when docs policy is configured | `true` is compatible; `false` requires explicit acknowledgement of the v1 behavior |
| `dev-docs/agents/issue-tracker.md` generated tracker identity, Jira key, and PR-surface flag | `tracker.primary`, optional `jira.project`, and `tracker.pull_requests` | yes for Local, GitHub, GitLab, Jira, and Local/Jira when sources agree |
| `dev-docs/agents/triage-labels.md` five semantic label mappings | `triage.labels` | yes for a complete, unique mapping |
| `dev-docs/agents/domain.md`, `CONTEXT.md`, and `CONTEXT-MAP.md` layout evidence | `domain.layout` | yes only when the artifacts identify one layout consistently |
| managed `Agent skills` and `Documentation maintenance` context blocks | new canonical config-reader blocks composed by `/ws-setup` | exact generated blocks are replaced; customized blocks receive a reviewed merge |
| local tickets, their `jira: KEY`/sync metadata, comments, shares, claims, map links, and `open/`/`done/` state | same ticket files and semantics | preserve; never regenerate or move merely for setup |
| legacy local `.scratch/` state | no canonical machine-policy destination | preserve non-empty or unknown content; remove only a proven empty/generated remnant included in the plan |

The changelog cadence conversion is:

| legacy PR update | legacy per-commit update | v1 mode |
|---|---|---|
| `true` | `false` or absent | `pull_request` |
| `false` | `true` | `commit` |
| `false` | `false` or absent | `disabled` |
| absent | `true` | `commit` |
| `true` | `true` | conflict — ask |
| absent | `false` or absent | insufficient to distinguish `pull_request` from `disabled` — ask |

Different legacy `path` or `skip_types` values are independent conflicts even when cadence agrees. Paths must pass the canonical repository-relative normalization and traversal checks before they can be proposed.

Legacy tracker prose that identifies `Other` or a custom workflow has no v1 tracker destination. Setup preserves that adapter untouched and blocks core migration until the user selects Local, GitHub, GitLab, or Jira, or a separately installed concrete adapter becomes supported by a future schema. It never silently substitutes Local and never writes an opaque `custom` value. Likewise, an incomplete tracker identity, ambiguous Git host, invalid origin, duplicate triage labels, or conflicting domain layouts blocks the repository until resolved.

## User-global and machine-local inputs

`~/.claude/ws/config.yaml` is read-only migration input. Legacy `defaults.jira_actions` maps as a suggested `commit.jira.actions` value (`never` to `disabled`, `ask` to `ask`, `always` to `always`); transition, smart-trailer, commit-comment, and dashboard values may preselect their matching repo choices. They are never materialized without the repository's final confirmation. `jira.site`, old `cloud_id`/`account_id`, tokens, identities, and other secrets are never copied: jira-cli remains the sole owner of site/authentication state.

The global file is never deleted by a repository migration because other pre-5 repositories may still need it. v5 consumers stop reading it, so it becomes inert. A release/doctor message may explain manual removal after every repository is migrated, but setup does not infer that global condition.

Native omp settings `jiraProject`, `guard`, and `dashboard`, including the `JIRA_PROJECT` environment fallback, are also machine-local hints only. With no stronger repo value, setup may preselect `jira.project`, `runtime.dangerous_git_guard`, and `ui.session_start_dashboard` for user confirmation. It never edits `omp-plugins.lock.json` or other package-manager-owned state. omp-ws 0.7 removes these manifest settings and all runtime readers; stale lock keys are inert, and doctor reports only a supported omp cleanup command when one exists.

`.omp/config.yml`, `.claude/settings*`, hub OpenWiki hooks/rules, and other user- or hub-owned runtime files are preserved and only inspected for runtime readiness. An exact generated `.omp/rules/omp-edge-discipline.md` is removed because omp-ws now supplies that rule globally. A customized copy is not deleted wholesale: setup presents a reviewed extraction of genuinely project-specific instructions into a project rule and removes only the duplicated graph contract. Other `.omp/rules/ws-*` files remain under their existing hub/runtime ownership.

## Authored adapter and context preservation

An adapter that exactly matches a released generated template is replaced with its v1 config-reader template after its values have been converted. For a customized adapter, setup extracts machine values into canonical config, composes the new non-duplicating adapter, and retains non-conflicting operational prose in an explicit repository-specific section. The complete diff requires confirmation; ambiguous prose blocks replacement rather than being dropped.

Known generated managed blocks in `AGENTS.md` or a legacy fat `CLAUDE.md` are replaced in place while every byte outside those ranges is preserved. If only a fat `CLAUDE.md` carries authored instructions, setup proposes moving them into `AGENTS.md` and leaves a thin `@AGENTS.md` import after a reviewed diff. If both files carry authored instructions that cannot be merged mechanically, setup stops for an explicit merge choice. Existing authored `CONTEXT.md`, `CONTEXT-MAP.md`, decisions, documentation, changelog content, and ticket content are never treated as generated cleanup.

## Local/Jira data migration

A legacy Local/Jira adapter may have mapped only stakeholder-facing tickets, while v1 `jira.sync: all_local_tickets` requires every local ticket to have a Jira counterpart. Setup validates every existing `jira: KEY`, then lists each unmapped open and done ticket and the exact Jira issue it proposes to create. Those external creates are part of the single point-of-risk confirmation, not an implicit post-setup side effect.

Each successful create is followed immediately by writing and verifying its returned Jira key in the local ticket before another create starts. A failed or interrupted item is recorded as pending and stops later work; the recovery report includes any returned remote key so rerun can recover it before considering a new create. Existing mappings are never recreated, and no legacy config source is deleted until the backfill is either verified complete or all incomplete items have durable, non-duplicating recovery state.

## Cleanup and recovery boundary

Repository-local `.claude/ws-project.yaml` and `.claude/docs-config.yaml` deletions are explicit entries in the confirmed plan and are always the final writes for that repository. They occur only after:

1. the canonical config passes strict schema and cross-field validation;
2. every migrated semantic value is read back and compared with its selected source;
3. tracker/domain/triage adapters, shared context blocks, runtime delivery, and any selected docs manifest pass their contract checks;
4. Jira mapping work is verified or durably recoverable; and
5. the pre-write fingerprint still matches the confirmed plan.

Malformed or unknown legacy data remains untouched until the user classifies it or explicitly accepts its removal. A valid canonical config permits an unknown legacy source to remain inert, but never permits automatic deletion of that source. Empty legacy directories disappear naturally when their last tracked file is removed; setup does not delete unrelated `.claude/`, `.omp/`, `dev-docs/`, or authored files.

Hub migrations reuse the manifest, sequential worktree order, dirty-path overlap checks, fingerprint revalidation, first-failure stop, and no-rollback recovery contract defined by the hub transaction decision. On rerun, verified canonical values and already-cleaned sources render as `NO-OP`; preserved or unresolved legacy inputs remain visible; only pending mappings, artifact transformations, and deletions re-enter the plan.
