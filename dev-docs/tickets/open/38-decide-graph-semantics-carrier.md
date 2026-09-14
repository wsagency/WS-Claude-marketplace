# Decide how graph semantics carry across harnesses

Map: extend-ws-to-codex-and-sustain-skills
Label: wayfinder:grilling
Type: grilling
Status: ready-for-human
Blocked by: 36-decide-codex-distribution-channel

## Question

Where do graph-engineering semantics live so every harness enforces them identically? Claude Code receives session discipline through hooks, omp through packaged always-apply rules, and Codex delegates when `AGENTS.md` or skill instructions ask. Settle the single authoritative statement of the node/edge/state contract, exit-report format (ADR 0008), and orchestration-layer ownership (ADR 0009); which per-harness carrier delivers it; how a harness that cannot enforce a rule degrades explicitly rather than silently; and how drift between carriers is detected in verification.
