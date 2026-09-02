# Define the reconfiguration scope and safety contract

Map: unify-ws-setup-entrypoints
Label: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: 07-define-canonical-ws-project-configuration-schema

## Question

After `/ws-setup reconfigure` shows current state and the user selects tracker/Jira, runtime policy, documentation, or all, which choices may change together; what dependency validation and visible diffs are required; how are existing tickets and Jira mappings handled when tracker ownership changes; and what no-data-loss, one-confirmation, failure, and safe-resume guarantees prevent an intentional reconfiguration from disturbing unselected valid domains?

## Answer

`/ws-setup reconfigure` is an intentional-policy-change mode over a known-good baseline. It runs only when the current `.wsagency/config.yaml` is strict-valid at the installed schema version. Missing, legacy, malformed, or recognized older state goes through ordinary `/ws-setup` migration/repair first; a future schema requires a package update. Reconfiguration never doubles as best-effort repair.

At a standalone repo or hub sub-repo, the target is the current repository. At a hub root, setup first shows the hub and eligible `type: working` repositories and requires explicit target selection; the default is the hub only. `all` means every reconfiguration domain in the selected repositories, never every repository. A hub policy change does not propagate to materialized child configs unless those children are explicitly selected.

## Selectable domains

The user selects one or more high-level domains, then the concrete fields to change. Selecting a domain opens choices; it does not reset or rewrite the whole group.

| Domain | Fields and owned effects |
|---|---|
| tracker/Jira | `tracker`, `jira`, `triage`, `domain`, Jira-dependent `commit.jira`, and `ui.session_start_dashboard`; tracker adapters, ticket mappings, semantic labels/statuses, and domain-layout artifacts |
| documentation | `docs` and `changelog`; docs policy/managed instructions, missing-only bootstrap, and any explicitly selected track/changelog path migration |
| runtime | `runtime`; active-harness delivery and verification |

Every unselected field and artifact is `PRESERVE`. Configuration edits are minimal structural patches that retain comments, ordering, and bytes outside selected fields. Shared `AGENTS.md` managed content is composed by domain fragment so changing one domain cannot regenerate an unselected fragment.

Cross-field validation computes a visible dependency closure before writing. If a selected change invalidates an unselected value, setup shows the dependency chain and the smallest valid choices and requires an explicit answer. For example, removing a Jira binding requires the user to disable Jira commit/dashboard behavior or retain a binding with synchronization disabled; changing Jira-primary to Local/Jira requires a valid sync choice. No dependent policy is silently disabled, defaulted, or reset. Cancelling a required dependency cancels that proposed change.

## Tracker and Jira ownership changes

Changing `tracker.primary` requires an explicit disposition for every existing store: preserve the old store as inactive history, copy selected/open/all items to the new tracker, or cancel. Setup never automatically deletes, closes, or moves source issues/tickets. A config-only switch without a stated data disposition is invalid. Every local file creation and every external issue create/import/link appears individually or as an exact reviewable manifest in the final confirmation.

Copies preserve semantic title, description/acceptance criteria, status, priority, type, and comments supported by both trackers. Local-only claims, session shares, Wayfinder map pointers, and agent state remain local and are not uploaded. Unsupported fields are listed before confirmation and preserved through source links or repository-specific notes rather than silently dropped. Imported local tickets record the remote source ID/URL; remote copies of local tickets record the local source slug and a deterministic reconfiguration correlation token.

Local/Jira changes must first resolve pending synchronization and same-field conflicts. Disabling sync retains existing `jira: KEY` values as historical mappings and performs no remote closure. Enabling `all_local_tickets` uses the confirmed complete backfill contract. Changing `jira.project` with active mappings requires an explicit choice: disable sync and preserve old keys as history, or create confirmed copies in the new project and switch active mappings after verification. Setup never automatically cross-project-moves, closes, or deletes the old Jira issues. Old active keys are retained as historical comments/links when a new key becomes active.

Changing triage labels produces a semantic-role migration manifest. Every old label/status is mapped by `needs_triage`, `needs_info`, `ready_for_agent`, `ready_for_human`, or `wontfix`, regardless of its literal string. Local ticket status diffs are required; remote add/remove operations are listed and confirmed. New labels are added before cutover and old labels are removed from affected items only after cutover verification. Unknown or multi-role conflicts require resolution. Setup never globally deletes a tracker label because it may be used outside the WS scope.

A claimed local ticket, unresolved Local/Jira conflict, or pending sync blocks only an affected ownership, project, mapping, or triage migration. The user must finish/release the claim or resolve synchronization first. Unrelated commit/dashboard, documentation, and runtime changes may proceed. Remote assigned/in-progress items are displayed and revalidated, but are never silently reassigned.

Changing `tracker.pull_requests` does not mutate or close PRs. Enabling triage makes matching existing open PRs visible to the configured queue; disabling it stops treating them as requests. The before/after query scope and current affected count are part of the plan.

## Domain and documentation content

Changing `domain.layout` requires a user-confirmed content migration manifest: contexts, `CONTEXT.md`/`CONTEXT-MAP.md` source-to-destination paths, decision-document routing, and collision decisions. The new layout is prepared and verified before config cutover. Authored source content moves only after destination read-back succeeds; ambiguous or unmapped content remains and blocks completion. Setup never guesses bounded-context semantics by concatenating or splitting prose.

Documentation policy-only changes (`default_audience`, `default_scope`, ADR policy, changelog cadence, and skip types) update only canonical policy and the relevant managed instruction fragment. Enabling docs runs the reusable missing-only bootstrap contract. Disabling docs removes only the `docs` policy and its enforcement; all existing documentation is preserved.

Changing `user_track`, `dev_track`, or `changelog.path` requires an explicit source-to-destination and collision manifest. The destination is created/copied and validated before config cutover; an authored source is removed only when the user selected a move and semantic read-back succeeds. A path change cannot leave canonical config pointing at a missing artifact. Changelog mirror and managed-reference updates are named separately in the diff.

`runtime.dangerous_git_guard: enabled` requires installation or verification of delivery in the active harness before cutover. `disabled` means the repository no longer requires the guard; it does not mean globally uninstalling or disabling a shared omp extension, Claude plugin hook, or user rule that protects other repositories. Cleanup may remove only an exact repo-owned generated delivery whose sole purpose is the now-disabled policy and whose deletion appears in the confirmed diff. `session_discipline: required` remains mandatory.

## Plan, authorization, and drift

The read-only plan includes:

- current and proposed canonical config with field-level reasons;
- every required dependency expansion and every unselected `PRESERVE`;
- local file creates, copies, moves, managed-range edits, and removals;
- exact external create, comment, link, relabel, or mapping operations and affected counts;
- machine-global or harness actions;
- tracker/domain/docs/runtime readiness before and expected after; and
- the operation journal and audit-log writes.

One final point-of-risk confirmation authorizes exactly that plan. A changed remote target set, newly required dependency, or different payload invalidates authorization and requires a new plan and confirmation.

Local targets use the established HEAD/status/file fingerprints and dirty-overlap rules. Remote targets record issue/PR ID, update timestamp or version, and hashes of every relevant mapped field. Setup re-fetches each remote item immediately before mutation. Any local or remote drift stops before that item; it never best-effort merges against a state the user did not approve.

## Transaction and safe resume

After confirmation, the scope root receives a transient `.wsagency/reconfigure-state.yaml`. It is operational recovery state, not configuration or readiness: it contains no secrets, and records the plan hash, confirmed scope, fingerprints, phase, per-item source/destination IDs, correlation tokens, and completion status. While it exists, WS consumers fail closed only for the affected domains and point to `/ws-setup reconfigure` to resume; unaffected domains remain usable. A new reconfiguration cannot start over an existing journal.

Each remote create contains the journal's deterministic per-item correlation token in a non-user-visible metadata marker or documented source-link field. The returned remote ID is persisted to the journal before another external action begins. On retry, setup resolves the token and recorded ID before considering a create, preventing duplicates across interruption boundaries.

Execution uses three phases:

1. **Prepare.** Perform machine/runtime prerequisites; create additive destination ticket/docs/domain artifacts; create remote copies and links; add new semantic labels without removing old ones; and verify all prepared destinations. The existing canonical ownership contract remains active.
2. **Cut over.** Patch and validate canonical config, switch active mappings, and update the corresponding tracker/domain/docs adapters and managed context fragments. The journal marks cutover progress after every verified artifact. If a multi-file cutover is incomplete, affected consumers remain blocked by the journal rather than operating against mixed ownership.
3. **Clean up.** Remove old active labels, explicitly moved source paths, and exact obsolete generated delivery; preserve all tracker source stores and anything not authorized for removal; then derive readiness and verify the complete selected scope.

Writes remain sequential per repository and in the hub transaction order. The first failed write, verification, external operation, or drift check stops later work. There is no rollback. Before cutover, the old config remains authoritative and prepared destinations are preserved as recoverable copies. After cutover starts, the journal makes the new or transitioning ownership explicit and carries only remaining adapter/cleanup work.

Rerunning `/ws-setup reconfigure` with an incomplete journal offers two choices: resume the remaining confirmed plan after revalidation, or review and explicitly accept the current partial state. It never offers automatic rollback. Accepting partial state cannot delete remote/source data; it removes only safe transient local artifacts, and is allowed only if the retained canonical config and required adapters pass strict validation/readiness. Otherwise resume is mandatory.

Before deleting the journal, setup appends an English, secret-free audit entry to `dev-docs/agents/reconfiguration-log.md` in each changed repository; a hub-coordinated run also appends a project summary in the hub log. The entry records date, selected domains, source/destination IDs or links, config diff summary, completed/preserved/pending work, and whether the result completed normally or was explicitly accepted as partial. It does not duplicate issue bodies or authentication data.

The final report names every completed, preserved, skipped, pending, failed, and no-op field/artifact/remote operation and states which ownership contract is active. An aligned re-run with no selected difference writes nothing and requires no confirmation.
