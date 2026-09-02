# Backfill legacy Local/Jira mappings

**What to build:** Upgrade an existing Local-first repository to all-ticket Jira synchronization by auditing every mapping, confirming every proposed remote create, and persisting each returned Jira identity before another create can occur.

**Blocked by:** 15-add-local-jira-transactional-synchronization

**Status:** ready-for-agent

- [ ] Discovery validates every existing Jira key and reports missing, stale, duplicated, or conflicting mappings without mutating either store.
- [ ] The final plan lists every unmapped open and done local ticket, its proposed Jira project and type, mapped fields, unsupported fields, source link, and deterministic correlation token.
- [ ] The one setup confirmation explicitly covers all planned remote creates and local mapping writes; no second worker confirmation is requested.
- [ ] After each fake-Jira create, the returned identity is written durably to the matching local ticket and read back before the next create begins.
- [ ] An outage, timeout, or interruption leaves returned-ID or correlation evidence sufficient to re-fetch or resume without creating a duplicate issue.
- [ ] Pending or incomplete backfill prevents legacy source deletion and prevents synchronization from being reported ready until every item is complete or durably recoverable.
- [ ] Deterministic scenarios cover complete backfill, mixed existing mappings, stale keys, failure after remote create, failure after local persistence, retry, and aligned no-op without live Jira writes.
