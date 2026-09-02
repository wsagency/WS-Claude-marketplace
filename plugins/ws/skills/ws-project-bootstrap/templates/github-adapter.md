<!-- WS-MANAGED:issue-tracker:START -->
# Issue Tracker

The executable tracker policy lives in `.wsagency/config.yaml`. Read `tracker.primary` before every tracker operation; this adapter defines the GitHub Issues behavior selected by the repository origin.

## GitHub Issues operations

- All tickets live in the remote GitHub repository.
- Use `gh issue` to list, create, and edit issues.
- Pull request intake policy is defined separately in `.wsagency/config.yaml` (`tracker.pull_requests`).
- Ticket comments and metadata belong in the GitHub issue.

Do not use `dev-docs/tickets/` for GitHub-managed issues.
<!-- WS-MANAGED:issue-tracker:END -->
