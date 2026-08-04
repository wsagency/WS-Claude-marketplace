---
name: ws-prototype
description: Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or explore what a UI should look like.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Pick a branch

Identify which question is being answered — from the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a tiny interactive terminal app that pushes the state machine through cases that are hard to reason about on paper.
- **"What should this look like?"** → [UI.md](UI.md). Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.

The two branches produce very different artifacts — getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI) and state the assumption at the top of the prototype.

## Rules that apply to both

1. **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used (next to the module or page it's prototyping for) so context is obvious — but name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure.
2. **One command to run.** Whatever the project's existing task runner supports — `pnpm <name>`, `python <path>`, `bun <path>`, etc. The user must be able to start it without thinking.
3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. If the question explicitly involves a database, hit a scratch DB or a local file with a clear "PROTOTYPE — wipe me" name.
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.
6. **Capture it when done.** Fold any validated decision into the real code, then capture the prototype itself as a **primary source**: commit it to a throwaway branch, out of main. Leave a context pointer to that branch wherever the invoking node keeps state — the wayfinder prototype ticket's resolution comment, the implementation issue when one already exists, otherwise the grilling thread's `CONTEXT.md`/ADR entry — and name that location in the `DONE|{throwaway branch, state-pointer location}` return. Cleanup covers everything the prototype added, not just its code: remove the rule-2 task-runner entry (`package.json`/`Makefile`/`justfile`/`pyproject.toml`) and any rule-3 scratch store from main — the task-runner entry and any tracked scratch file (a `PROTOTYPE — wipe me` file) ride along to the throwaway branch; an untracked scratch DB is simply wiped once the verdict is recorded. Capture the answer too — the verdict and the question it settled — in that same state location. The main branch keeps only the validated decision.

## Graph node

- **Tier:** model-invoked (worker)
- **Reads:** the design question; the surrounding code (which decides the branch: backend module → logic, page/component → UI); the project's task-runner and routing conventions
- **Emits:** throwaway prototype code (interactive terminal app per [LOGIC.md](LOGIC.md), or structurally different UI variants per [UI.md](UI.md)) with full state surfaced; the validated answer; the prototype captured on a throwaway branch with a context pointer wherever the invoking node keeps state
- **Edges:**
  - when the question is "does this logic/state model feel right" → the LOGIC.md branch; when it's "what should this look like" → the UI.md branch (internal conditional)
  - then → return the verdict to the invoking node (a ws-grill-with-docs detour or a ws-wayfinder prototype ticket); the main branch keeps only the validated decision
- **Handoff protocol:** keep the answer, delete the prototype's code and its rule-2 task-runner entry and rule-3 scratch store from main — the prototype lives on its throwaway branch, referenced by branch name and a pointer to wherever the invoking node keeps state (DONE|{throwaway branch, state-pointer location}).
- **Exit report:** nested under a driver, return the verdict, the throwaway branch, and the state-pointer location as state delta (DONE|{throwaway branch, state-pointer location}) and emit no route; invoked directly, report the verdict — validated or rejected — and when a `/handoff` file names the driver that sent you here, route back to that driver (`/ws-grill-with-docs` or `/ws-wayfinder`) — a handoff-recorded driver is not an invented one; with no recorded driver, stop. (Format: `ws-graph-engineering`.)
