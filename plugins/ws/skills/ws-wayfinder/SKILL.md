---
name: ws-wayfinder
description: Plan a huge chunk of work — more than one agent session can hold — as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear.
disable-model-invocation: true
disableModelInvocation: true
---

A loose idea has arrived — too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** on the repo's issue tracker, then works its **decision tickets** — questions whose resolution is a decision, not slices of a build to execute — one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting — it shapes every ticket. It might be a spec to hand off and iterate on, a decision to lock before planning starts, or a change made in place like a data-structure migration. The map is domain-agnostic — engineering work, course content, whatever fits the shape.

## Plan, don't do

Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear — nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes** — carrying execution into the map itself — but absent that, produce decisions, not deliverables.

## Refer by name

Every map and ticket is an issue, so it has a **name** — its title. In everything the human reads — narration, the map's Decisions-so-far — refer to it by that name, never by a bare id, number, or slug. A wall of `#42, #43, #44` is illegible; names read at a glance. The id and URL don't vanish — a name wraps its link — but they ride *inside* the name, never stand in for it.

## Canonical tracker contract

Resolve the installed ws plugin root and request `triage` plus `domain` through
`skills/ws-project-bootstrap/consumer.mjs#inspectCanonicalCapability`. Read
tracker, Jira, triage-label, and domain-layout choices only from the returned
canonical policy, then follow its operational adapters. If either capability
is blocked, report its ownership line and exact blocker and stop; detected
repository-local legacy state is named and directed to `/ws-setup`, never read
as policy or replaced by a Local default. Probe only the selected tracker
integration.

Every Local mutation with `jira.sync: all_local_tickets` runs through
`runCanonicalSynchronizedTrackerOperation`. Persist mappings and pending state,
retry pending work first, keep the Local operation available through Jira
outages, and stop before overwrite on same-field conflicts with Local, Jira,
and manual-merge choices. Claims, shares, map pointers, and agent state remain
local.

## The Map

The map is a single issue on this repo's issue tracker, labelled `wayfinder:map` — the canonical artifact. Its tickets are child issues of the map. On a tracker without native sub-issue parentage (for example, Local Markdown), each child ticket carries a `Map: <map-slug>` line — mirroring `Part of #<map>` — so the frontier can be scoped to this map's children and the map file itself excluded.

The map is an **index**, not a store. It lists the decisions made and points at the tickets that hold their detail; a decision lives in exactly one place — its ticket — so the map never restates it, only gists it and links.

**Where the map, its child tickets, blocking, and frontier queries physically live is tracker-specific.** Consult the ready canonical tracker adapter's "Wayfinding operations" section; never infer a tracker from repository files.

### The map body

The whole map at low resolution, loaded once per session. Open tickets are **not** listed — they are open child issues, found by query.

```markdown
## Destination

<what reaching the end of this map looks like — the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this effort>

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [<closed ticket title>](link) — <one-line gist of the answer>

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
```

### Tickets

Each ticket is a **child issue** of the map; the tracker's issue id is its identity. Its body is the question, sized to one 100K token agent session:

```markdown
## Question

<the decision or investigation this ticket resolves>
```

Each ticket carries a `wayfinder:<type>` label — one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)).

A session **claims** a ticket by assigning it to the dev driving the map, **first**, before any work, so concurrent sessions skip it. That assignee _is_ the claim: an open, unassigned ticket is unclaimed. A session that ends without resolving its ticket **unassigns it first** — release the claim so the frontier heals — and a claimed ticket whose assignee has posted no activity since the claim is **stale** and may be re-claimed by a later session.

Blocking uses the tracker's **native** dependency relationship — essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is **unblocked** when every ticket blocking it is closed; the **frontier** is the open, unblocked, unclaimed children — scoped to those carrying the map's pointer on trackers without native parentage, and excluding the map file itself — the edge of the known.

The answer isn't part of the body — it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.

## Ticket Types

Every ticket is either **HITL** — human in the loop, worked *with* a human who speaks for themselves — or **AFK**, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a `/ws-research` **subagent**. Use when knowledge outside the current working directory is required.
- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to — an outline, a rough take, a stub, or UI/logic code via the /ws-prototype skill. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- **Grilling** (HITL): Conversation via the /ws-grilling and /ws-domain-modeling skills, one question at a time. The default case.
- **Task** (HITL or AFK): Manual work that must happen before a *decision* can be made — nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that *does* rather than decides — and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the answer records what was done and any resulting facts (credentials location, new URLs, row counts) later tickets depend on.

## Fog of war

The map is _deliberately_ incomplete: don't chart what you can't yet see. Beyond the live tickets lies the **fog of war** — the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. Resolving a ticket clears the fog ahead of it, graduating whatever's now specifiable into fresh tickets — one at a time, until the way to the destination is clear and no tickets remain.

The map's **Not yet specified** section is where that dim view is written down: the suspected question, the area to revisit later. It's the undiscovered frontier _toward_ the destination — everything here is in scope, just not sharp enough to ticket. Write as loosely or as fully as the view allows; it doubles as a signpost for collaborators reading where the effort is headed.

**Fog or ticket?** The test is whether you can state the question precisely now — _not_ whether you can answer it now.

- **Ticket when** the question is already sharp — even if it's blocked and you can't act on it yet.
- **Not yet specified when** you can't yet phrase it that sharply. Don't pre-slice the fog into ticket-sized pieces: it's coarser than a ticket, and one patch may graduate into several tickets, or none, once the frontier reaches it.

**Not yet specified** excludes what's already decided (Decisions so far), what's already a live ticket, and what's out of scope (the next section).

## Out of scope

Fog only ever gathers _toward_ the destination. The destination fixes the scope, so work beyond it is **out of scope** — it isn't fog, and it doesn't belong in **Not yet specified**. It gets its own **Out of scope** section on the map: work you've consciously ruled out of _this_ effort. Scope, not sharpness, lands it here.

Out-of-scope work never graduates — the frontier stops at the destination — so it returns only if the destination is redrawn, and then as a fresh effort, not a resumption.

Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination — mis-scoped in while charting, or exposed by a resolution — **close it** (a closed ticket is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed ticket. It stays out of **Decisions so far**, which records the route actually walked — a scope boundary isn't a step on it.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session** — with the exception of research tickets.

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Run a `/ws-grilling` and `/ws-domain-modeling` session to pin down what this map is finding its way to — the spec, decision, or change. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first** this time: fan out across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. **If this surfaces no fog** — the way to the destination is already clear, the whole journey small enough for one session — you don't need a map. Stop and ask the user how they'd like to proceed.
3. **Create the map** (label `wayfinder:map`): Destination and Notes filled in, Decisions-so-far empty, the fog sketched into **Not yet specified**.
4. **Create the tickets you can specify now** as child issues of the map — then wire blocking edges in a **second pass** (issues need ids before they can reference each other). Wiring sorts them into the frontier and the blocked; everything you can't yet specify stays in the fog — the **Not yet specified** section.
5. **Fire the research workers.** For each `research` ticket you just created: **claim it** (assign it to yourself, first, before any work), then resolve it with `/ws-research`. At two or more tickets this fans out by default, one `researcher` per ticket, in parallel — omp: one batched `task` call, one item per ticket carrying `agent: researcher` and, when the active schema exposes it, `effort: med`; Claude Code: one Task call per ticket in a single message. Each `researcher` returns `DONE|{path}` to its scratch dir — the charting session persists those findings into `dev-docs/research/` and writes that path onto the ticket. On a worker's return, **resolve the ticket** by the work-through step-4 ritual below: post the answer as a **resolution comment** pointing at the findings file, **close** the issue, and **append** a one-line gist to the map's Decisions-so-far. This is the one-per-session exception stated at the top of ## Invocation — charting resolves its own research tickets inline and leaves none open.
6. Stop — charting is one session's work; it resolves only its own research tickets (step 5), leaving every other ticket open for a working session.

### Work through the map

User invokes with a map (URL or number). A ticket is **optional** — without one, you pick the next decision, not the user.

1. Load the **map** — the low-res view, not every ticket body.
2. Choose the ticket. If the user named one, use it. Otherwise take the first frontier ticket in order — **ascending ticket id**, i.e. creation order (the map body carries no separate ordering of open tickets; it doesn't list them). **Claim it**: assign it to yourself before any work.
3. Resolve it — **zoom as needed**: fetch the full body of any related or closed ticket on demand; invoke the skills the `## Notes` block names. If in doubt, use `/ws-grilling` and `/ws-domain-modeling`.
4. Record the resolution: post the answer as a **resolution comment**, **close** the issue, and **append a context pointer** to the map's Decisions-so-far.
5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. If the answer reveals a ticket — this one or another — sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.
6. **When the frontier is empty.** If no open child tickets remain, check **Not yet specified**: if it is empty too, the map is **clear** — hand off to ws-to-spec; if fog remains, re-run charting step 2's breadth-first grill to graduate it into fresh tickets before the next working session, rather than shipping a spec over unmade decisions.

The user may run unblocked tickets in parallel, so expect other sessions to be editing the tracker concurrently. Those concurrent tickets are outer lanes — one session per ticket, Herdr's backend when `HERDR_ENV=1` and the lane shape holds — while the research fan-out inside this session is inner `task` work. The same ticket is never scheduled at both layers; the precedence table lives in `ws-graph-engineering`.

**Artifact language.** Everything this node writes — the map, its tickets, resolution comments, and the findings files researchers produce — is English, whatever language the conversation is in.

## Graph node

- **Tier:** user-invoked (entry)
- **Reads:** charting — the loose idea; working — the map issue (`wayfinder:map`) at low resolution, the frontier of open, unblocked, unclaimed child tickets, canonical tracker/triage/domain policy, and the selected operational adapter
- **Emits:** the map issue; decision tickets as child issues with configured labels and adapter-specific blocking edges; one resolution per session (resolution comment + close + a Decisions-so-far pointer on the map); persisted Local/Jira pending or mapping state when configured; graduated fog; out-of-scope rulings
- **Edges:**
  - fan-out (default at 2+ tickets): for each `research` ticket spawn ws-research via a `researcher` agent (schema: the researcher returns `DONE|{path}`; the charting session persists the findings into `dev-docs/research/`, writes that path onto the ticket, and resolves the ticket by the work-through step-4 ritual)
  - when ticket type = prototype → ws-prototype (HITL — a concrete artifact to react to)
  - when ticket type = grilling → ws-domain-modeling, driven with /ws-grilling (HITL, the default type)
  - when the map is clear → hand off to ws-to-spec, which collapses the linked decisions into a buildable plan (user-mediated — wayfinder hands off, it never builds)
- **Edge rule:** entry → worker only, never entry → entry — a continuation that lands on another entry node is a user-mediated handoff (recommend it; never auto-invoke it).
- **Handoff protocol:** the map and its tickets on the canonical tracker are shared state; assets are linked from issues, never pasted; claim a ticket by assignment before working it (DONE|{map link}).
- **Exit report:** select the single most-likely next move: map clear (no open child tickets **and** an empty **Not yet specified**) → ws-to-spec (collapse the linked decisions into a buildable plan; user-mediated — wayfinder hands off, never builds); no open child tickets but **Not yet specified** still carries fog → re-run the charting step 2 breadth-first grill to graduate it into fresh tickets, then re-invoke ws-wayfinder; frontier empty but open children remain (claimed elsewhere or blocked) → stop and report the frontier is occupied; re-claim only a stale claim; otherwise re-invoke ws-wayfinder on the next frontier ticket. The user invokes the next entry; never auto-invoke it. (Format: `ws-graph-engineering`.)
