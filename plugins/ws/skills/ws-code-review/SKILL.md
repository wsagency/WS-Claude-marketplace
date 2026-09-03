---
name: ws-code-review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes — Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/PRD asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / PRD / spec?

The applicable axes run as **parallel sub-agents** so they do not pollute each
other's context, then this skill aggregates their findings. Standards always
runs; Spec runs when a spec exists. At two axes, fan-out is the default.

> Autoloaded by the `ws-reviewer` leaf agent? Skip the fan-out in step 4 — you
> are one reviewer. Perform only the Standards or Spec axis named in your prompt,
> write the full write-up to the per-run scratch directory named in your prompt,
> and return `DONE|{path}` to the caller.

When an issue or PR is needed as the spec source, resolve the installed ws
plugin root and call
`skills/ws-project-bootstrap/consumer.mjs#inspectCanonicalCapability` for the
`tracker` capability. Follow the returned
`dev-docs/agents/issue-tracker.md` operational adapter only after readiness
succeeds. A blocked tracker lookup reports the returned canonical ownership
line and exact blocker (including the detected repository-local legacy source
and `/ws-setup` route) and then continues to non-tracker spec sources; it never
reads legacy policy or guesses a tracker. Reviews whose spec is already a path
do not probe tracker integrations.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they didn't specify one, ask for it.

Capture the diff command once, branching on tree state:

- If the change under review is already committed: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base).
- If it is still uncommitted in the working tree: stage untracked files as intent-to-add first — `git add -N -- .` (it respects `.gitignore`, so ignored files and a gitignored scratch directory stay out) — then capture `git diff $(git merge-base <fixed-point> HEAD)`, which now includes new files as well as modifications to tracked ones. The sub-agents run that same diff command themselves, so the intent-to-add must be in place before fan-out.

Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the captured diff is non-empty. Judge non-emptiness on the diff output itself, not on whether the tree is dirty: after `git add -N`, a change that adds only ignored files can still yield an empty diff, and that is a real empty diff — fail here, not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.) — when tracker readiness succeeds, fetch through its canonical operational adapter.
2. A path the user passed as an argument.
3. A PRD/spec file under `docs/`, `specs/`, or `dev-docs/tickets/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below — a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation — and, like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn the applicable reviewers in parallel

The two-axis fan-out is the **default** — one `ws-reviewer` per applicable axis,
both at once. If no spec was found, run Standards alone and skip Spec (see
below). The assignments are disjoint (one axis each), so findings merge by
appending per axis and are never reranked across axes.

Pick and create one per-run scratch directory for this review outside the tracked tree (or at a gitignored path), and name that same path in both reviewer prompts below — the reviewers write their full write-ups there and return `DONE|{path}`, never pasting the write-up into the conversation. An outside-tree or ignored path keeps the write-ups out of the step-1 diff and out of the follow-up commit.

omp: one batched `task` call — `{ context, tasks: [...] }`, shared context in
`context`, one item per axis carrying `agent: ws-reviewer` and, when the active
schema exposes it, `effort: hi` (review is the deepest-judgement work;
`ws-reviewer` ships on the `@slow` role). Claude Code: two Task calls in a single
message. The role/effort table and backend precedence live in
`ws-graph-engineering`.

**Standards sub-agent prompt** — include:

- The per-run scratch directory you picked for this review (name the path), where the reviewer writes its full write-up.
- The full diff command and commit list.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full — the sub-agent has no other access to it.
- The brief: "Write the full write-up to the scratch directory named above and return `DONE|{path}` — never paste the full write-up into the conversation. Report — per file/hunk where relevant — (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls — documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** — include:

- The same per-run scratch directory (name the path), where the reviewer writes its full write-up.
- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Write the full write-up to the scratch directory named above and return `DONE|{path}` — never paste the full write-up into the conversation. Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

**Artifact language.** Everything this node writes — the two axis reports and any review write-up a `ws-reviewer` files in the scratch directory — is English, whatever language the conversation is in. A translation is a derived copy; the original stays English.

### 5. Aggregate

Open each reviewer's returned `DONE|{path}` artifact and present its contents under `## Standards` and `## Spec` headings, verbatim or lightly cleaned — the reviewers return a path, not the write-up inline. Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.

## Graph node

- **Tier:** model-invoked (worker)
- **Reads:** the diff — `git diff <fixed-point>...HEAD` when the change is committed, or `git add -N -- .` then `git diff $(git merge-base <fixed-point> HEAD)` when it is still in the working tree — and its commit list; the spec source (canonical tracker operation / PRD / spec file); the repo's standards sources plus the built-in Fowler smell baseline
- **Emits:** two side-by-side reports — `## Standards` and `## Spec` — plus a one-line per-axis summary; findings are never merged or reranked across axes
- **Edges:**
  - fan-out (default): one `ws-reviewer` per axis, in parallel — one Standards, one Spec (schema: findings per file/hunk, under 400 words, hard violations distinguished from judgement calls)
  - when no spec can be found → skip the Spec agent and say so in the report
  - then → findings return to the caller as state delta (never route back into a live ws-implement)
- **Handoff protocol:** pin the fixed point first; pick one per-run scratch directory and name it in each reviewer's prompt; pass each reviewer the diff command, commit list, and source paths — commands and paths, not pasted artifacts. Each reviewer writes its write-up to that scratch dir and returns `DONE|{path}` (DONE|two axis report paths).
- **Exit report:** nested, return the two axis report paths as state delta (DONE|{two report paths}) and emit no route — open each reviewer's `DONE|{path}` to present them; never route back into a live ws-implement; invoked directly, report both axes (clean, or the findings) and stop. (Format: `ws-graph-engineering`.)
