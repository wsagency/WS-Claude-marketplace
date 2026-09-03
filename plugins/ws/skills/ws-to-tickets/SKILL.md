---
name: ws-to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker — edges as text in one file per ticket locally, or native blocking links on a real tracker.
disable-model-invocation: true
disableModelInvocation: true
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it.

Before reading or publishing tracker state, resolve the installed ws plugin
root and request the `triage` capability through
`skills/ws-project-bootstrap/consumer.mjs#inspectCanonicalCapability`. Read the
tracker, Jira, pull-request, and five triage-label choices only from its
validated canonical config, then follow the returned operational adapters. If
blocked, report the canonical ownership line and exact blocker and stop;
detected repository-local legacy state is named and directed to `/ws-setup`,
never read as policy or replaced with defaults. Probe only the selected
tracker integration.

For every Local mutation with `jira.sync: all_local_tickets`, call
`runCanonicalSynchronizedTrackerOperation`, persist returned mappings and
pending work, and retry pending work before the next mutation. A Jira outage
keeps the Local ticket operation valid and records pending synchronization. A
same-field conflict stops before overwrite and offers Local, Jira, or manual
merge. Claims, shares, map pointers, and agent state remain local.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests) — vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges** — the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change — rename a column, retype a shared symbol — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket — green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish the tickets to the configured tracker

Publish the approved tickets through the operational adapter selected by canonical `tracker.primary`. The ticket content is the same; only the blocking-edge representation changes:

- **Local** → write one kebab-case file per ticket under `dev-docs/tickets/open/<slug>.md`, blockers first. Each `Blocked by:` line names its dependencies. Apply the configured `triage.labels.ready_for_agent` value.
- **GitHub** → create GitHub issues in dependency order with `gh`; use native blocked-by/sub-issue relationships when available.
- **GitLab** → create GitLab issues in dependency order with `glab`; use native blocking relationships when available.
- **Jira** → create issues in canonical `jira.project` with `jira-cli`, using `jira.default_issue_type` and native issue links for blockers.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close the parent issue. Once the children exist, remove any `ready-for-agent` label from the parent — it's a plan now, not a grabbable ticket, and leaving it labelled would put the whole multi-session build and each of its slices in the same agent queue.

<local-ticket-template>

# <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective — not a layer-by-layer implementation list.

**Blocked by:** the slugs/titles of the tickets that gate this one, or "None — can start immediately".

**Status:** ready-for-agent

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective — not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, or "None — can start immediately".

</issue-template>

In either form, avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

**Artifact language.** Everything this node writes — every ticket title, body, acceptance criterion and blocking note — is English, whatever language the conversation is in.

## After the tickets land

Building a ticket is **entry-tier** work. Recommend `/ws-matt implement` on a ready frontier ticket — never auto-invoke it, and never hand a whole ticket to a worker agent. A ticket is **ready** when it is open and its `Blocked by:` list has no open entries; it becomes eligible when every blocker is closed — on the local tracker, when every blocking slug has moved to `done/`. Clear context between tickets.

Two or more ready tickets are outer lanes only when they are independent,
substantial, and isolated in separate sessions/worktrees. Starting that batch
remains user-mediated; otherwise recommend one ready ticket at a time. Inner
`task` fan-out belongs inside a single `/ws-matt implement` run (its
`tdd-runner` cycles), never across whole tickets, and no ticket is scheduled at
both layers. The precedence table lives in `ws-graph-engineering`.

## Graph node

- **Tier:** user-invoked (entry)
- **Reads:** the plan/spec/conversation (or a passed spec path / canonical tracker issue with its comments), the codebase, `CONTEXT.md`, ADRs, and the named canonical tracker/triage capability
- **Emits:** one ticket per tracer-bullet vertical slice, each declaring its blocking edges through the configured Local, GitHub, GitLab, or Jira adapter and carrying the configured ready-for-agent label value
- **Edges:**
  - when done, recommend → ws-implement per frontier ticket (user-mediated: any ticket whose blockers are all done is grabbable; clear context between tickets)
  - the emitted blocking edges define the runtime frontier that later ws-implement sessions walk (blockers-first; expand–contract sequences for wide refactors)
- **Edge rule:** entry → worker only, never entry → entry — a continuation that lands on another entry node is a user-mediated handoff (recommend it; never auto-invoke it).
- **Handoff protocol:** the tickets are the state — reference them by file path or issue id; never carry ticket bodies forward in conversation (DONE|{dev-docs/tickets/open/ or tracker links}).
- **Exit report:** tickets written → ws-implement on the first frontier ticket (user-mediated: clear context between tickets; any no-open-blockers ticket is grabbable). (Format: `ws-graph-engineering`.)
