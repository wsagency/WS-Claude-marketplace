# Define the unified setup state machine

Map: unify-ws-setup-entrypoints
Label: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: None — can start immediately.

## Question

What ordered, idempotent state machine should `/ws-setup` use across user-global readiness, repository detection, tracker selection, optional Jira binding, agent/domain configuration, omp policy installation, and optional documentation bootstrap—including behavior outside a git repository and failure boundaries that prevent unsafe partial writes?

## Answer

`/ws-setup` is an idempotent reconcile state machine with one write boundary:

1. **Discover (read-only).** Detect the current directory, git repository and origin, project shape, the canonical `.wsagency/config.yaml`, legacy WS configuration migration inputs, tracker/domain artifacts, installed runtimes, session policy, and documentation state. Classify every target as aligned, missing, invalid, or conflicting.
2. **Collect choices (read-only).** Resolve only choices the discovered state cannot answer: whether to create a repository, tracker mode, optional Jira integration, applicable runtime policy, and optional documentation bootstrap. If no git repository exists, explain that setup needs one and offer to create it; require and validate an origin URL before including `git init` and `git remote add origin` in the plan.
3. **Validate (read-only).** Validate the full dependency chain before any write: destination paths and collisions, origin syntax, Jira CLI/authentication only when Jira was selected, configuration parseability, runtime availability, and every planned mutation. A missing optional integration becomes a skipped choice, not a failure of local-first setup.
4. **Plan and confirm.** Render one complete ordered plan with exact creates, updates, preserved values, no-op phases, diffs for existing files, and the full optional docs-bootstrap manifest. Obtain one final confirmation covering all writes and worker dispatches; downstream workers do not prompt again.
5. **Apply in canonical order.**
   1. Create or validate the git repository and required origin.
   2. Reconcile core repository state: `.wsagency/config.yaml`, tracker and Jira synchronization policy, domain/agent guidance, and the single composed `AGENTS.md`/`CLAUDE.md` patch.
   3. Install the applicable omp/Claude runtime policy.
   4. If selected, invoke the docs domain's reusable bootstrap worker with the confirmed missing-only manifest.
6. **Verify.** Read every changed artifact back, validate its schema and cross-file invariants, verify git/origin state when created, and confirm that the selected runtime discovers the setup.
7. **Report.** List completed, skipped, no-op, and failed phases; name every written path and give the precise safe re-run instruction.

On re-run, `/ws-setup` reconciles actual state and preserves user-customized values. It proposes only missing or invalid changes; switching an existing tracker or Jira binding requires an explicit choice and visible diff.

There is no automatic rollback. Every apply phase is independently idempotent and non-destructive, and the command stops at the first failure with an exact completed/pending phase report. Re-running discovers the resulting state and safely resumes rather than replaying or overwriting completed work.
