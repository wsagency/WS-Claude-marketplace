---
allowed-tools: Bash, Glob, Grep, Read, Task, AskUserQuestion
description: Turn a brief description into a well-structured Jira ticket, optionally creating it via jira-cli
argument-hint: <brief task description>
---

## Context

- Project binding: !`cat ./.claude/ws-project.yaml 2>/dev/null || echo "(no project binding)"`
- Global config: !`cat ~/.claude/ws/config.yaml 2>/dev/null || echo "(none)"`

## Your task

Turn the user's brief description into a complete Jira ticket, following the **ticket-writing skill** (it defines the rules, the codebase-research step, and the output structure — apply it exactly).

Replaces the retired `/ws-jira-enhancer` command.

### 1. Generate

Apply the ticket-writing skill to:

$ARGUMENTS

Render the full ticket (Summary / User Story / Background / Technical Context / Acceptance Criteria / Questions) in the conversation.

### 2. Offer creation (only when bound)

If `./.claude/ws-project.yaml` has a `jira.project` binding:

Ask (AskUserQuestion): **Create this ticket in Jira?**
- **Create** — run the `jira issue create` invocation from the skill's "Creating the ticket in Jira" section (project + default type from the binding; let the user override the type if the content implies Bug/Story)
- **No, text only**

On success, print the created key and browse URL. On CLI failure, surface the error — the generated text remains usable for manual creation.

If there is no binding, skip the question and note that `/ws-init` can bind the project to enable direct creation.
