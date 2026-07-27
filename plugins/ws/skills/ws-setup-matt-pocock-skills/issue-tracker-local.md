# Issue tracker: Local Markdown (dev-docs/tickets/)

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files under `dev-docs/tickets/` — the working store for agent-driven work.

Why local-first: local ticket files are the fastest tracker for agents — no CLI round-trips, and the fewest tokens to read. DONE tickets whose results are coded AND captured in dev-docs are archive: agents don't re-read them.

## Layout

- `dev-docs/tickets/open/` — every ticket not yet done, one file per ticket, kebab-case: `open/<slug>.md`
- `dev-docs/tickets/done/` — the archive; moving a file here is closing the ticket
- A feature spec is a file in the same store: `open/<feature>-spec.md`

## Ticket file shape

```markdown
# <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work.

**Blocked by:** <slug>, <slug> — or "None — can start immediately".

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2
```

- `Blocked by:` names other ticket files by slug. A ticket is unblocked when every slug it lists is in `done/`.
- `Status:` records the triage role (see `triage-labels.md` for the role strings) or `claimed`.
- When a ticket is mirrored to Jira (local + Jira sync setups), a `jira: <KEY>` line sits directly under the title.
- Session evidence: when a work session on the ticket is worth reviewing (omp `/share` E2E-encrypted link, or an exported transcript), record it as a `share: <url>` line in the ticket file — the local-tracker equivalent of "attach the session to the ticket".
- Comments and conversation history append to the bottom of the file under a `## Comments` heading.

## The done-archive rule

A ticket moves to `done/` only when its result is coded AND anything worth keeping has landed in dev-docs (decisions in `dev-docs/decisions/`, domain terms in `CONTEXT.md`). `done/` is an archive, not a knowledge base — agents do not re-read it; everything a future session needs lives in the code and dev-docs.

## When a skill says "publish to the issue tracker"

Write a new kebab-case file under `dev-docs/tickets/open/` (creating the directories if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the slug directly.

## Wayfinding operations

Used by `/ws-wayfinder`. The **map** is a file with one sibling file per ticket.

- **Map**: `dev-docs/tickets/open/<map>.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `dev-docs/tickets/open/<slug>.md` with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`.
- **Blocking**: the `Blocked by: <slug>, <slug>` line near the top. A ticket is unblocked when every file it lists is in `done/`.
- **Frontier**: the open tickets with no open blockers — scan `dev-docs/tickets/open/`, drop any file whose `Blocked by:` names a file still in `open/` and any file already claimed; when several are takeable, follow the order the map lists them in.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, move the file to `done/`, then append a context pointer (gist + link) to the map's Decisions-so-far in the map file.

## OpenWiki

`dev-docs/tickets/` is working state, NOT knowledge. When this repo (or its hub) uses OpenWiki, exclude the tracker from wiki coverage — add to the wiki's `INSTRUCTIONS.md`: do not index `dev-docs/tickets/` — working state, redundant tokens, potential confusion; knowledge lands in `dev-docs/decisions/` and the code.
