# Migrate legacy Jira initializer state

**What to build:** Convert every released Jira initializer configuration into canonical repository policy and adapters without treating machine-global values as authority or deleting the legacy recovery source before semantic verification.

**Blocked by:** 14-support-jira-primary-tracker-setup

**Status:** ready-for-agent

- [ ] Discovery recognizes every released global and repository-local Jira initializer shape and classifies its values without writing.
- [ ] Existing valid canonical values win; agreeing deterministic repository-local Jira, changelog, commit, and dashboard values enter the confirmed migration plan; machine-global values appear only as user-confirmed suggestions.
- [ ] Jira site, user identity, credentials, tokens, and other jira-cli-owned machine state are never copied into repository policy.
- [ ] Conflicting repository-local values require an explicit choice, and modification time, file order, and runtime read order never decide precedence.
- [ ] The canonical project binding, dependent adapters, and readiness are read back and semantically verified before any repository-local initializer source becomes eligible for deletion.
- [ ] User-global legacy configuration is never modified or removed by repository setup.
- [ ] Versioned fixtures prove each released initializer shape, customized-value preservation, explicit conflict resolution, failed authentication, cleanup gating, and the subsequent aligned no-op rerun.
