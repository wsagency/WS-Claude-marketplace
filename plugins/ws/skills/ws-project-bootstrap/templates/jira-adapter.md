<!-- WS-MANAGED:issue-tracker:START -->
# Issue Tracker

The executable tracker policy lives in `.wsagency/config.yaml`. Read `tracker.primary` before every tracker operation; this adapter defines the Jira behavior configured by the team.

## Jira operations

- All tickets live in the remote Jira project defined in `.wsagency/config.yaml`.
- Use `jira-cli` to list, create, and edit issues.
- Authentication state and tokens are owned by the local environment, never stored in this repository.
- Ticket comments and metadata belong in the Jira issue.

Do not use `dev-docs/tickets/` for Jira-managed issues.
<!-- WS-MANAGED:issue-tracker:END -->
