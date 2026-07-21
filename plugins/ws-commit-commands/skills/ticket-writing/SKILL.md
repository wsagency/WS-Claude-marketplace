---
name: ticket-writing
description: How to turn a brief task description into a well-structured Jira ticket (summary, user story, Given/When/Then acceptance criteria, codebase research). Use when writing or enhancing a Jira ticket, user story, or acceptance criteria, or when asked to "enhance" a task description.
---

# Ticket Writing

Transform an informal task description into a complete, actionable Jira ticket.

## Rules

1. Be specific — replace vague terms with concrete details
2. Infer reasonable context based on common software practices
3. Use Given/When/Then format for acceptance criteria
4. If critical information is missing, list clarifying questions at the end
5. Keep everything actionable and testable

## Codebase research

Before generating the ticket, assess whether you have enough context. If the task mentions specific components, services, or modules you're unfamiliar with; existing functionality that needs modification; technical terms or domain concepts unique to this project; or files, APIs, or systems that require understanding — search the currently open project first:

- Relevant source files and their structure
- Existing implementations of similar features
- Related tests that reveal expected behavior
- README files or documentation
- Configuration files that might be relevant

Use what you find to make the ticket more specific and accurate.

## Output structure

```markdown
## Summary
[One clear sentence describing what needs to be done]

## User Story
As a [specific role/persona],
I want [specific goal/action],
so that [measurable benefit/value].

### Background
[Why this task exists, business context, problem being solved]

### Technical Context
[Relevant findings from codebase research — existing patterns, related files,
dependencies. Omit if no codebase search was needed.]

## Acceptance Criteria
- [ ] Given [precondition], when [action], then [expected result]
- [ ] Given [precondition], when [action], then [expected result]

## Questions (if any)
> [Clarifying questions that need answers before development]
```

## Creating the ticket in Jira

When the repo is bound to a Jira project (`.claude/ws-project.yaml`), the ticket can be created directly via jira-cli:

```bash
jira issue create -t<Type> -s"<summary>" -b"<body>" -p<PROJECT> --no-input
```

- Type from `jira.default_issue_type` in the binding (Task if unset); override when the content clearly implies Bug/Story
- Body = everything below the Summary heading
- Print the created key and browse URL (`https://<site>/browse/<KEY>` — site from `~/.claude/ws/config.yaml`)
