---
allowed-tools: Bash, Read
description: Run one git operation across all registered sub-repos — pull (ff-only) or clone missing ones
argument-hint: <pull|clone>
---

## Context

- Hub directory: !`pwd`
- Verb argument: `$ARGUMENTS`
- project.yaml: !`cat ./project.yaml 2>/dev/null || echo "(missing — run /ws-hub-init first)"`

> If any Context value above still shows an unexpanded shell command (an exclamation mark followed by a backtick-quoted command), your runtime does not pre-execute context commands — run each one via bash now, before proceeding.

## Your task

One traversal of the registered repos; the verb argument picks the git operation.

### 0. Resolve the verb

`$ARGUMENTS` must be `pull` or `clone`:

- **pull** — `git pull --ff-only` every registered repo that's on disk
- **clone** — clone every registered `url` into its missing path

Anything else (or no argument): abort and print usage: `/ws-hub-repos <pull|clone>`.

### 1. Verify the hub

`project.yaml` must exist in the current directory. If not, abort and tell the user this command must be run from a hub repo (hint: `/ws-hub-init`).

### 2. Traverse

Parse the list of repos from `project.yaml` (read the file directly). For each repo, resolve its absolute path relative to the hub, then apply the verb:

**pull** (in parallel where possible):

- Path doesn't exist → report `⊘ skipped (no local checkout)` and continue
- Path exists but isn't a git repo → report `⊘ skipped (not a git repo)`
- Otherwise → run `git -C <path> pull --ff-only`, capture output, tag the result with the repo name

**clone** (one at a time — don't parallelize, to keep output legible and credentials prompts working):

- Path exists and is a git repo → `✓ already present`
- Path missing and `url` registered → `git clone <url> <path>`; on success `✓ cloned <name>`
- Path missing and no `url` in yaml → `⊘ no url registered — cannot clone`
- On clone failure (no access, bad URL, network) → `✗ <name>: <one-line error>` and continue with the next. Do NOT prompt for credentials beyond what git itself does; if git fails, fail this repo and move on.

### 3. Verify hub cleanliness (clone only)

After all clones, run `git status` in the hub. Sub-repos registered with `./` paths should be filtered by `.gitignore`. If any show up as untracked, report which.

### 4. Summary table

```
acme-app         ✓ Fast-forwarded 3 commits
acme-marketing   ✓ already present
acme-design      ⊘ skipped (no local checkout)
acme-docs        ✗ failed: <error>
```

### Safety rules

- Do not push, do not merge non-fast-forward, do not touch uncommitted changes. If `pull --ff-only` fails because of local changes or divergence, report it but don't try to resolve.
- Read-only with respect to the hub's git — `clone` creates folders but doesn't commit.

`/ws-hub-repos clone` is the natural follow-up after cloning the hub on a new machine.
