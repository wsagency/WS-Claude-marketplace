---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
description: Create a git commit
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

Based on the above changes, create a single git commit with an appropriate message.

1. Stage the relevant files (prefer specific files over `git add -A`)
2. Create a commit with a clear, conventional commit message
3. Include `Co-Authored-By: WS Agency AI suite <ai@ws.agency>` in the commit message
4. You MUST do all of the above in a single message. Do not use any other tools or do anything else. Do not send any other text or messages besides these tool calls.
