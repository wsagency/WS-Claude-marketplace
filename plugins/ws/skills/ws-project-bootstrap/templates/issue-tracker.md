<!-- WS-MANAGED:issue-tracker:START -->
# Issue Tracker

The executable tracker policy lives in `.wsagency/config.yaml`. Read `tracker.primary` before every tracker operation; this adapter defines the Local Markdown behavior selected by the recommended setup profile.

## Local Markdown operations

- Open tickets live at `dev-docs/tickets/open/<slug>.md`.
- Closing a ticket moves it to `dev-docs/tickets/done/<slug>.md` only after the result is coded and durable knowledge has landed in `dev-docs/`.
- `Blocked by:` names ticket slugs. A ticket is runnable only when every blocker is in `done/`.
- `Status:` uses the semantic role mapped by `triage.labels` in `.wsagency/config.yaml`.
- Ticket comments append under `## Comments`; claims, session shares, and map pointers remain local workflow metadata.

`dev-docs/tickets/` is working state, not product knowledge. Documentation indexers must exclude it; durable decisions belong in `dev-docs/decisions/` and domain terms belong in `CONTEXT.md`.
<!-- WS-MANAGED:issue-tracker:END -->
