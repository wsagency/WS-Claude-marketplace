# Add Local/Jira transactional synchronization

**What to build:** Allow Local Markdown to remain the primary working store while every ticket is mirrored to Jira at tracker-operation boundaries with semantic conflict detection, outage tolerance, and no background daemon.

**Blocked by:** 14-support-jira-primary-tracker-setup

**Status:** done

- [x] All-ticket Jira synchronization is valid only with Local Markdown as primary and an explicit ready Jira binding; Jira-primary configuration rejects synchronization.
- [x] Every tracker operation synchronizes pending changes before its local action and synchronizes the resulting local change afterward, with no daemon and no separate public sync command.
- [x] Explicit semantic mappings cover title, description and acceptance criteria, status, comments, priority, and ticket type in both directions.
- [x] Claims, session shares, Wayfinder pointers, agent state, and other local-only workflow metadata never leave the repository.
- [x] When both sides changed the same mapped field since the last verified sync, the operation stops before overwrite and presents Local, Jira, and manual-merge resolution paths.
- [x] A Jira outage permits the local tracker operation, records durable pending synchronization, and causes the next tracker operation to retry pending work first.
- [x] Deterministic fake-Jira scenarios prove create, update, comment, status, conflict, outage, pending retry, and aligned no-op behavior without live stakeholder mutations.
