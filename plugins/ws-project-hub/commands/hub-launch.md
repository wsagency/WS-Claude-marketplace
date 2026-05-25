---
allowed-tools: Bash
description: Launch Claude Code from the current hub via invoke-ai.sh
---

## Context

- Current directory: !`pwd`
- invoke-ai.sh present: !`[ -x ./invoke-ai.sh ] && echo yes || echo no`
- project.yaml present: !`[ -f ./project.yaml ] && echo yes || echo no`

## Your task

If both `invoke-ai.sh` and `project.yaml` exist in the current directory, instruct the user to run `./invoke-ai.sh` in their own shell (Claude Code can't re-launch itself from inside a session).

If they're missing, the current directory isn't a project hub — tell the user to either `cd` into one or run `/hub-init` to create one.

Do not execute `invoke-ai.sh` yourself. Just print the command the user should run, e.g.:

```
You're in a project hub. To launch Claude with all sub-repos mounted, run:

    ./invoke-ai.sh

(from a fresh shell, not from inside this session)
```
