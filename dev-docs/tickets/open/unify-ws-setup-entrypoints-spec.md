# Unify WS setup entry points

**What to build:** Replace the separate WS initialization conventions with one discovery-driven `/ws-setup` command that configures, migrates, reconfigures, verifies, and safely resumes WS project setup across Claude Code and omp.

**Blocked by:** None — the Wayfinder map and all linked decision tickets are resolved.

## Problem Statement

WS project setup is currently split across a Jira-oriented `/ws-init` command and a separate `/ws-matt setup` skill flow. They own overlapping settings through several global, repository-local, documentation, adapter, context-file, and runtime artifacts. Their consumers read different sources, Jira is treated as a prerequisite in places where local work should remain possible, and neither entry point provides one complete view of the changes needed for a standalone repository, a project hub, or a working repository inside a hub.

This fragmentation makes first-run setup difficult to understand and makes existing repositories risky to upgrade. Users cannot reliably tell which file owns a choice, whether a re-run will preserve customization, which repositories a hub operation will touch, or how to continue after a partial failure. Claude Code and omp can also drift because the native omp package is generated from the marketplace source while runtime-specific settings remain outside a canonical project contract.

The project needs one public setup entry point, one committed machine-readable project configuration, explicit capability readiness, a lossless migration path for every known pre-5 setup, and a deterministic transaction contract that proves the same behavior across both harnesses. The cutover must remove the old conventions completely rather than retaining aliases or dual-read compatibility.

## Solution

Provide `/ws-setup` as the sole public WS project setup command. It discovers the current repository or hub scope without writing, asks only questions that cannot be answered from valid existing state, validates the complete dependency chain, renders one categorized manifest with exact diffs and side effects, obtains one final confirmation, executes ordered idempotent writes, verifies each result, and reports completed and pending work. An aligned re-run is prompt-free and returns `No changes required`; a failed run safely resumes from rediscovered state without rollback.

Store all committed WS machine policy in a strict, versioned `.wsagency/config.yaml`. Local Markdown is the default primary tracker; GitHub Issues, GitLab Issues, and Jira are supported primary trackers, while Local Markdown may optionally synchronize every ticket with Jira at tracker-operation boundaries. Jira authentication and site configuration remain outside the repository under jira-cli ownership. Readiness is derived separately for configuration, engineering artifacts, tracker integrations, documentation, and the active runtime rather than persisted as a completion flag.

Use two internal workers behind the public command. The project-bootstrap worker owns tracker, triage, domain, and runtime-policy adapters and templates. The docs-bootstrap worker owns one reusable, project-shape-aware, missing-only documentation initialization contract shared with `/ws-docs init`. `/ws-setup` remains the sole composer of shared context-file changes in the unified flow, so workers never race to edit the same artifact and no entry node invokes another entry node.

For hub roots, build one cross-repository manifest covering the hub and locally present `type: working` repositories while explicitly excluding input and output repositories. Validate all selected targets before confirmation, then write sequentially in registry order with fingerprint revalidation and first-failure stop. For intentional changes to an already valid setup, expose `/ws-setup reconfigure` with explicit repository, domain, and field selection, visible dependency expansion, data-disposition choices, remote drift guards, a transient operation journal, and a prepare-cutover-cleanup transaction.

Migrate every known pre-5 repository format through deterministic, fixture-backed semantic mappings. Preserve authored content and customized values, fail closed on ambiguity or unsupported custom trackers, and remove repository-local legacy configuration only after canonical read-back and cross-file verification. After the clean cutover, every WS consumer reads only the canonical config and directs legacy repositories to `/ws-setup` instead of guessing defaults.

## User Stories

1. As a WS developer entering a new repository, I want one setup command, so that I do not need to understand multiple initialization conventions.
2. As a WS developer, I want setup to summarize the detected project shape before asking questions, so that I understand the scope of the operation.
3. As a WS developer, I want setup discovery to be read-only, so that inspecting current state cannot partially configure my repository.
4. As a WS developer, I want setup to detect whether I am in a standalone repository, hub root, or hub working repository, so that it proposes the correct targets.
5. As a WS developer outside a git repository, I want a clear explanation and the choice to create one or stop, so that setup does not silently initialize git.
6. As a WS developer creating a repository through setup, I want the origin URL validated before confirmation, so that the resulting repository is usable and correctly bound.
7. As a WS developer, I want setup to ask only unresolved questions, so that a valid existing configuration is not reopened unnecessarily.
8. As a WS developer, I want recommended local-first defaults on a new repository, so that I can start useful agent work without external services.
9. As a WS developer, I want optional choices to be visibly skipped when unavailable, so that missing optional integrations do not block core setup.
10. As a WS developer, I want one complete categorized plan before any write, so that I can review the full effect of setup.
11. As a WS developer, I want every planned item classified as `CREATE`, `UPDATE`, `PRESERVE`, `SKIP`, `NO-OP`, or blocking conflict, so that no effect is hidden.
12. As a WS developer, I want exact diffs for existing files and managed ranges, so that I can distinguish generated changes from preserved authored content.
13. As a WS developer, I want one final confirmation to authorize all local, machine, worker, and external operations, so that downstream workers do not ask again.
14. As a WS developer, I want authorization invalidated when the planned target set or payload changes, so that confirmation never applies to stale state.
15. As a WS developer, I want an aligned re-run to print `No changes required` without choices or confirmation, so that setup is safely idempotent.
16. As a WS developer, I want a normal re-run to repair only missing or invalid state, so that valid customization remains untouched.
17. As a WS developer, I want intentional policy changes separated into `reconfigure`, so that ordinary reconciliation cannot reset valid choices.
18. As a team member, I want the committed project configuration to contain no secrets, so that it can be reviewed and shared safely.
19. As a team member, I want one versioned canonical configuration for Claude Code and omp, so that both harnesses interpret the same repository policy.
20. As a configuration maintainer, I want strict unknown-key and type validation, so that misspellings and unsupported future fields fail visibly.
21. As a configuration maintainer, I want duplicate YAML keys, custom tags, malformed values, and path traversal rejected, so that parsing cannot produce ambiguous policy.
22. As a configuration maintainer, I want every present section to be complete, so that consumers never invent runtime defaults for missing values.
23. As a documentation-only user, I want a schema-valid docs-only partial configuration, so that `/ws-docs` does not need to invent engineering choices.
24. As an engineering-flow user, I want core readiness to require all engineering sections and adapters, so that a docs-only config cannot masquerade as full setup.
25. As a WS consumer, I want readiness derived from current files and machine capabilities, so that stale completion flags cannot report false success.
26. As a WS consumer, I want configuration, engineering, tracker, documentation, and runtime readiness reported separately, so that failures block only the capabilities they affect.
27. As a user with expired external authentication, I want unaffected local and documentation work to remain available, so that an integration outage does not invalidate the whole repository.
28. As an omp user, I want setup to verify the active runtime policy locally, so that committed team policy is not confused with machine installation state.
29. As a Claude Code user, I want the same project policy and setup behavior as omp, so that switching harnesses does not change repository semantics.
30. As an agent, I want operational adapter documents to read values from canonical config, so that machine policy is not duplicated in prose.
31. As an agent, I want the issue tracker, triage vocabulary, and domain layout adapters present when engineering-ready, so that every graph node shares the same operational contract.
32. As a new repository owner, I want Local Markdown selected by default, so that tickets can be managed without CLI round trips.
33. As a repository owner, I want GitHub Issues selectable when the validated origin identifies GitHub, so that the existing tracker can remain authoritative.
34. As a repository owner, I want GitLab Issues selectable when the validated origin identifies GitLab, so that the existing tracker can remain authoritative.
35. As a Jira-first team, I want Jira selectable as the primary tracker only after authentication succeeds, so that setup cannot leave an unusable tracker contract.
36. As a local-first team, I want optional all-ticket Local/Jira synchronization, so that agents retain a fast local store while stakeholders see Jira issues.
37. As a local-first team, I want every local ticket mapped when Jira synchronization is enabled, so that tracker ownership is explicit and complete.
38. As a tracker user, I want synchronization before and after each tracker operation, so that no daemon or separate public sync command is required.
39. As a tracker user, I want title, description, acceptance criteria, status, comments, priority, and type synchronized semantically, so that equivalent fields remain aligned across systems.
40. As an agent, I want claims, session shares, map pointers, and agent state kept local, so that internal workflow metadata is not disclosed to Jira.
41. As a tracker user, I want same-field Local/Jira conflicts to stop before overwrite and show both sides, so that I can choose Local, Jira, or a manual merge.
42. As a tracker user during a Jira outage, I want the local operation to complete and record pending synchronization, so that work can continue without losing eventual consistency.
43. As a tracker user, I want pending synchronization retried before the next tracker operation, so that recovery is automatic at a safe boundary.
44. As a repository owner, I want unsupported custom tracker prose preserved and core migration blocked, so that setup never silently substitutes a different tracker.
45. As a repository owner, I want external pull-request intake controlled independently from tracker selection, so that enabling a tracker does not unexpectedly change the triage queue.
46. As a repository owner, I want Jira-aware commit actions and the session dashboard to require an explicit Jira binding, so that dependent features cannot be accidentally enabled.
47. As a Jira user, I want jira-cli to remain the sole owner of site, identity, token, and authentication state, so that secrets never enter repository config.
48. As a Jira user, I want setup to avoid live Jira writes until the final point-of-risk confirmation, so that discovery and validation remain harmless.
49. As a documentation user, I want optional full documentation bootstrap included in the setup plan, so that user and internal tracks can be initialized together.
50. As a documentation user, I want bootstrap to create only missing artifacts, so that authored documentation is never regenerated during setup.
51. As a documentation user, I want existing documentation and customized policy preserved, so that a setup re-run cannot erase editorial work.
52. As a documentation maintainer, I want `/ws-setup` and `/ws-docs init` to share one internal docs-bootstrap contract, so that initialization semantics cannot drift.
53. As a graph maintainer, I want `/ws-setup` to invoke the docs worker directly rather than another entry node, so that entry-to-worker ownership remains valid.
54. As a repository maintainer, I want one component to compose shared `AGENTS.md` and thin `CLAUDE.md` changes, so that independent workers never write overlapping files.
55. As a repository maintainer, I want known managed blocks replaced in place while surrounding bytes are preserved, so that authored instructions survive migration.
56. As a repository maintainer with authored instructions only in a fat `CLAUDE.md`, I want a reviewed move into canonical `AGENTS.md`, so that the thin-import convention is restored without data loss.
57. As a repository maintainer with conflicting authored instructions in both context files, I want setup to stop for an explicit merge decision, so that prose is not guessed or dropped.
58. As a runtime-policy owner, I want session discipline and dangerous-git guard requirements committed as policy, so that repository expectations are reviewable.
59. As a runtime-policy owner, I want setup to install or verify the required active-harness delivery before reporting readiness, so that policy is enforced rather than merely declared.
60. As an omp user, I want obsolete exact generated rule duplicates removed when the native package already supplies them, so that graph discipline is not registered twice.
61. As an omp user with a customized rule, I want project-specific prose extracted and preserved before duplicate contract text is removed, so that cleanup is lossless.
62. As an existing pre-5 user, I want plain `/ws-setup` to discover and migrate legacy state, so that no separate update command is required.
63. As an existing pre-5 user, I want every known released configuration and adapter format supported by direct migration, so that upgrades do not depend on the immediately preceding release.
64. As an existing pre-5 user, I want canonical values to take precedence over legacy values, so that valid new configuration cannot be overwritten.
65. As an existing pre-5 user, I want agreeing one-to-one repository-local values migrated automatically within the confirmed plan, so that unambiguous upgrades remain efficient.
66. As an existing pre-5 user, I want conflicting repository-local values presented for explicit resolution, so that timestamps or source order never guess ownership.
67. As an existing pre-5 user, I want user-global and machine-local values treated only as suggested choices, so that one repository cannot inherit another repository's policy silently.
68. As an existing pre-5 user, I want every recognized customized value preserved, so that migration is semantic conversion rather than template replacement.
69. As an existing pre-5 user, I want unknown fields, malformed content, ambiguous prose, and unsupported trackers to block writes, so that setup fails closed.
70. As an existing pre-5 user, I want local tickets, comments, claims, shares, mappings, and open/done state preserved, so that configuration migration does not rewrite working history.
71. As an existing pre-5 Local/Jira user, I want existing keys validated and unmapped tickets listed before backfill, so that all external creates are reviewable.
72. As an existing pre-5 Local/Jira user, I want each returned Jira key persisted and verified before the next create, so that interruption cannot duplicate remote issues.
73. As an existing pre-5 user, I want repository-local legacy files removed only after canonical and dependent artifact verification, so that cleanup cannot destroy the recovery source.
74. As an existing pre-5 user, I want user-global legacy configuration left untouched, so that repositories not yet migrated can still use it.
75. As a WS consumer after the cutover, I want legacy state to fail closed and point to `/ws-setup`, so that no command continues with guessed defaults.
76. As a hub owner, I want setup at the hub root to show the complete repository scope before choices, so that cross-repository work is explicit.
77. As a hub owner, I want the hub configuration to propose defaults rather than act as runtime inheritance, so that each working repository remains independently understandable.
78. As a working-repository owner, I want valid explicit child values to win over hub defaults, so that hub setup preserves local customization.
79. As a working-repository owner, I want hub defaults materialized only for missing choices, so that later hub changes cannot rewrite my repository implicitly.
80. As a hub owner, I want the initial manifest to include the hub and locally present `type: working` repositories in registry order, so that coverage is predictable.
81. As a hub owner, I want input and output repositories displayed as excluded, so that their omission is visible rather than accidental.
82. As an input/output repository owner, I want setup to avoid cloning or initializing repo-local WS state in my repository, so that data and generated-output boundaries remain intact.
83. As a hub owner, I want to remove an eligible working repository from the final plan, so that a blocked target can be repaired separately.
84. As a hub owner, I want malformed, missing, escaping, non-git, or inaccessible selected repositories to block the plan until repaired or excluded, so that setup never writes into an unsafe target.
85. As a hub owner, I want unrelated dirty files named but allowed, so that safe setup does not require a perfectly clean worktree.
86. As a hub owner, I want modified planned paths and uncertain managed-range overlaps to block only the affected repository, so that authored work is not merged automatically.
87. As a hub owner, I want all selected targets preflighted before one confirmation, so that I know the complete cross-repository blast radius.
88. As a hub owner, I want machine-global prerequisites performed once before repository writes, so that shared setup is not repeated per worktree.
89. As a hub owner, I want repository writes executed sequentially in registry order, so that first-failure stop is real rather than best effort.
90. As a hub owner, I want core setup completed before any optional docs sweep begins, so that documentation cannot mask an incomplete engineering setup.
91. As a hub owner, I want each worktree fingerprint revalidated immediately before its first write, so that the confirmed plan cannot apply after drift.
92. As a hub owner, I want later repositories left pending after the first failure, so that the recovery report has an exact boundary.
93. As a hub-sub-repository user, I want setup scope limited to the current repository and hub-owned product targets named as untouched, so that a local invocation cannot fan out unexpectedly.
94. As a configured repository owner, I want `reconfigure` to require a strict-valid current schema, so that policy changes are based on a trustworthy baseline.
95. As a hub owner using `reconfigure`, I want repository selection before domain selection and the hub as the default target, so that `all` never means every repository implicitly.
96. As a configured repository owner, I want to choose tracker/Jira, documentation, runtime, and concrete fields independently, so that changing one value does not reset its whole section.
97. As a configured repository owner, I want every unselected field, artifact, and managed fragment marked `PRESERVE`, so that minimal-diff intent is enforceable.
98. As a configured repository owner, I want dependency closure shown before writing, so that a selected change cannot silently disable dependent policies.
99. As a configured repository owner, I want cancelling a required dependency to cancel the proposed change, so that setup does not force a broader reconfiguration.
100. As a tracker owner changing the primary backend, I want an explicit preserve, copy, or cancel disposition for every existing store, so that tickets are never invisibly abandoned.
101. As a tracker owner, I want source tickets and issues preserved by default, so that reconfiguration never automatically deletes, closes, or moves history.
102. As a tracker owner, I want copied data and unsupported fields listed before confirmation, so that semantic loss is visible and source links remain available.
103. As a Local/Jira owner changing bindings, I want pending synchronization and same-field conflicts resolved first, so that reconfiguration starts from a coherent mapping state.
104. As a Jira owner changing projects, I want an explicit choice to preserve old keys as history or create verified copies in the new project, so that issues are never cross-project moved automatically.
105. As a triage owner changing labels, I want migration based on semantic roles rather than literal strings, so that all affected items retain their meaning.
106. As a triage owner, I want new labels added before cutover and old labels removed only from affected items after verification, so that queues remain usable throughout migration.
107. As a domain owner changing layout, I want an explicit context and decision-routing manifest, so that setup never guesses bounded-context semantics.
108. As a documentation owner changing configured paths, I want source, destination, collision, copy/move, mirror, and managed-reference effects reviewed, so that config never points to missing artifacts.
109. As a documentation owner disabling docs policy, I want existing documentation preserved, so that disabling enforcement is not mistaken for deleting content.
110. As a runtime owner disabling a project requirement, I want shared global protection left installed for other repositories, so that local policy cannot weaken the machine globally.
111. As a reconfiguration user, I want remote issue and PR fingerprints re-fetched immediately before mutation, so that stale authorization stops before side effects.
112. As a reconfiguration user, I want a transient operation journal with deterministic correlation tokens, so that interrupted external creates cannot be duplicated.
113. As a reconfiguration user, I want prepare, cutover, and cleanup phases, so that the active ownership contract remains explicit throughout the transition.
114. As a reconfiguration user, I want affected consumers to fail closed while cutover is incomplete, so that they cannot operate against mixed ownership.
115. As a reconfiguration user, I want to resume the confirmed remainder or explicitly accept a valid partial state, so that recovery does not require rollback.
116. As a repository maintainer, I want a durable, secret-free reconfiguration audit entry before the transient journal is removed, so that future maintainers can explain the resulting ownership.
117. As a user after any failure, I want a report of completed, failed, pending, preserved, skipped, excluded, and no-op work, so that the next safe action is unambiguous.
118. As a user after any failure, I want setup to state explicitly that no rollback occurred, so that I do not assume completed writes were reverted.
119. As a user resuming setup, I want completed verified work rediscovered as aligned and excluded from the new write plan, so that recovery is idempotent.
120. As a product user, I want `/ws-init` and `/ws-matt setup` removed without aliases, so that only one setup convention survives.
121. As a graph user, I want `/ws-setup` outside the `/ws-matt` router with worker-only edges, so that entry-node routing remains acyclic.
122. As a WS command user, I want help, status, commit, docs, hooks, dashboards, and runtime helpers to agree on the new configuration, so that no consumer preserves a hidden legacy path.
123. As an omp user, I want the generated package to include `/ws-setup` and both internal workers, so that the native package remains complete.
124. As an omp user, I want the generated package to omit every legacy setup command, skill, route, setting, and reference, so that installation cannot expose duplicate conventions.
125. As a Claude Code user, I want the marketplace release to expose the same source-authored setup surface as omp, so that both distributions remain behaviorally aligned.
126. As a release maintainer, I want versioned released fixtures rather than fixtures generated by the implementation, so that migration tests can detect regressions honestly.
127. As a release maintainer, I want the actual marketplace checkout and npm tarball tested in isolated installations, so that source-tree success is not mistaken for package success.
128. As a release maintainer, I want Jira write scenarios to use a deterministic fake adapter, so that verification cannot mutate stakeholder systems.
129. As a release maintainer, I want permanent positive and absence gates for source and generated surfaces, so that old setup conventions cannot return.
130. As a release maintainer, I want the native package published and verified before the marketplace tag, so that the documented release pair can actually be installed.
131. As an existing user, I want one canonical migration guide linked from all release surfaces, so that upgrade instructions do not drift across duplicated prose.
132. As an existing user, I want the migration guide to require a verified no-op rerun, so that I have observable proof the repository reached stable canonical state.

## Implementation Decisions

1. **Public surface and clean cutover.** `/ws-setup` is the only user-invocable project setup entry. The old Jira initializer, the setup route under `/ws-matt`, and the legacy setup skill are removed without aliases, forwarding stubs, or deprecation shims. The canonical graph presents `/ws-setup` as an entry with edges only to its internal workers. Help, references, graph documentation, prerequisites, install guidance, release communication, and generated package metadata make the same replacement.

2. **Single orchestration owner.** The public command owns discovery, unresolved-choice collection, validation, complete planning, the one confirmation boundary, ordered dispatch, verification, and reporting. It may invoke the internal project-bootstrap and docs-bootstrap workers, but it never invokes another entry node. The project-bootstrap worker owns core tracker, triage, domain, and runtime-policy artifacts. The docs-bootstrap worker owns documentation-specific missing-only artifacts and returns its shared-context fragment to the caller.

3. **Discovery-driven reconcile state machine.** Ordinary `/ws-setup` runs Discover, Collect Choices, Validate, Plan and Confirm, Apply, Verify, and Report. Discovery, choice collection, validation, and planning are read-only. Apply starts only after one complete confirmation. Every write is idempotent, non-destructive, read back, and verified before dependent work continues. There is no automatic rollback; the first failure stops later work and a re-run rediscovers actual state.

4. **Project-shape scope.** Standalone setup targets the current repository. A hub-sub-repository invocation also targets only the current repository and identifies hub-owned product artifacts as untouched. A hub-root invocation builds one manifest for the hub and every registered, locally present `type: working` repository in registry order. Registered input and output repositories are inspected only enough to validate and explain exclusion. Setup does not clone repositories or create product docs/explained output repositories.

5. **Canonical configuration contract.** The committed `.wsagency/config.yaml` is the sole machine-readable WS project policy for Claude Code and omp. Version 1 is a strict snake_case YAML envelope. It owns tracker primary and pull-request intake; the five semantic triage label mappings; domain layout; Jira-aware commit behavior; changelog mode, path, and skip types; session dashboard behavior; session discipline and dangerous-git guard policy; optional Jira binding and synchronization; and optional docs policy. Jira site, identity, tokens, authentication, and machine installation state are excluded.

6. **Schema and capability validation.** One packaged JSON Schema is the executable syntax contract for both harnesses, deterministic tests, and reference validation. Additional validators enforce cross-field, path, project-shape, git-origin, CLI/authentication, and machine capability invariants. Validation rejects malformed YAML, duplicate keys, custom tags, unknown keys, wrong types, invalid enums, duplicate or empty semantic labels, secrets, absolute or traversing paths, and conflicting normalized paths. Missing values receive no runtime defaults. Recognized older schemas require migration; future schemas require a package update and are never rewritten.

7. **Partial configuration and derived readiness.** Only `schema_version` is required at the envelope level, while each present section must be complete. This permits docs-only policy without fabricated engineering values. `config_valid`, `engineering_ready`, `tracker_ready`, `docs_ready`, and `runtime_ready` are derived from current configuration, artifacts, integrations, and runtime delivery. No initialized date, completion marker, or project-wide readiness flag is persisted. Consumers require only the capabilities their operation needs.

8. **Tracker contract.** Supported primary trackers are Local Markdown, GitHub Issues, GitLab Issues, and Jira. Local Markdown is the default for a new repository. GitHub and GitLab identity derive from the validated origin; Jira identity derives from the explicit Jira section. Adapter locations remain conventions rather than user-configurable paths. A generic custom tracker is not exposed until a concrete, validated adapter has an executable schema contract.

9. **Local/Jira synchronization.** Local Markdown may enable all-ticket Jira synchronization. Synchronization runs before and after each tracker operation, with no daemon and no separate public sync command. Explicit semantic mappings cover title, description and acceptance criteria, status, comments, priority, and ticket type. Claims, shares, map pointers, and agent state remain local. Same-field concurrent changes stop before overwrite and require Local, Jira, or manual-merge resolution. Jira outage permits the local operation and records pending sync, which the next tracker operation retries first.

10. **Jira dependency rules.** Jira-primary setup requires working jira-cli authentication before the write boundary and allows no silent fallback. Jira-primary requires synchronization disabled. All-ticket synchronization is valid only with Local primary. Jira commit actions and Jira assignment dashboard behavior require a Jira binding. A Jira section may remain with synchronization disabled when it supports commit behavior, dashboard behavior, or an explicitly preserved binding.

11. **Documentation bootstrap ownership.** One project-shape-aware docs-bootstrap worker implements the complete initialization contract shared by `/ws-setup` and `/ws-docs init`. Under `/ws-setup`, the complete docs manifest, preserved artifacts, conflicts, dispatches, and shared-file effect appear before the single confirmation; the worker receives that confirmed manifest and never prompts. It creates only missing artifacts and preserves existing authored documentation. Regeneration and catch-up remain separate documentation operations.

12. **Shared context-file composition.** The setup orchestrator composes the project-bootstrap and docs-bootstrap fragments into one managed update. Known managed ranges are replaced precisely while authored content outside them is preserved. Canonical `AGENTS.md` owns instructions and `CLAUDE.md` remains a thin import. Fat or conflicting legacy context files require reviewed migration rather than automatic prose merging.

13. **Runtime policy.** Canonical runtime fields express team policy, not detected machine state. The active harness must deliver required session discipline and the selected dangerous-git guard policy before `runtime_ready` succeeds. Disabling a repository requirement never means uninstalling a shared global protection used by other repositories. Exact redundant generated deliveries may be removed only through confirmed cleanup; customized runtime prose is preserved through reviewed extraction.

14. **Hub configuration model.** A hub's canonical config governs hub workflows and proposes defaults to working repositories; it is not runtime inheritance. Every selected working repository owns a complete materialized config. Valid explicit child values win, hub defaults fill only missing choices, and later hub changes do not rewrite children implicitly. Aligning configured children requires explicit reconfiguration.

15. **Hub transaction.** Hub discovery and planning cover the complete manifest before authorization. Preflight validates registry schema, normalized paths, type/purpose constraints, independent git worktrees, origins, canonical and legacy configuration, exact planned files and ranges, and dirty overlap. Unrelated dirty files are reported but allowed; dirty planned paths or uncertain managed-range overlap block that target. After confirmation, machine-global prerequisites run once, hub core writes run first, working repositories run sequentially in registry order, and optional documentation runs only after every selected core target succeeds.

16. **Fingerprint and failure boundary.** Each selected target records git HEAD, status, and hashes of existing planned artifacts. The fingerprint is revalidated immediately before the first write in that worktree. Drift stops before touching the target and leaves it and all later targets pending. Setup creates no commits, branches, worktree locks, or rollback machinery. Recovery is each verified artifact inside one worktree while authorization remains the complete cross-repository plan.

17. **Legacy migration precedence.** Migration is semantic conversion, not file copy or dual-read compatibility. Precedence is: valid canonical config; explicit user resolution of conflicting repository-local inputs; agreeing deterministic repository-local values; user-confirmed suggestions from global or machine state; newly selected values. Modification time, document order, and runtime source order never decide. Unknown, malformed, incomplete, ambiguous, or lossy state fails closed.

18. **Legacy field conversion.** Known Jira project binding, board, issue type, dashboard, changelog, documentation, tracker identity, pull-request intake, triage labels, domain layout, context blocks, and runtime hints map to explicit v1 meanings. Contradictory changelog booleans convert through the resolved truth table and require a choice when ambiguous. Obsolete presentation and completion markers have no destination. Secrets and Jira site/identity data are never copied. User-global Claude and omp settings are read-only hints and are never deleted or edited by repository setup.

19. **Authored-state preservation and cleanup.** Ticket stores, mappings, comments, shares, claims, map links, context/domain prose, decisions, documentation, and changelog content remain authored state. Exact released generated adapters may be replaced after their values migrate; customized adapters receive a reviewed merge that retains non-conflicting operational prose. Repository-local legacy configuration deletion is an explicit final plan item allowed only after canonical schema, semantic read-back, adapters, shared context, runtime, selected docs, Jira recovery, and fingerprints verify. Unknown legacy sources remain inert until classified.

20. **Legacy Local/Jira backfill.** Enabling v1 all-ticket synchronization audits every existing key and lists each unmapped open and done ticket plus its proposed Jira issue before confirmation. Each remote create is followed immediately by durable local key persistence and verification before another create. Interrupted work retains enough returned-ID or correlation evidence to resume without duplicates. Legacy sources are not deleted until backfill is complete or every incomplete item is durably recoverable.

21. **Reconfiguration precondition and scope.** `/ws-setup reconfigure` operates only on a strict-valid installed-schema baseline. Missing, malformed, legacy, or older state must first pass ordinary setup migration or repair. A standalone or hub-sub-repository invocation targets the current repository. At a hub root, repository selection comes first with hub-only as the default. `all` means all reconfiguration domains in selected repositories, never all repositories.

22. **Reconfiguration domains and minimal patches.** Selectable domains are tracker/Jira, documentation, and runtime. The user then selects concrete fields; selecting a domain does not reset the whole section. Tracker/Jira includes tracker, Jira, triage, domain, Jira-dependent commit behavior, and dashboard effects. Documentation includes docs and changelog policy and path effects. Runtime includes active-harness delivery. Unselected fields, artifacts, and managed fragments are `PRESERVE`; structural patches retain comments, order, and bytes outside selected fields.

23. **Visible dependency closure.** Cross-field validation computes and displays the smallest valid dependency expansion. A dependent unselected value is never silently disabled, defaulted, or reset. The user must accept the dependent choice, retain a compatible binding, or cancel the proposed change. Authorization covers the resulting exact closure, not the initial selection alone.

24. **Tracker ownership migration.** Changing primary tracker requires an explicit disposition for every store: preserve as inactive history, copy selected/open/all items, or cancel. Source issues and tickets are never automatically deleted, closed, moved, or reassigned. Copies preserve shared semantic fields, list unsupported fields, retain source links or repository notes, and use deterministic correlation tokens. Claimed work, pending sync, and unresolved same-field conflicts block only the affected migration.

25. **Jira, triage, domain, and docs reconfiguration.** Changing a Jira project with active mappings requires preserving old keys as history with sync disabled or creating confirmed verified copies and switching mappings after verification; old issues are not cross-project moved or deleted. Triage label migration maps semantic roles, adds new labels before cutover, and removes old labels only from affected items after verification. Domain layout changes require an explicit context, artifact-routing, and collision manifest. Docs policy-only changes remain policy-only; docs enablement runs missing-only bootstrap; disabling docs preserves content; track and changelog path changes require explicit source/destination and copy/move manifests.

26. **Reconfiguration drift and journal.** The plan includes current/proposed field reasons, dependencies, local mutations, external operations, machine actions, readiness expectations, journal writes, and audit writes. Local fingerprints use the setup transaction contract. Remote fingerprints include IDs, versions or update timestamps, and relevant mapped-field hashes; each item is re-fetched immediately before mutation. A transient, secret-free journal stores the confirmed plan hash, scope, fingerprints, phase, item IDs, correlation tokens, and completion status. A new reconfiguration cannot start while a journal exists.

27. **Prepare-cutover-cleanup transaction.** Prepare performs prerequisites and additive destination work while existing ownership remains active. Cutover validates canonical config, switches active mappings, and updates corresponding adapters and managed fragments, recording each verified step. Cleanup removes only authorized old active labels, explicitly moved local sources, and exact obsolete generated delivery while preserving source tracker stores. The first failure or drift stops later work; affected consumers fail closed while cutover is incomplete.

28. **Reconfiguration recovery and audit.** An interrupted reconfiguration may resume the confirmed remainder after revalidation or explicitly accept a reviewed partial state when retained canonical config and adapters are valid. It never offers automatic rollback and partial acceptance cannot delete source or remote data. Before journal removal, each changed repository receives a secret-free append-only audit entry; hub runs also record a project summary. Final reporting states the active ownership contract and every completed, preserved, skipped, pending, failed, and no-op operation.

29. **Deterministic manifest transaction seam.** The highest behavioral seam is one deterministic contract that accepts a discovered workspace and machine snapshot, resolved user choices, fake external adapters, and optional injected failure or drift. It returns the complete categorized plan and, after authorization, applies it to isolated worktrees and returns derived readiness plus the final report. First run, migration, hub scope, reconfiguration, failure, and resume scenarios all exercise this same seam. Schema, migration mappings, worker manifests, adapters, journaling, and reporting are tested through the contract rather than through independent reimplementations.

30. **Harness and package parity.** Marketplace source remains authoritative. The native omp package is rebuilt from that source and must expose the public command, both internal workers, schema, templates, and required runtime helpers while omitting the complete legacy surface. Installed Claude Code and isolated npm-tarball smoke tests prove command/worker discovery, contract availability, migration invocation, aligned no-op behavior, and absence of removed entries. They do not replace deterministic transaction behavior tests.

31. **Consumer cutover.** Status, commit, engineering graph flows, documentation commands and hooks, dashboard code, native helpers, and all other WS consumers read only canonical config after migration. A missing canonical capability plus detected legacy state causes a fail-closed message naming the source and directing the user to `/ws-setup`. Runtime dual-read support is not retained.

32. **Release contract.** The marketplace advances to `ws` 5.0.0 and the independently versioned native package advances to `@wsagency/omp-ws` 0.7.0. One reviewed change contains implementation, generated output, references, canonical migration guide, root changelog and docs mirror, marketplace metadata, and native metadata. The already verified native tarball is published and clean-install metadata is verified before tagging the exact marketplace commit as `v5.0.0`; failed npm publication or verification blocks the marketplace tag.

## Testing Decisions

1. Tests defend observable contracts: complete plan contents, authorization boundaries, resulting files and mappings, readiness, external adapter calls, failure boundaries, resume behavior, package discovery, and absence of removed surfaces. They must not assert private function shape, source formatting, prompt prose that has no user-visible contract, or incidental ordering outside the defined transaction order.

2. The primary test seam is the confirmed deterministic manifest transaction contract. Tests construct isolated repository or hub worktrees from checked-in fixtures, provide a machine-capability snapshot and scripted choices, inject deterministic fake tracker/runtime/docs adapters, inspect the pre-write plan, authorize it, and assert the resulting repository state and report. Failure and drift can be injected at an exact manifest item and the same fixture can then exercise safe resume.

3. The same seam covers the complete observable scenario matrix: new Local/no-Jira setup; every known legacy format; customized-value preservation; aligned prompt-free no-op; conflicting and unsupported-custom zero-write behavior; outside-git and origin gating; Jira-primary authentication failure; Local/Jira complete backfill, pending outage, and same-field conflict; standalone, hub-root, and hub-sub-repository scope; docs-worker partial failure; sequential hub failure; canonical-config drift; external-item drift; reconfiguration prepare/cutover/cleanup interruption; and partial-state acceptance eligibility.

4. Versioned migration fixtures are sanitized snapshots of actual released outputs, not generated by the implementation under test. At minimum they represent ws-init-only, Local, Local/Jira, documentation-initialized, customized combined, and unsupported custom-tracker repositories. Expected canonical config, adapters, preserved authored content, deletions, external calls, readiness, and reports are checked in alongside each input.

5. Schema tests exercise valid complete and valid partial configurations plus every fail-closed class: malformed YAML, duplicate keys, custom tags, unknown fields at each level, wrong scalar types, invalid enums, missing section fields, duplicate/empty labels, secret-like forbidden fields, absolute/traversing/conflicting paths, incompatible Jira combinations, recognized older versions, and future versions. These validations are observed through the transaction contract whenever they affect setup behavior; a narrow schema conformance suite may supplement them for exhaustive input coverage.

6. Tracker adapter tests run through the transaction seam with deterministic GitHub, GitLab, Jira, and Local fakes. The Jira fake must support authentication readiness, reads, creates, field versions, conflict responses, outages, returned-key persistence, correlation-token recovery, comments, links, relabeling, and project rebinding. No automated test or release verification performs live Jira mutations; read-only jira-cli capability checks are permitted but are not behavioral proof.

7. Worker behavior is tested through confirmed manifests. The project-bootstrap worker must apply only its assigned core entries and return verification evidence. The docs-bootstrap worker must create only missing confirmed artifacts, preserve authored content, avoid prompting, stop on injected failure, and allow missing-only resume. Shared context changes must be composed once by the orchestrator rather than written by both workers.

8. Hub tests use multiple real temporary git worktrees and a registry fixture. They assert working-repository selection and order, input/output exclusion, hub-default snapshot semantics, child-value preservation, dirty-overlap blocking, preflight completeness, one confirmation, one-time machine prerequisites, sequential repository writes, core-before-docs ordering, first-failure stop, and fingerprint revalidation before each target.

9. Reconfiguration tests assert strict-valid baseline gating; repository/domain/field scope; minimal structural preservation; visible dependency closure; source-store disposition; no automatic deletes, closes, moves, or reassignment; semantic label migration; content/path manifests; remote re-fetch; journal durability; deterministic duplicate prevention; affected-consumer blocking; prepare/cutover/cleanup ordering; resume; valid partial acceptance; audit entry creation; and no-op reconfiguration.

10. Permanent source and generated-surface gates positively require `/ws-setup`, the project-bootstrap worker, and the docs-bootstrap worker, and negatively require the absence of the old initializer, `/ws-matt` setup route, legacy setup skill, obsolete names, obsolete config readers, obsolete native settings, help/reference/graph references, and generated equivalents. These are public-surface regression tests, not substitutes for behavioral transaction tests.

11. Existing package-generation tests provide prior art for generating into a temporary output root and asserting the shipped command, skill, agent, rule, template, and helper surface. Extend that seam to validate schema packaging, new surface counts, positive setup discovery, and complete legacy absence without hand-editing generated artifacts.

12. Installed-artifact smoke tests install the marketplace plugin from the release checkout into an isolated Claude Code environment and install the actual `npm pack` tarball into an isolated omp profile. Each smoke verifies public command discovery, both worker discoveries, access to the packaged schema/transaction support, one representative legacy migration, a subsequent aligned no-op, and absence of every removed setup entry. The tarball used by release verification is the artifact later published.

13. The prototype's seven scenarios remain UX prior art: standalone first run, hub-root first run, hub-sub-repository first run, aligned re-run, conflicting legacy re-run, outside-git setup, and resume after docs failure. Production tests reproduce their state transitions through the deterministic contract rather than depending on the discarded interactive prototype implementation.

14. Release verification must pass the full deterministic suite, generated-surface gates, marketplace installed smoke, npm-tarball installed smoke, clean isolated package installation, changelog/reference checks, and version-pair assertions before publication. A narrowed scenario or source-tree-only test is not sufficient evidence for the breaking release.

## Out of Scope

- Compatibility aliases, forwarding stubs, or deprecation shims for `/ws-init`, `/ws-matt setup`, or the legacy setup skill.
- Redesigning unrelated `/ws-docs`, `/ws-hub`, or `/ws-matt` workflows beyond the setup worker boundary, canonical-config consumption, readiness checks, and user-mediated setup handoffs required by this cutover.
- Adding a generic `Custom` tracker value without a separately validated executable adapter contract.
- Adding a background synchronization daemon or a separate public Local/Jira sync command.
- Automatically deleting, closing, moving, or reassigning source tracker items during setup or reconfiguration.
- Uploading local-only claims, session shares, Wayfinder pointers, or agent state to Jira or another external tracker.
- Performing live Jira mutations during automated or release verification.
- Copying Jira credentials, site configuration, user identity, tokens, or machine package-manager state into repository configuration.
- Automatically deleting user-global legacy Claude configuration or manually editing omp package-manager lock state.
- Runtime dual-read compatibility after the clean cutover.
- Automatic rollback, setup-created commits or branches, worktree locks, or best-effort continuation after the first failed write, verification, drift check, or external operation.
- Implicit hub runtime inheritance or implicit propagation of later hub defaults into configured working repositories.
- Cloning or initializing registered input/output repositories, creating a product docs output repository, generating an explained output repository, or redesigning their owning `/ws-hub` and product-documentation flows.
- Regenerating existing authored documentation during bootstrap; catch-up, repair, and content generation remain documentation operations.
- Guessing bounded-context semantics, merging ambiguous authored prose automatically, or deleting unknown legacy content.
- Executing the actual 5.0.0/0.7.0 publication from this specification; implementation and release execution follow subsequent tickets and the release contract.

## Further Notes

- This is a multi-session specification. It intentionally carries no `ready-for-agent` state role; `ws-to-tickets` must split it into tracer-bullet implementation tickets and apply `ready-for-agent` to executable slices.
- The source Wayfinder map is `unify-ws-setup-entrypoints`; its ten resolved child tickets are the decision authority for this synthesis.
- The first-run and recovery UX was validated on the throwaway `prototype/ws-setup-ux` branch at commit `47a8593`. The prototype is intentionally absent from the main branch; the decision-rich output, not its implementation, informs this spec.
- Existing accepted architecture remains in force: one consolidated WS plugin, one generated full-native omp package sourced from marketplace content, lockstep marketplace release versioning, and one scheduling owner per work unit.
- The confirmed primary behavioral test seam is the deterministic manifest transaction contract. Installed harness checks remain thin package and discovery proof rather than a second behavioral implementation.
