---
allowed-tools: Bash, Read, AskUserQuestion
argument-hint: ""
description: Safely reconcile WS project setup through one visible, confirmed, verified transaction
---

# WS Setup

Complete a safe first run for an existing standalone Git repository with the recommended Local Markdown engineering setup, or recognize its aligned result without prompting or writing. This command is the single orchestration owner: it discovers, collects only unresolved choices, validates, renders the complete plan, obtains one final confirmation, invokes the internal worker, verifies, and reports.

## Runtime helper

Resolve the plugin root containing this command. Prefer `${CLAUDE_PLUGIN_ROOT}` when set; otherwise use the installed plugin root whose `commands/ws-setup.md` is running. The deterministic helper is:

```text
<plugin-root>/skills/ws-project-bootstrap/transaction.mjs
```

Invoke it with `node`. Build one JSON runtime snapshot from observed active-harness delivery only:

```json
{
  "activeHarness": "claude or omp",
  "sessionDiscipline": true,
  "dangerousGitGuard": true
}
```

Never infer `true` from files in the target repository. The active WS plugin/runtime must actually deliver the capability in this session. A missing required capability is a blocking conflict, not permission to write a substitute or to report readiness.

## Transaction

1. **Discover without writing.** Resolve the repository root with `git rev-parse --show-toplevel`, then run:

   ```text
   node <helper> discover --root <repository-root> --machine '<runtime-snapshot-json>'
   ```

   Discovery is read-only. Summarize the detected Git root and origin, `standalone` project shape, canonical configuration state, core artifact state, and runtime capability state. If the result is not an existing standalone repository, show the blocking reason and stop without writing; repository creation, hub scope, and hub sub-repositories are outside this transaction.

2. **Ask only unresolved choices.** If discovery reports `unconfigured`, ask exactly one AskUserQuestion (or a plain question when unavailable):

   > Use the recommended Local Markdown engineering setup?

   Recommend **Yes**. A no answer stops without changes. A valid canonical configuration settles this choice, so drift repair and an aligned rerun must not ask it again.

3. **Plan without writing.** Run:

   ```text
   node <helper> plan --root <repository-root> --machine '<runtime-snapshot-json>' --profile recommended_local
   ```

   Render the complete ordered manifest before any write. Show every entry's exact target, classification (`CREATE`, `UPDATE`, `PRESERVE`, `SKIP`, `NO-OP`, or `BLOCKING_CONFLICT`), reason, and exact `before`/`after` plus `diff` whenever existing managed content changes. State explicitly that no files have changed. A blocking conflict ends the run without confirmation or writes.

4. **Skip the write boundary for an empty plan.** When `requiresConfirmation` is false and the report says `No changes required`, show the discovery summary, readiness, and that exact report. Ask no question, request no confirmation, invoke no worker, and write nothing.

5. **Confirm once.** When the plan contains writes, ask one final AskUserQuestion:

   > Apply every change in this complete plan?

   Offer **Apply plan** and **Cancel**. This confirmation authorizes only the displayed plan hash. Cancel stops without changes. Downstream workers never prompt again.

6. **Apply through the internal worker.** Load `ws-project-bootstrap` and follow it with the confirmed core manifest. Its deterministic invocation is:

   ```text
   node <helper> apply --root <repository-root> --machine '<runtime-snapshot-json>' --profile recommended_local --authorization <confirmed-plan-hash>
   ```

   The helper must re-discover and reject stale authorization before writing, apply `CREATE` and `UPDATE` entries in order, read each write back, and verify it before continuing. Never reproduce its writes manually or add an unplanned effect.

7. **Report verified state.** Show the helper's completed, preserved, skipped, no-op, and blocked effects; every written path; and `config`, `engineering`, `tracker`, and `runtime` readiness. Do not report readiness from intent or from the pre-write plan.

## Boundaries

This transaction intentionally supports the complete recommended Local Markdown tracer only. It does not initialize Git, alter origins, configure GitHub/GitLab/Jira, bootstrap documentation, migrate legacy setup, reconfigure valid choices, or operate on hub scopes. Those states are classified visibly and remain write-free; never approximate a future transaction path.

Every generated artifact and report is English. The canonical configuration contains no secrets, site or identity data, machine installation state, user names, home paths, or origin identity.

## When you finish

In two or three sentences, state whether the standalone Local setup was verified or already aligned, name `.wsagency/config.yaml` and the core artifacts when written, and include the derived readiness. If the plan was empty, end with `No changes required`; otherwise stop after the verified report because setup is a return-only command.
