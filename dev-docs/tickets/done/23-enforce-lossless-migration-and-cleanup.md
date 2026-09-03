# Enforce lossless migration and cleanup

**What to build:** Complete the pre-5 migration contract with released fixtures, fail-closed ambiguity handling, canonical precedence, authored-state preservation, read-back-gated cleanup, and a verified no-op rerun for every supported legacy repository.

**Blocked by:** 19-migrate-legacy-jira-initializer-state, 20-migrate-legacy-engineering-setup-state, 21-migrate-legacy-docs-context-and-runtime-state, 22-backfill-legacy-local-jira-mappings

**Status:** done

- [x] Sanitized, versioned fixtures represent every known released setup family, including initializer-only, each tracker mode, documentation-initialized, customized combined, and unsupported custom-tracker repositories.
- [x] Valid canonical state always wins; explicit conflict decisions outrank agreeing deterministic repository-local values, which outrank user-confirmed global or machine hints and newly selected values.
- [x] Malformed, incomplete, unknown, ambiguous, unsupported-custom, or lossy input blocks writes and reports the exact source and classification decision required; no timestamp or file order acts as precedence.
- [x] Customized adapters, context prose, domain content, documentation, tickets, mappings, comments, claims, shares, decisions, and changelog history survive semantic conversion.
- [x] Repository-local legacy deletion is an explicit final manifest item and remains ineligible until canonical schema, semantic read-back, adapters, shared context, runtime, selected docs, Jira recovery, and fingerprints all verify.
- [x] Unknown legacy sources may remain inert beside valid canonical state but are never automatically deleted; user-global legacy sources are never modified.
- [x] Recognized older canonical schemas direct ordinary consumers to setup migration, and future schemas stop without rewrite and direct the user to update the package.
- [x] Every supported fixture completes first-run migration and a subsequent prompt-free no-op; every conflict fixture proves zero writes before explicit resolution.
