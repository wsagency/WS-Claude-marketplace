# Define the command and skill clean cutover

Map: unify-ws-setup-entrypoints
Label: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: 04-prototype-first-run-and-rerun-setup-ux

## Question

What exact command, skill, graph-node, generated-package, help, and documentation surface should remain after the clean cutover to `/ws-setup`, and which old files, routes, references, tests, and generated artifacts must be removed or renamed so no second setup convention survives?

## Answer

The only user-invocable project setup surface is `/ws-setup`. The clean cutover removes the source and generated `/ws-init` command, the `/ws-matt setup` router entry and instructions, and the `ws-setup-matt-pocock-skills` skill directory. They receive no aliases, forwarding stubs, or deprecation shims.

The surviving implementation surface is:

- `plugins/ws/commands/ws-setup.md` — the public command entry and owner of discovery, unresolved-choice collection, validation, the complete plan, the single confirmation, ordered dispatch, verification, and reporting;
- `plugins/ws/skills/ws-project-bootstrap/` — an internal worker skill that owns the migrated tracker, triage, domain, and runtime-policy templates and applies the confirmed core manifest;
- `plugins/ws/skills/ws-docs-bootstrap/` — an internal worker skill owned by the docs domain that applies the confirmed full documentation-init manifest.

The legacy tracker, triage, domain, and model metadata assets move under `ws-project-bootstrap` and are rewritten for `.wsagency/config.yaml`, the supported tracker set, and the new Local/Jira synchronization contract. No file or directory with the legacy setup-skill name remains.

The canonical graph shows `/ws-setup` as a user-invoked command entry outside the `/ws-matt` router. It has worker edges to `ws-project-bootstrap` and, when documentation bootstrap is selected, `ws-docs-bootstrap`. Other entry nodes may recommend `/ws-setup` only as a user-mediated handoff; they never invoke it. `/ws-matt` removes `setup` from its routing table. A `/ws-matt` engineering flow without a supported config schema, valid `tracker.primary`, and the required core tracker artifacts stops before work and points the user to `/ws-setup`; mere existence of a docs-only `.wsagency/config.yaml` is not setup readiness.

Every legacy-config consumer changes atomically in the same implementation: `/ws-status`, `/ws-commit`, documentation commands and hooks, the dashboard, native runtime helpers, and all other readers use only `.wsagency/config.yaml`. Runtime dual-read compatibility is not retained after migration.

Help and documentation perform the same replacement: `/ws-help`, the command reference, README/install guidance, graph documentation, `UPSTREAM.md`, skills that mention setup prerequisites, and generated-package metadata name `/ws-setup` and the two internal workers only. The native omp package is rebuilt from source so it contains generated `commands/ws-setup.md` and the new worker skills, and contains no generated `ws-init` command or legacy setup skill.

Tests include a source-and-generated absence gate covering the removed command, route, directory, names, help/reference/graph text, and generated artifacts, in addition to positive discovery of `/ws-setup` and both internal workers. This gate is a permanent regression check, not a release-time manual grep.
