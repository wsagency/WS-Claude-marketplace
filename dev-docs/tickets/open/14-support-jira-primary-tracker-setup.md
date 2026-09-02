# Support Jira primary tracker setup

**What to build:** Let a Jira-first team select Jira as the primary tracker only when jira-cli is ready, with an explicit repository binding and dependency-checked Jira-aware policies that never copy machine authentication into the repository.

**Blocked by:** 11-ship-standalone-local-setup-transaction

**Status:** ready-for-agent

- [ ] Jira is selectable as primary only after read-only jira-cli authentication and project access checks succeed; there is no silent fallback to another tracker.
- [ ] The confirmed canonical policy records only the explicit Jira project binding and repository-owned choices, never tokens, site configuration, user identity, or other jira-cli-owned state.
- [ ] Jira-primary setup requires Local/Jira synchronization to be disabled and validates any Jira-aware commit or dashboard choice as a visible dependency.
- [ ] Discovery and planning make no remote mutation; any later external side effect is listed in the final plan and remains behind the same point-of-risk confirmation.
- [ ] Tracker, integration, and general repository readiness are reported separately so a Jira outage does not invalidate unrelated valid capabilities.
- [ ] Deterministic fake-adapter scenarios prove authenticated success, missing binary, failed authentication, inaccessible project, dependency conflict, aligned rerun, and zero-write failure behavior without touching a real Jira project.
