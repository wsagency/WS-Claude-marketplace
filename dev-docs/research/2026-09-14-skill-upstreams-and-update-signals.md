# Vendored skill upstreams and their change-detection signals (`plugins/ws/skills/`)

Research ticket: `dev-docs/tickets/done/35-research-vendored-skill-upstreams.md`
(map `sustain-the-ws-matt-skill-set`). Investigated 2026-09-14 against
in-repo evidence and live upstream sources. Read-only research: this file is the
only artifact written; no repo files were edited.

## Summary

Of the 31 skill sets under `plugins/ws/skills/`, 18 are vendored from exactly two
upstreams and 13 are authored in-house. The vendored sets are (1) the 17 ws-matt
skills (16 engineering skills plus `ws-grilling`) from `mattpocock/skills`, pinned
to commit `ed37663cc5fbef691ddfecd080dff42f7e7e350d` (2026-07-21, vendored
2026-07-24, MIT), with the pin, rename map, and adaptation preserve-list recorded
in `plugins/ws/UPSTREAM.md`; and (2) `herdr`, vendored verbatim from
`ogulcancelik/herdr` (pin `a979916`, 2026-07-27), recorded in
`plugins/ws/skills/herdr/UPSTREAM.md` — that repo has since moved to the
`herdrdev` org (old URLs still resolve via GitHub redirect). Both upstreams
publish machine-checkable change signals (GitHub tags + releases + commit feed);
both have moved past our pins — e.g. `mattpocock/skills` is at v1.2.3 (2026-08-06)
and herdr at v0.9.0 (2026-09-07) — and neither pin corresponds to any published
tag (each pin is an untagged state between two releases). **No vendored set lacks
a detectable upstream signal.** The five in-house convention skills (adr,
conventional-commits, diataxis, keep-a-changelog, style-guide) track external
standards whose upstreams range from machine-checkable (MADR and Keep a Changelog
GitHub releases) to HTML-only changelog pages (Google and Microsoft style guides);
their `references/`/`examples/` are in-house-authored distillations, not copied
upstream text, so continued vendoring of those sets carries no upstream licence
burden today.

## Findings

### 1. Inventory and classification (31 skill sets)

Vendored — `mattpocock/skills` (17), per the rename map in `plugins/ws/UPSTREAM.md`
(upstream `skills/engineering/` whole category plus `skills/productivity/grilling`;
upstream companion files and `agents/openai.yaml` included):

| Vendored name | Upstream name |
|---|---|
| ws-ask-matt | ask-matt |
| ws-grill-with-docs | grill-with-docs |
| ws-triage | triage |
| ws-improve-codebase-architecture | improve-codebase-architecture |
| ws-to-spec | to-spec |
| ws-to-tickets | to-tickets |
| ws-implement | implement |
| ws-wayfinder | wayfinder |
| ws-prototype | prototype |
| ws-diagnosing-bugs | diagnosing-bugs |
| ws-research | research |
| ws-tdd | tdd |
| ws-domain-modeling | domain-modeling |
| ws-codebase-design | codebase-design |
| ws-code-review | code-review |
| ws-resolving-merge-conflicts | resolving-merge-conflicts |
| ws-grilling | grilling (`skills/productivity/grilling`) |

Source: `plugins/ws/UPSTREAM.md` lines 14–37 (rename map). Corroborated by
`plugins/ws/skills/ws-repo-maintenance/SKILL.md` §1 ("The 17 paths named in
`plugins/ws/UPSTREAM.md`'s rename map (16 engineering skills plus `ws-grilling`)
are vendored from `mattpocock/skills`") and by the 2026-08-01 maintenance-log
entry ("Rename map: 18 mapped skills (17 engineering plus `ws-grilling`)" — the
log counts the vendored directory set including `ws-project-bootstrap` fixtures
differently; the authoritative count is 17 skills from the 17-row rename map).
Git history is uninformative for provenance: every skill directory first appears
in the squash commit `7eaa95b` "feat!: merge the four plugins into one ws plugin —
cut v4.0.0" (2026-07-27), so the UPSTREAM.md files are the durable provenance
evidence.

Vendored — `ogulcancelik/herdr` (1):

| Vendored name | Upstream |
|---|---|
| herdr | `SKILL.md` at the root of github.com/ogulcancelik/herdr |

Source: `plugins/ws/skills/herdr/UPSTREAM.md` ("Source: https://github.com/ogulcancelik/herdr
(`SKILL.md` at repo root ...)"), corroborated by `ws-repo-maintenance/SKILL.md` §1
"herdr skill" subsection.

Authored in-house (13):

| Skill | In-repo evidence of in-house authorship |
|---|---|
| ws-graph-engineering | `plugins/ws/UPSTREAM.md` §"Local additions on top of upstream": "ws-graph-engineering, commands/, agents/, rules/, and docs/graph.md are WS-authored, not vendored" |
| ws-repo-maintenance | Own maintenance process; frontmatter describes this repo's own workflow; directory first appears in `94ce06c` (v4.3.0), not in any vendored set; no upstream markers in `grep -i 'vendored\|upstream\|copyright\|license'` over the directory |
| ws-project-bootstrap | `ws-repo-maintenance/SKILL.md` §1: "the internal ws-project-bootstrap and ws-docs-bootstrap skills own project setup"; carries ~45 WS-authored source/test files (`transaction.mjs`, `tracker-ownership.mjs`, etc.) |
| ws-docs-bootstrap | Same sentence as above; WS-authored generator/templates and tests |
| ws-jira-conventions | WS-authored conventions for external tools (jira-cli, tea); no upstream markers |
| project-hub-conventions | WS-authored hub convention; references the vendored herdr skill but is not itself vendored |
| dual-track-docs | WS-authored docs convention; no upstream markers |
| ws-artefacts-explained | WS-authored ws-artefacts platform contract; no upstream markers |
| adr | In-house knowledge skill about the external MADR standard (see §5) |
| conventional-commits | In-house knowledge skill about the external Conventional Commits spec (see §5) |
| diataxis | In-house knowledge skill about the external Diátaxis framework (see §5) |
| keep-a-changelog | In-house knowledge skill about the external Keep a Changelog standard (see §5) |
| style-guide | In-house knowledge skill distilling Google/Microsoft style guides + Vale (see §5) |

Grep sweep over all of `plugins/ws/skills/` for
`vendored|upstream|copied from|adapted from|copyright|license` produced hits only
in the two UPSTREAM.md files, `ws-repo-maintenance/SKILL.md`,
`project-hub-conventions/SKILL.md` (mentions of the vendored herdr skill), and the
in-house convention skills' external-standard references — no third vendored set
exists.

### 2. Vendored set: ws-matt (`mattpocock/skills`)

- **Upstream repository:** https://github.com/mattpocock/skills ("Source repo",
  `plugins/ws/UPSTREAM.md` line 5; live: default branch `main`, MIT, homepage
  aihero.dev/skills — verified via GitHub API 2026-09-14).
- **Vendored revision:** `ed37663cc5fbef691ddfecd080dff42f7e7e350d`, vendored date
  2026-07-24 (`plugins/ws/UPSTREAM.md` lines 10–11). The commit exists upstream,
  committed 2026-07-21T10:28:51Z (GitHub API) — consistent with the recorded
  vendored date.
- **How the correspondence is recorded:** the pin itself in `plugins/ws/UPSTREAM.md`;
  the pin-update policy ("Bump the vendored pin in UPSTREAM.md iff a contentful
  vendored byte or an inventory change was actually applied — the pin is the last
  contentful skill/LICENSE source, not the last reviewed HEAD", UPSTREAM.md; also
  `ws-repo-maintenance/SKILL.md` Gate 8); and dated maintenance-log entries with
  `pin_before` / `candidate_head` / `class` / `skills_touched` / `pin_after`
  fields (`dev-docs/maintenance-log.md`, 2026-08-01 "Matt skills refresh audit"
  entry, which recorded class `non-vendored-docs-only` and an unchanged pin).
- **Change-detection signals published upstream** (all verified live 2026-09-14):
  - Git commit feed on `main` — HEAD `3cca18b368ae95cdbdebbff572ccafa662551015`
    (2026-09-04). Machine-checkable: `git clone` / `git ls-remote`
    (https://github.com/mattpocock/skills).
  - Git tags: `v1.0.0`, `v1.0.1`, `v1.1.0`, `v1.2.0`, `v1.2.2`, `v1.2.3`, plus a
    release-please-style `mattpocock-skills@1.0.0` (GitHub API `/tags`).
  - GitHub releases mirroring the tags, latest **v1.2.3** published 2026-08-06
    (https://github.com/mattpocock/skills/releases; machine-checkable via REST API).
  - `pushed_at` timestamps via the API (last push 2026-09-04).
  - The in-repo sync procedure itself is machine-checkable: full clone +
    `git diff --name-status <pin> <candidate>` per `plugins/ws/UPSTREAM.md` §"Delta
    classification".
- **Pin ↔ release correspondence:** the pin (2026-07-21) postdates v1.1.0
  (2026-07-08) and predates v1.2.0 (2026-08-05) — **our pin corresponds to no
  published tag**; it is an untagged `main` HEAD state between v1.1.0 and v1.2.0.
  Consistent with the maintenance log's 2026-08-01 note "no release tag newer than
  `v1.1.0` exists" at audit time. Drift since pinning: upstream has advanced
  ~6 weeks and two minor release lines (v1.2.x).
- **Licence/attribution constraints:** MIT, © 2026 Matt Pocock. Constraint per
  MIT: retain the copyright + permission notice in copies. Our copy does this by
  keeping `plugins/ws/LICENSE` byte-identical to upstream (`plugins/ws/UPSTREAM.md`
  line 12: "MIT (c) 2026 Matt Pocock — LICENSE is byte-identical to upstream";
  file verified: "MIT License / Copyright (c) 2026 Matt Pocock"). Upstream API
  license detection: `mit`. MIT imposes no further obligation; the WS adaptation
  (renames, Graph node sections) is permitted by the licence and documented
  in-repo. Note the sync contract additionally mandates keeping `LICENSE`
  byte-identical as a validation gate (UPSTREAM.md §"Validation"), which is
  stricter than MIT requires.

### 3. Vendored set: herdr

- **Upstream repository:** https://github.com/ogulcancelik/herdr as recorded in
  `plugins/ws/skills/herdr/UPSTREAM.md` line 3. **Verified live:** that URL now
  redirects — the repo moved to the `herdrdev` org and is now
  https://github.com/herdrdev/herdr (GitHub API `full_name: "herdrdev/herdr"`;
  default branch `master`, Rust, homepage herdr.dev). The old owner path still
  resolves, so the recorded pin URL continues to work, but the canonical identity
  in-repo is stale.
- **Vendored revision:** pin `a979916` ("master, 2026-07-27") — verified upstream:
  commit `a979916` dated 2026-07-27T13:17:14Z on `master` (GitHub API). Vendoring
  policy: verbatim, no WS-local adaptations (`herdr/UPSTREAM.md` "Policy: vendored
  VERBATIM"); the 2026-08-01 maintenance-log audit confirmed the local file is
  content-identical to the pin.
- **How the correspondence is recorded:** the pin line in
  `plugins/ws/skills/herdr/UPSTREAM.md` plus the refresh procedure pointing at
  `https://raw.githubusercontent.com/ogulcancelik/herdr/master/SKILL.md`
  (wholesale replace + pin update); `ws-repo-maintenance/SKILL.md` §1 herdr
  subsection; maintenance-log entries (2026-08-01: "Herdr vendored skill —
  Current — pinned a979916 matches upstream master" as of that date).
- **Change-detection signals published upstream** (all verified live 2026-09-14):
  - Git commit feed on `master` — HEAD `c77af1892ff121736ecb103b32d504d6f1b31805`
    (2026-09-14). Machine-checkable (git/GitHub API).
  - Git tags: `v0.1.0` … `v0.9.0` (latest tag v0.9.0).
  - GitHub releases: versioned releases (latest **v0.9.0**, published
    2026-09-07T19:21:31Z) plus continuous `preview-*` releases
    (https://github.com/herdrdev/herdr/releases; machine-checkable via REST API).
  - The `ws-repo-maintenance` external-tools table adds a runtime signal: compare
    `herdr --version` against herdr.dev.
- **Pin ↔ release correspondence:** pin `a979916` (2026-07-27) postdates v0.7.5
  (2026-07-21) and predates v0.8.0 (2026-08-03) — **the pin corresponds to no
  published tag**; it is an untagged `master` state between v0.7.5 and v0.8.0.
  Drift since pinning: ~7 weeks of master commits and releases up to v0.9.0.
- **Licence/attribution constraints:** Apache-2.0 (GitHub API license detection on
  `herdrdev/herdr`). Apache-2.0 §4 requires: include a copy of the licence, keep
  notices, and state significant changes made to the work. Our copy ships the
  upstream file verbatim (no changes to state) and records provenance and the
  author's distribution statement in `herdr/UPSTREAM.md` ("License-bearing repo;
  skill distributed by the author for exactly this use — 'for agents without a
  skill system, paste the file into instructions'"). The upstream LICENSE/NOTICE
  text itself is **not** shipped anywhere in `plugins/ws/`, which carries only
  the MIT `LICENSE` of the ws-matt upstream. The §4(a) licence-copy obligation
  is therefore **unmet today** — an unresolved compliance gap, not a judgement
  call — tracked for remedy in
  `dev-docs/tickets/open/40-ship-herdr-license-and-fix-upstream-refs.md`. The
  Apache-2.0 grant makes the vendoring itself lawful; the missing notice is a
  defect in how we redistribute, and the author's distribution statement does
  not waive it.

### 4. Vendored sets with NO detectable upstream signal

**None.** Both vendored upstreams publish machine-checkable signals (tags,
releases, commit feed). The nearest thing to a signal gap is presentational, not
detectional: neither in-repo pin corresponds to a published tag (both are untagged
states between releases), so "current relative to latest release" cannot be read
directly from the pins without a pin..HEAD diff — which is exactly what the
documented sync procedure does.

### 5. In-house skills that track an external convention (upstream may move)

These five sets are authored here but summarize external standards; their
SKILL.md files link the sources, and their `references/` + `examples/` files are
in-house-authored distillations/templates (spot-read
`diataxis/references/reference-docs.md` and `style-guide/references/writing-rules.md`:
generic WS-style templates and rules tables, no verbatim upstream text; no
attribution line required or present beyond linking). Licence exposure from
continued vendoring is therefore nil today; it would only arise if upstream text
were ever copied in.

| Skill | External upstream | What the skill pins | Upstream's change signal (verified 2026-09-14) | Machine-checkable? |
|---|---|---|---|---|
| adr | MADR — https://adr.github.io/madr/, repo github.com/adr/madr | "MADR v4.0.0 format" (SKILL.md frontmatter + body) | GitHub releases/tags: `4.0.0` published 2024-09-17 (latest); API: https://api.github.com/repos/adr/madr/releases | Yes — releases/tags |
| conventional-commits | Conventional Commits spec v1.0.0 — https://www.conventionalcommits.org; source repo conventional-commits/conventionalcommits.org (moved from the `conventional-changelog` org; old URLs redirect; repo licence MIT) | "specification (v1.0.0)" (SKILL.md) | **No tags, no releases** — commit feed only; the spec text itself has been frozen at 1.0.0 for years | Weakly — commit feed via API only; no version numbers to diff |
| keep-a-changelog | Keep a Changelog — https://keepachangelog.com; repo github.com/olivierlacan/Keep-a-Changelog | Format sections/semantics (SKILL.md; no explicit version string — the current standard is v1.1.1) | GitHub releases: `v1.0.0` (2017), `v1.1.0` (2019), `v1.1.1` (2023-03-06, latest) | Yes — releases/tags; slow-moving |
| diataxis | Diátaxis — https://diataxis.fr; source repo github.com/evildmp/diataxis-documentation-framework (homepage diataxis.fr; licence reported as NOASSERTION by GitHub API) | Framework concepts only, no version | **No tags, no releases** — commit feed only (repo actively pushed, last 2026-09-04) | Weakly — commit feed via API only |
| style-guide | (a) Google developer documentation style guide — https://developers.google.com/style (licence: Creative Commons Attribution 4.0, confirmed on the live site); (b) Microsoft Writing Style Guide — https://learn.microsoft.com/en-us/style-guide/welcome/; (c) Vale packages (Google/Microsoft/write-good) by errata-ai | Rule distillations; Vale config example; no version strings | (a) dated "What's new" page, latest entry 2026-07-07 — https://developers.google.com/style/whats-new; (b) dated "What's new?" page — https://learn.microsoft.com/en-us/style-guide/welcome/whats-new; (c) GitHub releases on the errata-ai package repos | (a)/(b) No — HTML-only dated changelogs, no git/registry feed (scraping only); (c) yes, but the repo does not vendor Vale styles, only references them |

The non-goals exclude recommendations; the table is inventory only.

## Open questions

1. **Which release first contains each pin.** Both pins sit between two releases
   (ws-matt: v1.1.0…v1.2.0; herdr: v0.7.5…v0.8.0). Establishing the exact release
   that first contains each pin requires a merge-base check in a clone; not
   performed (web/API investigation only). Not load-bearing for change detection,
   since the documented sync diffs pin..HEAD, not pin..tag.
2. **npm distribution of mattpocock/skills.** The tag `mattpocock-skills@1.0.0`
   suggests release-please with an npm target; whether an npm package is published
   (a third potential signal) was not verified and is not needed — tags + releases
   already suffice.
3. **Diátaxis repo licence terms.** GitHub reports `NOASSERTION` for
   `evildmp/diataxis-documentation-framework`; the actual licence file was not
   classified. Irrelevant while the skill only links the framework, relevant if
   anyone ever copies diataxis.fr text into `references/`.
4. **herdr upstream LICENSE/NOTICE propagation — unresolved gap.** Apache-2.0
   §4(a) requires a copy of the licence to accompany redistributed work. The
   vendored `herdr/SKILL.md` is a verbatim redistribution of an Apache-2.0
   licensed file, and `plugins/ws/` ships only the MIT `LICENSE` of the ws-matt
   upstream — no Apache licence text anywhere. That obligation is therefore
   **not** met today; the verbatim copy and the provenance note in
   `herdr/UPSTREAM.md` satisfy the change-stating expectation of §4(b) but do
   not substitute for the licence copy. Remedy is tracked in
   `dev-docs/tickets/open/40-ship-herdr-license-and-fix-upstream-refs.md`. The
   Apache-2.0 grant makes the vendoring itself lawful; the missing notice is a
   compliance defect to fix, not a licensing bar.
5. **Upstream repo identity for herdr.** The move `ogulcancelik/herdr` →
   `herdrdev/herdr` makes every in-repo reference (UPSTREAM.md source URL, raw
   fetch URL, `npx skills add ogulcancelik/herdr` install command in
   `ws-repo-maintenance` and `project-hub-conventions`) stale-but-redirected.
   Recorded here as fact; updating them is out of scope (read-only research).

## Sources

In-repo:

- `plugins/ws/UPSTREAM.md` — ws-matt vendoring contract: source repo, pin
  `ed37663…`, vendored date, rename map, preserve list, delta classes, pin policy
- `plugins/ws/skills/herdr/UPSTREAM.md` — herdr pin `a979916`, verbatim policy,
  refresh URL, distribution statement
- `plugins/ws/skills/ws-repo-maintenance/SKILL.md` — vendoring guidance (phases,
  gate sequence, pin policy, external-tools audit table)
- `plugins/ws/LICENSE` — MIT, © 2026 Matt Pocock (byte-identical per UPSTREAM.md)
- `dev-docs/maintenance-log.md` — 2026-08-01 entries: ws-matt audit
  (`non-vendored-docs-only`, pin unchanged) and herdr audit (pin matched master)
- Skill directories `plugins/ws/skills/{adr,conventional-commits,diataxis,keep-a-changelog,style-guide}/` —
  SKILL.md + references/ + examples/ (in-house distillations)
- `git log --reverse` per skill directory (single squash origin `7eaa95b`, 2026-07-27)

Upstream / web (all fetched 2026-09-14):

- https://github.com/mattpocock/skills (+ API: repo metadata, tags, releases, commits `ed37663`, HEAD `3cca18b`)
- https://github.com/ogulcancelik/herdr → https://github.com/herdrdev/herdr (+ API: repo metadata, tags, releases, commit `a979916`, HEAD `c77af18`)
- https://api.github.com/repos/adr/madr/releases (4.0.0, 2024-09-17)
- https://api.github.com/repos/olivierlacan/Keep-a-Changelog/releases (v1.1.1, 2023-03-06)
- https://www.conventionalcommits.org; repo conventional-commits/conventionalcommits.org (no tags/releases; MIT)
- https://github.com/evildmp/diataxis-documentation-framework (no tags/releases; homepage diataxis.fr)
- https://developers.google.com/style/whats-new (latest entry 2026-07-07); CC BY 4.0 confirmed on https://developers.google.com/style
- https://learn.microsoft.com/en-us/style-guide/welcome/whats-new
