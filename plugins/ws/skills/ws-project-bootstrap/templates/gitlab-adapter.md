<!-- WS-MANAGED:issue-tracker:START -->
# Issue Tracker

The executable tracker policy lives in `.wsagency/config.yaml`. Before every tracker operation, request the `tracker` capability through `consumer.mjs`, including only the GitLab origin/CLI readiness snapshot; this adapter defines GitLab Issues behavior but never overrides canonical values.

## GitLab Issues operations

- All tickets live in the remote GitLab project.
- Use `glab issue` to list, create, and edit issues.
- Merge request intake is controlled separately by canonical `tracker.pull_requests`; request `pull_requests` readiness only when intake is needed.
- Ticket comments and metadata belong in the GitLab issue.

Do not use `dev-docs/tickets/` for GitLab-managed issues.
<!-- WS-MANAGED:issue-tracker:END -->
