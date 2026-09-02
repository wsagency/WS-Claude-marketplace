# Cut tracker and engineering consumers over

**What to build:** Migrate the tracker-facing commands and engineering graph flows to canonical project policy and capability readiness while keeping the old form present only as an unconsumed expansion artifact until final contraction.

**Blocked by:** 13-support-github-and-gitlab-primary-trackers, 15-add-local-jira-transactional-synchronization, 23-enforce-lossless-migration-and-cleanup

**Status:** ready-for-agent

- [ ] Every tracker-facing command and engineering graph flow reads its tracker, Jira, pull-request, triage, domain, commit, dashboard, and changelog choices from canonical policy or its generated operational adapter.
- [ ] Consumers request only the readiness capability they need, so integration outages do not block valid local or unrelated engineering operations.
- [ ] Missing canonical capability with detected legacy state fails closed, names the legacy source, and directs the user to /ws-setup instead of applying defaults or dual-reading.
- [ ] No migrated consumer reads repository-local or user-global legacy setup configuration at runtime, and no command contains a second copy of canonical defaults.
- [ ] Existing Local, GitHub, GitLab, Jira, and Local/Jira operations remain behaviorally correct against canonical fixtures, including pending sync and conflict paths.
- [ ] Help and operational summaries report the active canonical ownership contract and capability-specific blockers accurately.
- [ ] Consumer contract tests keep this migration batch green while the final legacy command and files remain temporarily present but unused.
