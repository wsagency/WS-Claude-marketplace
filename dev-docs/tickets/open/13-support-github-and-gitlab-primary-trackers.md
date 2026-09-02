# Support GitHub and GitLab primary trackers

**What to build:** Let a repository with a validated GitHub or GitLab origin select the matching issue tracker and become fully tracker-ready without introducing Jira requirements or coupling pull-request intake to tracker ownership.

**Blocked by:** 11-ship-standalone-local-setup-transaction

**Status:** ready-for-agent

- [ ] GitHub Issues is offered only when repository identity can be derived unambiguously from a validated GitHub origin, and GitLab Issues follows the equivalent rule for GitLab.
- [ ] Selecting either backend writes its canonical tracker choice and a working human-and-agent-readable adapter while preserving all unrelated policy.
- [ ] Pull-request intake remains an explicit independent ignore-or-triage choice and is never enabled merely because the primary tracker supports pull requests.
- [ ] Tracker readiness verifies the required local CLI capability and repository identity without storing authentication tokens, user identity, or host configuration in project policy.
- [ ] Missing authentication or unavailable CLI capability blocks only operations that require that tracker and leaves local, documentation, and unrelated runtime capabilities accurately reported.
- [ ] Deterministic first-run and aligned-rerun scenarios cover both backends through the shared manifest transaction and preserve the Local tracker behavior from the foundation tracer.
