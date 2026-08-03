---
name: ws-research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Spin up a **`researcher` worker agent** to do the research, so you keep working while it reads.

> **Autoloaded by the `researcher` leaf agent?** Skip the fan-out above — you *are* the worker:
> investigate the single question you were given and return its findings path. Only a caller
> that owns scheduling fans out researchers.

Its job:

1. Investigate the question against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, default to `dev-docs/research/` (the internal authored-docs track) and say where.

## Graph node

- **Tier:** model-invoked (worker)
- **Reads:** the question; primary sources only — official docs, source code, specs, first-party APIs — following every claim back to the source that owns it
- **Emits:** a single Markdown findings file in the repo, each claim cited, saved where the repo already keeps such notes
- **Edges:**
  - fan-out: spawn a researcher worker agent to investigate in the background — one per question, fanned out in parallel when there are several — so the caller keeps working (schema: the findings file path)
  - then → the findings file feeds the caller: a ws-wayfinder research ticket, or the main flow at ws-grill-with-docs (user-mediated — research feeds the thinking, it doesn't replace it)
- **Handoff protocol:** findings live in the file and are referenced by path — the background agent reports the path, not the content (DONE|{findings path}).
- **Exit report:** nested under a driver, return the findings file path as state delta (DONE|{findings path}) and emit no route; invoked directly, report the findings file and where it landed → ws-grill-with-docs to take it into the main flow (user-mediated). (Format: `ws-graph-engineering`.)
