---
name: ws-to-spec
description: Turn the current conversation into a spec and publish it to the project issue tracker — no interview, just synthesis of what you've already discussed.
disable-model-invocation: true
disableModelInvocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec (you may know this document as a PRD). Do NOT interview the user — just synthesize what you already know.

The issue tracker and triage label vocabulary should have been provided to you — run `/ws-setup-matt-pocock-skills` if not.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Write the spec using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.

If an ADR-worthy decision crystallises while synthesizing the spec (hard to reverse, surprising without context, a real trade-off), record it via the `/ws-domain-modeling` skill (ADR in `dev-docs/decisions/`) — the spec cites the ADR rather than being its only record.

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
- **Reads:** the current conversation (the already-grilled idea — no interviewing), codebase state, the domain glossary in `CONTEXT.md`, ADRs, the tracker config in `dev-docs/agents/issue-tracker.md`
- **Emits:** a spec (Problem / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope) published to the issue tracker with the `ready-for-agent` label; test seams confirmed with the user before publishing
- **Edges:**
  - when an ADR-worthy decision crystallises during synthesis → ws-domain-modeling (ADR in `dev-docs/decisions/`)
  - when done, recommend → ws-to-tickets (user-mediated: the published spec is its input; keep the same context window through the split)
- **Edge rule:** entry → worker only, never entry → entry — a continuation that lands on another entry node is a user-mediated handoff (recommend it; never auto-invoke it).
- **Handoff protocol:** the spec lives on the tracker; reference it by issue, don't re-paste its body into later sessions (DONE|{spec issue link}).
- **Exit report:** spec published → ws-to-tickets (user-mediated: split into tracer-bullet tickets in the same context window); an ADR-worthy decision surfaced mid-synthesis → ws-domain-modeling (record the ADR the spec cites). (Format: `ws-graph-engineering`.)
