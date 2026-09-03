---
name: ws-repo-maintenance
description: "AI-driven maintenance process for the ws-claude-marketplace repo itself. Use when asked to update/refresh this repo, sync vendored upstreams (Matt Pocock skills, herdr), audit external tool versions and their docs (jira-cli, tea, omp, herdr, openwiki, bun), or adopt new omp capabilities. Maintainer-facing; runs from a checkout of the marketplace repo."
---

# WS Repo Maintenance

The written process for keeping this repo current. Run it from a checkout of
the marketplace repo, on request ("update the repo") or before a planned
release wave. Every run ends with a dated entry in
`dev-docs/maintenance-log.md` (create it on first run) recording: date,
versions checked, drift found, actions taken.

Follow the phases in order; each is skippable when its scope is untouched,
but say so in the log entry.

**Artifact language.** Everything this process writes — the `dev-docs/maintenance-log.md` entry, any ADR it files, and every doc fix it lands — is English, whatever language the conversation is in.

## 1. Vendored upstreams

### ws-matt skills (orchestrated)

The 17 paths named in `plugins/ws/UPSTREAM.md`'s rename map (16 engineering
skills plus `ws-grilling`) are vendored from `mattpocock/skills`. `UPSTREAM.md` is the durable
contract — it holds the pinned commit/date, the rename map, the cross-reference
rewrite rules, the manual-only-key mechanism, the full WS-local preserve
checklist, the delta-class definitions, and the maintenance-log fields. Run the
sync as a gate sequence; each gate either passes, routes to a decision, or
stops. Never skip a gate silently — record skips in the log entry.

**Gate 0 — Dirty tree.** `git status --porcelain` on the marketplace checkout.
A clean tree is the default. If uncommitted work overlaps the paths a sync would
touch, stop and surface an explicit choice: commit it as its own already-green
change, stash it, move the sync to a dedicated worktree, or abort. Never merge
upstream into a dirty tree and never destroy uncommitted work. The upstream
clone lives under a throwaway `/tmp` dir, never inside the repo.

**Gate 1 — Clone + delta.** Make a temporary *full* clone of
`mattpocock/skills` (not `--depth 1` — the pinned commit must be fetchable so
`pin..candidate` diffs resolve). Record
`candidate = git -C <tmp> rev-parse HEAD`; inspect the full-tree delta to
distinguish no change from non-vendored churn, then diff the vendored surface:
`skills/engineering/`, `skills/productivity/grilling/`, and `LICENSE`.

**Gate 2 — Classify and early-exit.** Read the delta against the four classes
defined in `UPSTREAM.md` — `no-delta`, `non-vendored-docs-only`, `contentful`,
`inventory`:
- `no-delta` or `non-vendored-docs-only` (e.g. only the non-vendored upstream
  root README moved) → **copy no skills, bump no pin, rebuild no omp.** Log
  `candidate` and the class; the ws-matt phase ends here.
- `contentful` or `inventory` → continue.

**Gate 3 — Parallel audits, then synthesize.** Fan out four audits in
parallel and reconcile before porting anything — no porting until they agree:
upstream inventory/content; WS adaptations (does the change hit a preserve-list
item?); graph routing (do nodes/tiers/edges move?); omp distribution (will the
`plugins/ws/` surface change?). Use `researcher` for upstream fact gathering
(its findings file lands under `dev-docs/research/` — an expected artifact of
this gate, not drift) and `ws-reviewer` for the read-only WS, graph, and
distribution audits; reserve `tdd-runner` for implementation seams if a
contentful sync requires code changes. When the active task schema exposes
`effort`, use `hi` for the review-grade audits and `med` for fact gathering.

**Gate 4 — Conscious porting (WS precedence).** Port through the rename map with
WS-local precedence — upstream never overwrites a WS adaptation. The full
per-file re-apply checklist and conflict handling live in `UPSTREAM.md`. No
blind recursive copies; never delete a WS-only file; exactly one `## Graph node`
per vendored skill.

**Gate 5 — Graph & reference gates.** If inventory, edges, or skill behaviour
changed: every skill named in `UPSTREAM.md`'s rename map keeps exactly one
`## Graph node`; entry tier still matches the 8 user-invoked engineering skills; the worker
tier and `ws-graph-engineering` match `plugins/ws/docs/graph.md`; a
boundary-aware grep finds no bare upstream skill refs outside `UPSTREAM.md`'s
rename map; run
`python3 plugins/ws/scripts/outline-sync.py lint --root plugins/ws/docs`.

**Gate 6 — omp rebuild gate.** If any `plugins/ws/` surface changed, rebuild the
generated distribution: `cd extensions/omp-ws && bun run build` (verify the
printed counts) and rerun tests. No `plugins/ws/` change → skip and say so.

**Gate 7 — Verification.** Run the re-verify checklist in `UPSTREAM.md`: one
graph section per skill; rename map ↔ directories agree; manual-only keys on
exactly 8 skills; `LICENSE` byte-identical; bare-ref grep; graph lint. Any
unexpected drift outside the known adaptations stops the run for a decision.

**Gate 8 — Outcome logging + pin.** Record the ws-matt outcome in the run's
`dev-docs/maintenance-log.md` entry (fields in `UPSTREAM.md`). **Bump the
vendored pin in `UPSTREAM.md` iff a contentful vendored byte or an inventory
change was actually applied** — the pin is the last contentful skill/`LICENSE`
source, not the last reviewed HEAD. Non-vendored-docs-only runs keep the pin and
log `candidate`.

### herdr skill

`plugins/ws/skills/herdr/` is vendored from `ogulcancelik/herdr` (`SKILL.md` at
repo root; pin recorded in `plugins/ws/skills/herdr/UPSTREAM.md`). Fetch
`https://raw.githubusercontent.com/ogulcancelik/herdr/master/SKILL.md`, diff,
take upstream verbatim (no WS-local adaptations by policy), update the pin.

## 2. External tools — versions and doc drift

Fan this audit out by default rather than looping the seven tools serially.
Each check is read-only and touches a disjoint set of docs, so run one worker
per tool in a single batched `task` call — `{ context, tasks: [...] }`, one
item per tool and, when the active task schema exposes it, `effort: lo`
(mechanical version-and-doc checks) — then one synthesis pass merges the
version table and the doc-drift fixes. Claude Code:
one Task call per tool in a single message. Each worker checks installed vs
latest, skims release notes since the last log entry, and verifies OUR
documented invocations still hold. Fix docs where drift is found; flag behavior
changes that affect commands/skills. This is inner same-session fan-out, not
Herdr panes.

| Tool | Latest check | Our claims to re-verify |
|---|---|---|
| jira-cli | `jira version` vs GitHub releases (ankitpokhrel/jira-cli) | `issue view --raw`, `issue list -q --plain --paginate`, `worklog add --no-input`, `issue move`, `comment add --no-input` (ws-setup, ws-commit, ws-status) |
| tea | `tea --version` vs gitea/tea releases | `tea pr create --title --description --base` (ws-commit pr) |
| omp | `omp --version` vs omp.sh releases | plugin dir conventions, ExtensionAPI events, `/marketplace`/`plugin upgrade` verbs (docs/how-to/omp-setup.md, use-with-omp.md, extensions/omp-ws) |
| herdr | `herdr --version` vs herdr.dev | skill + workspace commands (hub init 5b, herdr skill) |
| openwiki | `openwiki --version` vs upstream | `--init`, prompted `--update` semantics, INSTRUCTIONS.md scope, `.last-update.json` marker (hub flows, freshness hooks) |
| bun | `bun --version` | build scripts in extensions/omp-ws |
| skills CLI | `npx skills --version` | `npx skills add <repo> --skill <name> [-g]` (herdr install path) |

## 3. omp capability adoption

In `extensions/omp-ws/`: bump the `@oh-my-pi/pi-coding-agent` devDependency
to the installed omp version, then `bun run typecheck && bun test` and the
headless smoke from its README. Read the omp CHANGELOG delta for
extensibility changes; record adoption candidates (new events, APIs) in
`dev-docs/omp-native-improvements.md` — adopt only with evidence of value.

## 4. Rebuild and release

Any change to `plugins/ws/` surface or the extension → `cd extensions/omp-ws
&& bun run build` (regenerates commands, skills, agents, rules, templates, and
runtime helpers; verify the printed counts) and rerun tests. Then the standard release flow
(`dev-docs/development.md`): changelog, lockstep version, mirror, tag, push.
Team announcement lines: `claude plugin marketplace update ws-marketplace` +
plugin update; omp users rebuild + relink the native package.

## 5. Record

Append the dated entry to `dev-docs/maintenance-log.md`. If a decision was
made (adopt/skip a capability, pin policy change), it gets an ADR per the
two-tier rule.
