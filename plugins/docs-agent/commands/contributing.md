---
description: Generate a 3-file CONTRIBUTING set — thin root router, user-facing docs/contributing.md, and internal dev-docs/development.md
arguments:
  - name: output-path
    description: Override the default routing (rarely needed)
    required: false
allowed_tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
---

# Generate Contributing Guide (3 files)

Per the `dual-track-docs` convention, contributing information lives in three files: a thin router at the repo root, user-facing guidance in `docs/contributing.md`, and internal dev-setup guidance in `dev-docs/development.md`.

## Your Task

1. **Scan the project** for tooling, configuration, conventions, package manager, linting tools, test framework, CI setup, and git hooks. Use the `contributing-generator` agent.
2. **Generate three files**:

   **Root `CONTRIBUTING.md`** — exactly the following content (no project-specific text):

   ```markdown
   # Contributing

   Thanks for your interest in this project.

   - **Reporting bugs or requesting features?** See [docs/contributing.md](docs/contributing.md).
   - **Setting up the project to contribute code?** See [dev-docs/development.md](dev-docs/development.md).
   ```

   **`docs/contributing.md`** (user-facing) — covers:
   - How to file a bug report (link to issues, what to include)
   - How to propose a feature
   - How to ask a question / get support
   - Code of Conduct reference (if present)

   **`dev-docs/development.md`** (internal) — covers:
   - Local setup steps (from package manager / lockfile detection)
   - Test commands (from project's actual test config)
   - Lint and format commands
   - Conventional Commits requirement (link to `conventional-commits` skill content)
   - PR workflow (branch naming, review process, CI gates)
   - Code style notes (from `style-guide` skill, code section)

3. **Verify** that any commands documented in `dev-docs/development.md` actually exist in the project (e.g. if you write `npm test`, ensure `test` is a script in `package.json`).
4. **Do not overwrite** existing files without warning the user. If any of the three target files already exist, show a diff and ask before writing.

## Skills to Use

- `dual-track-docs` — convention rules
- `conventional-commits` — commit format reference for `dev-docs/development.md`
- `style-guide` — prose style for user file, code style for dev file

## Agents

- `contributing-generator` — pass `destination_track` per file as needed; the agent splits content by audience.
