---
name: ws-docs-bootstrap
description: Internal worker for applying a confirmed WS dual-track documentation bootstrap manifest. Use only behind /ws-setup and /ws-docs init.
---

# Documentation Bootstrap Worker

Internal deterministic worker for documentation scaffolding. Never use this directly in chat; it is invoked by the `ws-setup` and `ws-docs` entry nodes.

## Contract
Exports `discoverDocumentation`, `planDocumentation`, and `applyDocumentation` in `transaction.mjs`.
