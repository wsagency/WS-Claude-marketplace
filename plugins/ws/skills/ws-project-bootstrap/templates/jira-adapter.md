<!-- WS-MANAGED:issue-tracker:START -->
# Issue Tracker

The executable tracker policy lives in `.wsagency/config.yaml`. Before every tracker operation, request the `tracker` capability through `consumer.mjs`, including only jira-cli readiness; this adapter defines Jira behavior but never overrides canonical values.

## Jira operations

- All tickets live in the remote Jira project defined in `.wsagency/config.yaml`.
- Use `jira-cli` to list, create, and edit issues.
- Authentication state and tokens are owned by jira-cli, never stored in this repository or read from legacy policy.
- Ticket comments and metadata belong in the Jira issue.

Do not use `dev-docs/tickets/` for Jira-managed issues.
<!-- WS-MANAGED:issue-tracker:END -->
