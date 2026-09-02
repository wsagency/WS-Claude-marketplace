# Cut native omp runtime consumers over

**What to build:** Migrate native omp dashboard, guard, changelog, compaction, and related runtime helpers to canonical repository policy plus machine-local capability checks, removing their dependence on legacy project config and package settings as policy sources.

**Blocked by:** 23-enforce-lossless-migration-and-cleanup

**Status:** done

- [x] Every native helper reads repository-owned behavior from canonical policy and derives machine capability independently; user-global or package-manager settings do not override repository policy.
- [x] Dashboard and Jira-aware runtime behavior activate only with a valid canonical Jira binding and the required machine integration readiness.
- [x] Dangerous-git guard and session discipline honor committed requirements while preserving stronger shared machine protection used by other repositories.
- [x] Changelog and compaction behavior use canonical changelog, tracker, and readiness state without a hidden fallback to legacy configuration.
- [x] Missing or invalid canonical capability produces a specific fail-closed or non-blocking report appropriate to the helper and directs legacy repositories to /ws-setup.
- [x] Native settings that remain temporarily installed are inert as repository policy inputs until the contraction ticket removes their public surface.
- [x] Focused runtime tests cover canonical enablement, disablement, missing capability, legacy detection, unrelated repository settings, and aligned behavior in isolated omp profiles.
