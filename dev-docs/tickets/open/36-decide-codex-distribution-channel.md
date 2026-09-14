# Decide the Codex distribution channel

Map: extend-ws-to-codex
Label: wayfinder:grilling
Type: grilling
Status: ready-for-human
Blocked by: 34-research-codex-extension-surface

## Question

How does the `ws` surface reach Codex: a third generated target built from `plugins/ws/` by the existing generator, a separate published package with its own lane, or marketplace-style installation of the repo checkout? Settle which artifacts a Codex user installs, whether the single-source generation property and marketplace lockstep versioning (ADR 0002) hold for that target, what the release gate is when installed-artifact verification cannot run the same way, and which parts of the surface (commands, skills, agents, hooks, tools) are deliberately not carried.

