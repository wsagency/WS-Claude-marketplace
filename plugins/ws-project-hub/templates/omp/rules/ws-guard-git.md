---
description: Interrupt dangerous git operations before they run
condition: "git push[^\\n]*--force|git reset --hard origin|git clean -fd"
scope: "tool:bash(*)"
interruptMode: immediate
---

# Dangerous git operation

STOP. You are about to run a destructive git command (force-push, hard reset
to origin, or clean). WS convention: these are never run without the user
explicitly asking for that exact command in this session. If the user did not,
propose the safe alternative (new branch, revert commit, stash) and ask.
