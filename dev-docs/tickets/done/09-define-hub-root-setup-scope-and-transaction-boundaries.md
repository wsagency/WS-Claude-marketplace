# Define hub-root setup scope and transaction boundaries

Map: unify-ws-setup-entrypoints
Label: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: None — can start immediately.

## Question

When `/ws-setup` runs at a project hub root, which core configuration and bootstrap work belongs only to the hub, which becomes a default for registered repositories, and which may fan out to eligible `type: working` repositories; how must input/output repositories and customized child configuration be excluded or preserved; and what confirmation, per-repository preflight, write ordering, failure stop, and safe-resume boundaries apply across multiple independent git worktrees?

## Answer

At a hub root, `/ws-setup` owns one explicit project manifest, not runtime configuration inheritance. The hub's `.wsagency/config.yaml` is canonical for hub workflows and supplies proposed defaults for child setup, but every selected `type: working` repository receives and owns its own complete `.wsagency/config.yaml`. Materialized child values are a snapshot: valid explicit child values always win, hub defaults fill only missing choices, and later hub changes never rewrite a child implicitly. Intentional alignment of an already configured child belongs to `/ws-setup reconfigure`.

The initial scope contains the hub repository and every registered, locally present `type: working` repository, in `project.yaml` order. Aligned targets remain visible as `NO-OP`; customized values are `PRESERVE`; the user may remove a repository from the plan. Registered `type: input` and `type: output` repositories are inspected only enough to validate and explain their registry classification, then shown as excluded. Setup does not clone them, initialize repo-local WS state in them, or treat a docs/explained output as a working repository. Product-docs output creation and maintenance remain with `/ws-hub init|add` and product-scope `/ws-docs`; explained output remains with `/ws-hub explained`.

Hub-owned work comprises the hub's own canonical config and engineering adapters, its managed context-file composition, and product-level documentation artifacts in the hub knowledge root. Selected working repositories receive their own canonical config, engineering adapters, managed context-file composition, applicable per-project runtime delivery, and optional repo documentation bootstrap. The reusable docs-bootstrap worker receives the already discovered and confirmed manifest: it processes eligible working repositories and hub product artifacts, never input/output repositories, and never asks for a second confirmation.

Discovery and planning are read-only across the complete manifest. Before any confirmation, setup validates `project.yaml`, normalized registry paths and type/purpose constraints; verifies every selected path is an accessible independent git worktree with the required origin; discovers canonical and legacy configuration, readiness, and exact planned files/ranges; and checks working-tree overlap. Unrelated dirty files are allowed but named. A modified or untracked planned path, or a dirty managed range that cannot be proven non-overlapping, blocks that repository rather than being merged automatically. A missing, non-git, escaping, malformed, or otherwise invalid selected repository also blocks the plan. The user may repair it or explicitly exclude it; exclusion is never automatic, and the final report states that project-wide readiness was not achieved.

The complete categorized manifest and exact diffs receive one final confirmation. It includes every `CREATE`, `UPDATE`, `PRESERVE`, `SKIP`, `NO-OP`, excluded target, machine-local action, and docs-worker target. CLI/authentication/plugin discovery happens once per machine. Any confirmed installation, login, or machine-global runtime action also executes once, before repository writes; committed repository configs contain team policy and bindings, not machine state. Runtime delivery is still verified separately for each selected repository.

Writes are sequential so failure-stop is real rather than best-effort:

1. Execute and verify any confirmed machine-global prerequisite.
2. Apply and verify the hub's core config, adapters, and shared context-file patch.
3. Apply and verify each selected working repository's core manifest in `project.yaml` order, one independent worktree at a time.
4. Run the confirmed missing-only documentation manifest only after every selected core target succeeds, processing repo targets sequentially and hub product-level artifacts last.
5. Derive and report readiness from the resulting files and machine capabilities; never persist a project-wide completion marker.

The approved plan fingerprints each target's git HEAD and status plus every existing planned file. Immediately before the first write in a worktree, setup revalidates that fingerprint. Any drift stops before touching that repository and leaves it and all later targets pending. Within a repository, every idempotent file/range write is read back and validated before the next write. Setup does not create commits, branches, worktree locks, or rollback machinery.

On the first failed write or verification, no new repository or later docs target starts. Completed writes remain; there is no rollback. The report names completed, failed, pending, preserved, skipped, and excluded targets and the exact safe rerun command. A rerun rediscovers actual state, renders completed work as aligned/no-op, preserves authored and customized content, re-preflights pending targets, and asks for confirmation only for the remaining writes. This makes the recovery boundary each verified artifact inside one worktree while keeping the user-facing authorization boundary one complete cross-repository plan.
