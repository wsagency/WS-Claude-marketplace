---
name: ws-docs-bootstrap
description: Internal worker for applying a confirmed WS dual-track documentation bootstrap manifest. Use only behind /ws-setup and /ws-docs init.
---

# Documentation Bootstrap Worker

Internal deterministic worker for documentation policy inspection and
missing-only scaffolding. Never invoke it as a user-facing entry node;
`/ws-setup` and `/ws-docs init|repair` own planning, confirmation, shared
context composition, and reporting.

## Contract

- `policy.mjs` reads only `<repository>/.wsagency/config.yaml`, derives
  capability-specific readiness, and detects legacy files only to return a
  fail-closed `/ws-setup` blocker. It must never parse legacy contents.
- `transaction.mjs` exports `discoverDocumentation`,
  `planDocumentation`, and `applyDocumentation`. Discovery accepts validated
  canonical policy, plans its configured paths, preserves authored content,
  and applies only confirmed missing artifacts.
- In hub workflows the caller passes hub policy for product artifacts and
  materialized child policy for repository-local work. The worker never
  performs runtime inheritance or creates a missing output repository.
