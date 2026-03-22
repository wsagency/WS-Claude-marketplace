---
description: Generate a CONTRIBUTING.md file by analyzing the project's tooling and workflows
arguments:
  - name: output-path
    description: Where to save the file (default: ./CONTRIBUTING.md)
    required: false
allowed_tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
---

# Generate Contributing Guide

Analyze the project and generate a comprehensive CONTRIBUTING.md that covers everything a new contributor needs.

## Your Task

1. **Scan the project** for tooling, configuration, and conventions
2. **Detect** the package manager, linting tools, test framework, CI setup, and git hooks
3. **Generate CONTRIBUTING.md** with exact commands from the actual project
4. **Verify** that documented commands work

## Process

Use the `contributing-generator` agent to:
1. Analyze package.json, lockfiles, and configuration files
2. Detect code quality tools (ESLint, Prettier, etc.)
3. Identify testing framework and commands
4. Check for git hooks (husky, commitlint)
5. Review CI workflows for requirements
6. Generate the guide with real, tested commands

## Sections Generated

The CONTRIBUTING.md will cover:

- **Development Environment Setup** — Clone, install, configure, run
- **Code Style** — Linting and formatting tools with commands
- **Git Workflow** — Branch naming, commit messages, PR process
- **Testing** — How to run tests, coverage requirements
- **Project Structure** — Directory overview
- **Documentation** — How to update docs
- **Getting Help** — Where to ask questions

## Skills to Use

Load these skills for reference:
- `conventional-commits` — For commit message guidelines
- `style-guide` — For code style and documentation standards

## Important

- Use **exact commands** from the project's package.json scripts
- Use the **correct package manager** (npm/pnpm/yarn)
- Don't include generic instructions — everything should be project-specific
- Test that setup commands actually work

## Examples

`/contributing` — Generate CONTRIBUTING.md in project root
`/contributing docs/CONTRIBUTING.md` — Save to custom path
