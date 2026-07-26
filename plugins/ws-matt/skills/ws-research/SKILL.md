---
name: ws-research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Spin up a **background agent** to do the research, so you keep working while it reads.

Its job:

1. Investigate the question against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, default to `dev-docs/research/` (the internal authored-docs track) and say where.

## Graph node

- **Tier:** model-invoked (worker)
- **Reads:** the question; primary sources only — official docs, source code, specs, first-party APIs — following every claim back to the source that owns it
- **Emits:** a single Markdown findings file in the repo, each claim cited, saved where the repo already keeps such notes
- **Edges:**
  - fan-out: runs as a background agent so the caller keeps working (schema: the findings file path)
  - then → the findings file feeds the caller: a ws-wayfinder research ticket, or the main flow at ws-grill-with-docs (user-mediated — research feeds the thinking, it doesn't replace it)
- **Handoff protocol:** findings live in the file and are referenced by path — the background agent reports the path, not the content (DONE|{findings path}).
