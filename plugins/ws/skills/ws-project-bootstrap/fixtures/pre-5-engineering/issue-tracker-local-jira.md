# Issue tracker: Local Markdown + Jira sync

The working store for this repo's issues is local markdown under `dev-docs/tickets/`. Jira project **`<PROJECT-KEY>`** (bound via `.claude/ws-project.yaml`, `jira.project`) is a **stakeholder mirror**, not the working store: only stakeholder-relevant tickets are promoted to it, via the [jira-cli](https://github.com/ankitpokhrel/jira-cli) binary (`jira`) — same setup as the WS `/ws-init` flow (`JIRA_API_TOKEN` + `jira init`). Verify exact flags with `jira <command> --help` if a call errors.

Why local-first: local ticket files are the fastest tracker for agents — no CLI round-trips, and the fewest tokens to read. DONE tickets whose results are coded AND captured in dev-docs are archive: agents don't re-read them.

## Local store (the working store)

- `dev-docs/tickets/open/` — every ticket not yet done, one file per ticket, kebab-case: `open/<slug>.md`
- `dev-docs/tickets/done/` — the archive; moving a file here is closing the ticket
- A feature spec is a file in the same store: `open/<feature>-spec.md`

Ticket file shape:

```markdown
# <Ticket title>

jira: <KEY>   <- only present once the ticket is promoted to Jira

**What to build:** the end-to-end behaviour this ticket makes work.

**Blocked by:** <slug>, <slug> — or "None — can start immediately".

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2
```

- `Blocked by:` names other ticket files by slug. A ticket is unblocked when every slug it lists is in `done/`.
- `Status:` records the triage role (see `triage-labels.md` for the role strings) or `claimed`.
- Comments and conversation history append to the bottom of the file under a `## Comments` heading.

**The done-archive rule:** a ticket moves to `done/` only when its result is coded AND anything worth keeping has landed in dev-docs (decisions in `dev-docs/decisions/`, domain terms in `CONTEXT.md`). `done/` is an archive, not a knowledge base — agents do not re-read it.

## Jira sync rules

- **Promotion** — when a ticket is stakeholder-relevant (the user says so, or it changes something stakeholders track: scope, dates, user-visible behaviour), create the mirror: `jira issue create -tTask -s"..." -b"..." -p<PROJECT-KEY> --no-input` (heredoc/quoted body for multi-line; `-tBug`/`-tStory` when the content implies it), then record the returned key as a `jira: <KEY>` line directly under the local file's title.
- **Updates** — mirror stakeholder-relevant progress as comments: `jira issue comment add <KEY> "..." --no-input`. Don't mirror agent working notes.
- **Completion** — when the local ticket moves to `done/`, transition the mirror: `jira issue move <KEY> "Done"` (the CLI lists valid states when the name doesn't match).
- **Read / list** when needed: `jira issue view <KEY> --raw`; `jira issue list -q '<JQL>' --plain --no-headers --columns KEY,TYPE,STATUS,PRIORITY,SUMMARY`.
- A ticket without a `jira:` line never touches Jira — most tickets won't.
- The local file is authoritative; sync flows local → Jira. If a stakeholder edits the Jira issue, fold the change back into the local file by hand.

## When a skill says "publish to the issue tracker"

Write a new kebab-case file under `dev-docs/tickets/open/` (creating the directories if needed). Promote to Jira only per the sync rules above.

## When a skill says "fetch the relevant ticket"

Read the local file at the referenced path. Given a bare Jira key, find the local file carrying that `jira:` line; fall back to `jira issue view <KEY> --raw` only when no local file exists.

## Wayfinding operations

Same as the local tracker — the local store drives wayfinding. Maps and decision tickets normally stay local-only; promote a map to Jira only when stakeholders need it visible.

- **Map**: `dev-docs/tickets/open/<map>.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `dev-docs/tickets/open/<slug>.md` with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`.
- **Blocking**: the `Blocked by: <slug>, <slug>` line near the top. A ticket is unblocked when every file it lists is in `done/`.
- **Frontier**: the open tickets with no open blockers — scan `dev-docs/tickets/open/`, drop any file whose `Blocked by:` names a file still in `open/` and any file already claimed; when several are takeable, follow the order the map lists them in.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, move the file to `done/`, then append a context pointer (gist + link) to the map's Decisions-so-far in the map file. If the ticket carries a `jira:` line, also comment and `jira issue move <KEY> "Done"`.

## OpenWiki

`dev-docs/tickets/` is working state, NOT knowledge. When this repo (or its hub) uses OpenWiki, exclude the tracker from wiki coverage — add to the wiki's `INSTRUCTIONS.md`: do not index `dev-docs/tickets/` — working state, redundant tokens, potential confusion; knowledge lands in `dev-docs/decisions/` and the code.
