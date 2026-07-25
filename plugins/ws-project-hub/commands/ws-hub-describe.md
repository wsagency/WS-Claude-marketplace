---
allowed-tools: Bash, Read, Edit, Glob, Task
description: Refresh descriptions and tech fields in project.yaml by reading each sub-repo
---

## Context

- Hub directory: !`pwd`
- project.yaml: !`cat ./project.yaml 2>/dev/null || echo "(missing)"`

> If any Context value above still shows an unexpanded shell command (an exclamation mark followed by a backtick-quoted command), your runtime does not pre-execute context commands — run each one via bash now, before proceeding.

## Your task

1. Verify `project.yaml` exists.

2. For each registered repo with an accessible local path:
   - Read its `README.md` (or `README` / first `.md` file at root)
   - Check the repo root for the manifest files listed in the project-hub-conventions skill's "Tech inference" table — that table is the single source for the manifest → tech mapping
   - Glance at top-level directory structure

3. Propose updates to `description` and `tech` fields. Show the user a diff (current vs proposed) and ask for confirmation before writing.

4. After confirmation, update `project.yaml` (preserve formatting — use Edit for targeted replacements).

5. Regenerate the `AGENTS.md` region between `<!-- ws-hub:repos:start -->` and `<!-- ws-hub:repos:end -->` from the updated yaml (see the marker-pair definition in the project-hub-conventions skill).

6. For projects with 4+ sub-repos, optionally delegate the per-repo analysis to the `hub-architect` agent via the Task tool (omp: its task agent) in parallel to keep it fast.

Be conservative — only overwrite a `description` if the new one is clearly better than the existing one (e.g. existing is `"TODO"` or empty).
