---
name: ws-to-spec
description: Turn the current conversation into a spec and publish it to the project issue tracker — no interview, just synthesis of what you've already discussed.
disable-model-invocation: true
disableModelInvocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec (you may know this document as a PRD). Do NOT interview the user — just synthesize what you already know.

Before fetching or publishing tracker state, resolve the installed ws plugin
root and request the `triage` capability through
`skills/ws-project-bootstrap/consumer.mjs#inspectCanonicalCapability`; request
`domain` separately before reading the domain layout. Read tracker, Jira,
pull-request, triage-label, and domain choices only from the returned canonical
policy, then follow its operational adapters. A blocked capability reports the
canonical ownership line and exact blocker and stops that operation; detected
repository-local legacy state is named and directed to `/ws-setup`, never read
or defaulted. Do not probe integrations unrelated to the selected tracker.

When publishing to Local with `jira.sync: all_local_tickets`, use
`runCanonicalSynchronizedTrackerOperation` for the create/status operation and
persist returned mappings and pending state. Jira outage leaves the Local spec
published with pending sync. A same-field conflict stops before overwrite and
offers Local, Jira, or manual merge. Local-only workflow metadata is never sent
to Jira.

## Process

1. **Fetch any passed reference.** If invoked with a reference (a spec path, an issue number or URL, or a `wayfinder:map` issue), fetch it and read its full body and comments. For a map, the map is an index, not a store — read its body **and** the resolution comment of every closed child ticket its **Decisions so far** section links before synthesizing (the decisions live in those tickets, not the map); children listed under the map's **Out of scope** section feed only the spec's Out of Scope section. This is fetching, not interviewing — it does not relax the no-interview rule.

2. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

3. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

4. Write the spec using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label only when the build fits a single session — a multi-session spec gets no state role here (ws-to-tickets stamps its slices `ready-for-agent`); either way, no need for additional triage.

If an ADR-worthy decision crystallises while synthesizing the spec (hard to reverse, surprising without context, a real trade-off), record it via the `/ws-domain-modeling` skill — it chooses the hub, repo-root, or bounded-context `dev-docs/decisions/` by scope. The spec cites the ADR rather than being its only record.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>

## Graph node

- **Tier:** user-invoked (entry)
- **Reads:** the current conversation (the already-grilled idea — no interviewing) or a passed reference (spec path / canonical tracker issue / `wayfinder:map` issue, read with its body and the resolution comments of the closed children its **Decisions so far** links — out-of-scope children feed only the spec's Out of Scope), codebase state, domain policy and glossary, ADRs, and the canonical tracker/triage capability
- **Emits:** a spec (Problem / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope) published through the configured canonical tracker adapter — with the configured `triage.labels.ready_for_agent` value only when the build fits a single session
- **Edges:**
  - when an ADR-worthy decision crystallises during synthesis → ws-domain-modeling (ADR routed to hub, repo root, or bounded context by scope)
  - multi-session spec (no state role) → ws-to-tickets (user-mediated: the published spec is its input; keep the same context window through the split)
  - single-session spec (labelled `ready-for-agent`) → ws-implement (user-mediated: the spec is ready to build in this context window)
- **Edge rule:** entry → worker only, never entry → entry — a continuation that lands on another entry node is a user-mediated handoff (recommend it; never auto-invoke it).
- **Handoff protocol:** the spec lives on the tracker; reference it by issue, don't re-paste its body into later sessions (DONE|{spec issue link}).
- **Exit report:** spec published — multi-session spec (no state role) → ws-to-tickets (user-mediated: split into tracer-bullet tickets in the same context window); single-session spec (labelled `ready-for-agent`) → ws-implement (user-mediated: build it in this context window); an ADR-worthy decision surfaced mid-synthesis → ws-domain-modeling (record the ADR the spec cites). (Format: `ws-graph-engineering`.)
