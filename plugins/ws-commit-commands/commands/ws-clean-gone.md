---
allowed-tools: Bash(git branch:*), Bash(git worktree:*), Bash(git fetch:*)
description: Clean up git branches marked as [gone] and their worktrees
---

## Context

- Current branches with remote status: !`git branch -vv`
- Current worktrees: !`git worktree list`

If any Context value above still shows an unexpanded shell command (an exclamation mark followed by a backtick-quoted command), your runtime does not pre-execute context commands — run each one via bash now, before proceeding.

## Your task

Clean up all git branches marked as [gone] (branches that have been deleted on the remote but still exist locally):

1. First, fetch and prune remote tracking branches: `git fetch --prune`
2. List branches marked as [gone]: `git branch -vv | grep ': gone]'`
3. For each gone branch:
   - Check if it has an associated worktree and remove it first: `git worktree remove <path>`
   - Then delete the branch: `git branch -D <branch-name>`
4. Report what was cleaned up

Do not delete the current branch. Switch to main/master first if the current branch is marked as gone.
