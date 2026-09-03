# Unify WS project setup around one canonical policy

## Status

Accepted

## Context and Problem Statement

Before WS 5, project setup was split across `/ws-init`, Jira initialization, the engineering graph setup route, documentation configuration, repository context fragments, and native omp settings. Those sources could disagree, concealed ownership, and made migration or cross-harness parity impossible to prove without fallback behavior.

## Decision Drivers

- One reviewable source of committed project policy for Claude Code and omp
- Lossless migration of released and customized pre-5 repository state
- Capability-specific readiness instead of global all-or-nothing initialization
- One complete, authorized transaction across standalone repositories and hubs
- Clean removal of obsolete setup entry points and runtime readers
- Deterministic reconfiguration, recovery, and installed-artifact verification

## Considered Options

1. Keep the setup entry points and add precedence rules between their files.
2. Add a canonical file but retain legacy readers and compatibility aliases.
3. Make `/ws-setup` and `.wsagency/config.yaml` the sole public entry point and committed policy, with transactional migration and a clean cutover.

## Decision Outcome

Chosen option: “Make `/ws-setup` and `.wsagency/config.yaml` the sole public entry point and committed policy,” because it gives every consumer the same strict versioned contract and makes ownership, readiness, migration, and harness parity observable. `/ws-setup` owns discovery, unresolved choices, validation, the complete manifest, one confirmation, ordered dispatch, verification, and reporting; `ws-project-bootstrap` and `ws-docs-bootstrap` are internal workers only.

Canonical configuration contains project policy, not secrets or machine state. Jira authentication remains jira-cli-owned, machine settings prove capabilities only, hub values are materialized defaults rather than runtime inheritance, and consumers request only the readiness capability needed for their operation.

### Consequences

- Good, because Claude Code and omp interpret one strict repository policy and can share deterministic fixtures.
- Good, because aligned runs are prompt-free while missing, drifted, migrated, and intentionally reconfigured states have separate safe paths.
- Good, because every pre-5 value has explicit precedence, preservation, conflict, verification, and cleanup rules.
- Good, because hub setup has one preflighted cross-repository manifest and a precise first-failure recovery boundary.
- Bad, because WS 5 is a breaking cutover that requires migration and permanent absence gates for old commands, skills, settings, and readers.
- Bad, because setup transactions and installed-artifact parity tests become release-critical infrastructure.
- Neutral, because external integrations remain independently installed and authenticated; canonical policy can require them but never stores their credentials.

## Pros and Cons of the Options

### Keep separate setup entry points with precedence rules

- Good, because existing commands and files would remain familiar.
- Bad, because precedence would remain implicit across commands and harnesses.
- Bad, because aligned state, cleanup eligibility, and reconfiguration could not be proved through one transaction.
- Bad, because every consumer would continue carrying multiple readers and defaults.

### Add canonical policy with compatibility readers

- Good, because adoption could be gradual.
- Good, because old repositories would appear to work without an explicit migration.
- Bad, because fallback reads would make the canonical file non-authoritative.
- Bad, because behavior would depend on stale legacy files and package settings indefinitely.
- Bad, because Claude Code and omp could still diverge on precedence and defaults.

### One public setup transaction and clean cutover

- Good, because ownership and precedence are explicit and testable.
- Good, because migration can preserve authored state while removing only verified repository-local legacy sources.
- Good, because consumers become shallow capability-specific readers.
- Bad, because release requires a coordinated marketplace 5.0.0 and native omp 0.7.0 transition.
- Bad, because unsupported custom or ambiguous legacy state must fail closed for reviewed resolution.

## More Information

- [Complete setup cutover specification](../tickets/open/unify-ws-setup-entrypoints-spec.md)
- [ADR 0002: lockstep marketplace versioning](0002-lockstep-marketplace-versioning.md)
- [ADR 0004: full-native omp package](0004-full-native-omp-package.md)
- [ADR 0006: hub repository types and migration](0006-hub-repo-types-and-migration.md)
- [ADR 0007: progressive hub adoption](0007-progressive-hub-adoption.md)
