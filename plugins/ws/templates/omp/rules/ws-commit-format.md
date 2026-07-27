---
description: WS commit conventions reminder on every commit attempt
condition: "git commit"
scope: "tool:bash(*)"
repeatMode: after-gap
---

# WS commit conventions

Before committing, confirm the message follows WS rules:

- Conventional Commits: `<type>(<scope>): <imperative description>`
- Jira ticket key in the subject suffix when the branch carries one: `(WSC-123)`
- Trailer block: `Refs: <KEY>` + `Co-Authored-By: WS Agency AI suite <ai@ws.agency>`
- CHANGELOG entries land at PR time via /ws-commit pr — do not hand-write
  them per commit.

If the message already complies, proceed.
