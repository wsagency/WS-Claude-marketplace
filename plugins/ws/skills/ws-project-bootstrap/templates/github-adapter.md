<!-- WS-MANAGED:issue-tracker:START -->
# Issue Tracker

The executable tracker policy lives in `.wsagency/config.yaml`. Before every tracker operation, request the `tracker` capability through `consumer.mjs`, including only the GitHub origin/CLI readiness snapshot; this adapter defines GitHub Issues behavior but never overrides canonical values.

## GitHub Issues operations

- All tickets live in the remote GitHub repository.
- Use `gh issue` to list, create, and edit issues.
- Pull request intake is controlled separately by canonical `tracker.pull_requests`; request `pull_requests` readiness only when intake is needed.
- Ticket comments and metadata belong in the GitHub issue.

Do not use `dev-docs/tickets/` for GitHub-managed issues.
<!-- WS-MANAGED:issue-tracker:END -->
