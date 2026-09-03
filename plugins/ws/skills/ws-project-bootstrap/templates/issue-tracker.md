<!-- WS-MANAGED:issue-tracker:START -->
# Issue Tracker

The executable tracker policy lives in `.wsagency/config.yaml`. Before every tracker operation, request the `tracker` capability through `consumer.mjs`; this adapter describes Local Markdown operations but never overrides canonical values.

## Local Markdown operations

- Open tickets live at `dev-docs/tickets/open/<slug>.md`.
- Closing a ticket moves it to `dev-docs/tickets/done/<slug>.md` only after the result is coded and durable knowledge has landed in `dev-docs/`.
- `Blocked by:` names ticket slugs. A ticket is runnable only when every blocker is in `done/`.
- `Status:` uses the semantic role mapped by `triage.labels` in `.wsagency/config.yaml`.
- Ticket comments append under `## Comments`; claims, session shares, and map pointers remain local workflow metadata.

## Optional Jira synchronization

Read canonical `jira.sync` before each operation. When it is
`all_local_tickets`, execute the operation through
`runCanonicalSynchronizedTrackerOperation`: retry pending work first, detect
same-field conflicts before overwrite, persist returned Jira mappings and
pending work, and then apply the Local result. Jira outage degrades sync but
does not block the Local operation. Claims, session shares, map pointers, and
agent state remain local.

`dev-docs/tickets/` is working state, not product knowledge. Documentation indexers must exclude it; durable decisions belong in `dev-docs/decisions/` and domain terms belong in `CONTEXT.md`.
<!-- WS-MANAGED:issue-tracker:END -->
