<!-- WS-MANAGED:issue-tracker:START -->
# Issue Tracker

The executable tracker policy lives in `.wsagency/config.yaml`. Read `tracker.primary` before every tracker operation; this adapter defines the GitLab Issues behavior selected by the repository origin.

## GitLab Issues operations

- All tickets live in the remote GitLab project.
- Use `glab issue` to list, create, and edit issues.
- Pull request (Merge Request) intake policy is defined separately in `.wsagency/config.yaml` (`tracker.pull_requests`).
- Ticket comments and metadata belong in the GitLab issue.

Do not use `dev-docs/tickets/` for GitLab-managed issues.
<!-- WS-MANAGED:issue-tracker:END -->
