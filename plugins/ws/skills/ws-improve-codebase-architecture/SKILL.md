---
name: ws-improve-codebase-architecture
description: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.
disable-model-invocation: true
disableModelInvocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This command is _informed_ by the project's domain model and built on a shared design vocabulary:

- Run the `/ws-codebase-design` skill for the architecture vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion — don't drift into "component," "service," "API," or "boundary."
- The domain language in `CONTEXT.md` gives names to good seams; ADRs record decisions this command should not re-litigate — discover them by project shape (see `project-hub-conventions`), not only at the repo root.

## Process

### 1. Explore

**Scope before you scan — YAGNI.** Deepening a module pays off by making future changes to it easier, so put extra weight on the parts of the codebase that have recently changed. Decide *where* to look before you look:

- If the user named a direction — a module, a subsystem, a pain point — take it, and skip the inference below.
- Otherwise, walk back a good stretch of the commit history (`git log --oneline`) to find the codebase's hot spots — the files and areas that keep coming up — and let those paths pull your attention first. If the changes are scattered with no clear hot spot, widen the net.

Read the project's domain model and governing ADRs first — by project shape (see `project-hub-conventions`): resolve `CONTEXT-MAP.md` before `CONTEXT.md` for a multi-context repo, and scan the hub, repo-root, and any bounded-context `dev-docs/decisions/` you're touching. This is the same set `ws-domain-modeling` owns; missing it re-proposes already-rejected refactors.

Then delegate one read-only exploration pass: Claude Code uses the Agent tool
with `subagent_type=Explore`; omp uses one `scout` task agent (and `effort: med`
when the active schema exposes it). This is one bounded scan, not a fan-out.
Do not follow rigid heuristics — explore organically and note where you
experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to the OS temp directory so nothing lands in the repo. Resolve the temp dir from `$TMPDIR`, falling back to `/tmp` (or `%TEMP%` on Windows), and write to `<tmpdir>/architecture-review-<timestamp>.html` so each run gets a fresh file. Open it for the user — `xdg-open <path>` on Linux, `open <path>` on macOS, `start <path>` on Windows — and tell them the absolute path.

The report uses **Tailwind via CDN** for layout and styling, and **Mermaid via CDN** for diagrams where a graph/flow/sequence reliably communicates the structure. Mix Mermaid with hand-crafted CSS/SVG visuals — use Mermaid when relationships are graph-shaped (call graphs, dependencies, sequences), and hand-built divs/SVG when you want something more editorial (mass diagrams, cross-sections, collapse animations). Each candidate gets a **before/after visualisation**. Be visual.

For each candidate, render a card with:

- **Files** — which files/modules are involved
- **Problem** — why the current architecture is causing friction
- **Solution** — plain English description of what would change
- **Benefits** — explained in terms of locality and leverage, and how tests would improve
- **Before / After diagram** — side-by-side, custom-drawn, illustrating the shallowness and the deepening
- **Recommendation strength** — one of `Strong`, `Worth exploring`, `Speculative`, rendered as a badge

End the report with a **Top recommendation** section: which candidate you'd tackle first and why.

**Use CONTEXT.md vocabulary for the domain, and the `/ws-codebase-design` vocabulary for the architecture.** If `CONTEXT.md` defines "Order," talk about "the Order intake module" — not "the FooBarHandler," and not "the Order service."

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly in the card (e.g. a warning callout: _"contradicts ADR-0007 — but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance.

Do NOT propose interfaces yet. After the file is written, ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, run the `/ws-grilling` skill to walk the decision tree with them — constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize — run the `/ws-domain-modeling` skill to keep the domain model current as you go:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md`. Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing — skip ephemeral reasons ("not worth it right now") and self-evident ones.
- **User accepts a candidate that contradicts an existing ADR?** Supersede it through `/ws-domain-modeling`: record the new decision as an ADR and set `superseded by ADR-NNNN` in the old ADR's Status frontmatter ([ADR-FORMAT.md](../ws-domain-modeling/ADR-FORMAT.md), Optional sections).
- **Want to explore alternative interfaces for the deepened module?** Run the `/ws-codebase-design` skill and use its design-it-twice parallel sub-agent pattern.

## Graph node

- **Tier:** user-invoked (entry)
- **Reads:** git history hot spots (`git log --oneline`), `CONTEXT.md` (or `CONTEXT-MAP.md` plus per-context files), ADRs across the hub, repo root, and any touched bounded-context `dev-docs/decisions/` (by project shape, see `project-hub-conventions`), the codebase (walked by one bounded Explore pass)
- **Emits:** a self-contained HTML report of deepening candidates at `<tmpdir>/architecture-review-<timestamp>.html`; then, per picked candidate: `CONTEXT.md` updates and sparing ADRs from the grilling loop
- **Edges:**
  - then → ws-codebase-design (the vocabulary every suggestion is written in; its design-it-twice pattern for alternative interfaces inside the grilling loop)
  - then → ws-grilling (walks the picked candidate's decision tree in the grilling loop)
  - then → ws-domain-modeling (inline `CONTEXT.md`/ADR upkeep as decisions crystallise)
  - then → one bounded read-only exploration pass (Claude Code: Agent tool, `subagent_type=Explore`; omp: one `scout` task agent) returning friction notes — shallow modules, missing locality, untestable seams. Not a fan-out.
  - when the grilled candidate becomes a build the loop can't hold → hand off to ws-grill-with-docs on the main flow (user-mediated) — the pick itself stays inside the grilling loop
- **Edge rule:** entry → worker only, never entry → entry — a continuation that lands on another entry node is a user-mediated handoff (recommend it; never auto-invoke it).
- **Handoff protocol:** the report is written to the OS temp dir and referenced by absolute path — never pasted into conversation (DONE|{report path}).
- **Exit report:** candidate grilled to a decision and the work fits this session → stop with the report path plus the landed `CONTEXT.md`/ADR paths (DONE|{report path, decision paths}); the work outgrows this session → ws-grill-with-docs (user-mediated); the design is still open → ws-codebase-design; report presented but nothing picked yet → stop and wait for the pick. (Format: `ws-graph-engineering`.)
