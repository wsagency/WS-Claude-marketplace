---
name: project-hub-conventions
description: Conventions for WS Agency multi-repo project hubs (subfolder layout, project.yaml schema with repo types, hub dev-docs knowledge root, input/output repos, context-file cascade, .gitignore managed block, invoke-ai.sh contract). Use when creating, extending, or troubleshooting a `<project>-main` hub repo, or when asked about "project hub", "multi-repo", or `<name>-main` repos.
---

# Project Hub Conventions

The WS Agency `ws` plugin grows with a project: it runs on a single repo or a few loose repos from day one and adopts a `<project>-main` hub later, when the work demands one (see [Project shape detection](#project-shape-detection) below). In the hub shape, each sub-repo (mobile app, marketing site, design assets, client deliveries, docs, etc.) lives in a **subfolder of the hub** with its own independent git history.

## Project shape detection

A WS project is in exactly one of three shapes, detected by walking up from
the working directory looking for `project.yaml`, stopping at the filesystem
root:

- **`project.yaml` found in the working directory → hub root.** This
  directory is a `<project>-main` hub; its subfolders are the sub-repos.
- **`project.yaml` found in an ancestor directory → hub sub-repo.** That
  ancestor is the hub; this directory is one of its registered sub-repos.
- **`project.yaml` not found → standalone repo.** No hub — a valid,
  first-class, permanent-until-chosen state.

This procedure is defined ONCE here; every other hub-aware surface references
it by name ("project shape detection, see `project-hub-conventions`") rather
than restating the walk (ADR 0007). **Having no hub is never an error:** no
command, skill, agent, hook, rule, or template may abort, warn, or nag merely
because `project.yaml` is absent, and every hub-aware surface states its
standalone behaviour explicitly next to its hub behaviour.

### Standalone routing (no hub)

While there is no hub, whatever would live in the hub's `dev-docs/` —
cross-repo architecture, product ADRs, runbooks, scoping docs — lives in the
standalone repo's OWN `dev-docs/`, using the identical directory names and
layout described below. Adopting a hub later is therefore a **move, not a
rewrite**: `/ws-hub init` detects sibling git repos in the working directory,
proposes registering each with an inferred `type` (confirming each), then
offers to lift each adopted repo's product-level `dev-docs/` — signature
`architecture.md`, `contracts.md`, `deployment.md`, `decisions/`, `runbooks/`,
`scoping/` — into the new hub knowledge root. Adoption is always opt-in and
never silent (ADR 0007), and three rules govern it:

- **Lift before scaffold.** The hub may create its directory and meta files
  first, but the canonical scaffold paths (`architecture.md`,
  `decisions/index.md`, `runbooks/index.md`, `scoping/index.md`) are filled
  only AFTER any opted-in lift — so authored content lands at its canonical
  path and the scaffold merely fills what the lift left missing, never the
  reverse. Cleanliness is required only in the SOURCE repo: the
  not-yet-initialized hub is not a git worktree.
- **Per-file, collision-safe, never overwrite.** Renumber ADRs, disambiguate
  other files, confirm the plan before executing. A destination that is an
  exact, unmodified generated scaffold stub may be replaced by a confirmed
  lift; authored files never are.
- **`leave` recovers later.** A deliberate `leave` completes that adoption
  decision (nothing left half-done) yet still recovers: `/ws-hub update` runs
  version-independent remediation — at whatever version the hub is, including
  the latest, with no version bump — lifting any left-behind product
  `dev-docs/` from registered `type: working` repos by reusing this adoption
  contract.

The rest of this file describes the **hub-root** shape in full; the sub-repo
and standalone shapes reuse the same conventions, scoped to a single repo's
own `dev-docs/` and `docs/`.

## Layout

```
<project>-main/
├── .git/                     # hub's git — tracks meta files + hub dev-docs
├── .gitignore                # managed block excludes sub-repo subfolders
├── .claude/skills/           # vendored conventions (this file)
├── project.yaml              # registry of all sub-repos (+ conventions version)
├── AGENTS.md                 # project map (canonical, agent-neutral)
├── CLAUDE.md                 # thin @AGENTS.md import
├── invoke-ai.sh              # agent picker launcher (claude / omp)
├── README.md
├── dev-docs/                 # PRODUCT knowledge root (tracked by hub git)
│   ├── architecture.md       # cross-repo synthesis, written by hub-architect
│   ├── decisions/            # product ADRs
│   ├── runbooks/             # product-level operational runbooks
│   └── scoping/              # processed client deliveries (see Input repos)
├── openwiki/                 # optional derived wiki (see below)
├── <project>-app/.git/       # type: working — own git, gitignored
├── <project>-design/.git/    # type: input — own git, gitignored
├── <project>-client/.git/    # type: input — own git, gitignored
└── <project>-docs/.git/      # type: output — own git, gitignored
```

Sibling layout (`path: ../<name>`) is still supported for back-compat, but new repos default to nested subfolders.

## `project.yaml` schema

```yaml
project:
  name: <kebab-case-project-name>
  description: <one-line description>
  session: <tmux-session-name>  # optional, default <name>-hub
  conventions: <N>              # ws-hub conventions version — machine-managed;
                                # the /ws-hub update migration table is the
                                # sole authority for the current value

repos:
  - name: <repo-name>           # required, matches directory name
    path: ./<repo-name>         # required, relative to hub; nested by default
    url: <git-remote-url>       # optional but recommended (enables /ws-hub repos clone)
    description: <purpose>      # required (may be "TODO" temporarily)
    tech: <stack-keywords>      # optional, e.g. "react-native, typescript"
    type: working               # required (v2+); working | input | output (see below)
    purpose: docs               # only for type: output — docs | explained | <custom>;
                                # max ONE output per known purpose per hub
```

**Changing a convention here is a versioned event:** every convention change MUST add a row (and a `Migration N→M steps:` block) to the `/ws-hub update` table and bump `conventions` (ADR 0006) — that migration table is the sole authority for the current version.

**Repo types** (ADR 0006) — every repo is exactly one of:

| type | `/ws-docs` sweep | OpenWiki coverage | hub-architect analysis | what it is |
|---|---|---|---|---|
| `working` (default for legacy hubs) | yes | yes | yes | the product's software — where development happens |
| `input` | no | no | no | material that FEEDS development from outside: client deliveries, design assets, data dumps |
| `output` | no | no | no | artifacts DERIVED from the product: user docs (purpose `docs`), generated explainers (purpose `explained`) |

Knowledge flow is one-directional: `input` → processed into hub `dev-docs/` →
built in `working` repos → derived into `output` repos. Nothing consumes an
output as a source; inputs are processed, never indexed (OpenWiki maps
as-built state — raw deliveries would mix "requested" with "built").

Legacy mapping (pre-v2 hubs): `role: docs` ≡ `type: output, purpose: docs`;
`role: explained` ≡ `type: output, purpose: explained`; no role ≡ `type:
working`. `/ws-hub update` rewrites these.

Path rules:
- Nested (recommended): `./<name>` — auto-added to `.gitignore` managed block
- Sibling (legacy): `../<name>` — not in `.gitignore` (it's outside the hub). Note: omp cannot reach `../` repos (it has no `--add-dir`), so sibling-pathed repos are unreachable when launching with omp — invoke-ai.sh marks them `⊘ unreachable in omp` in its summary.
- `name` matches the directory basename so `/ws-hub add --scan` can detect new repos

## Tech inference

The `tech` field is inferred best-effort from manifest files at the repo root:

| Manifest | tech |
|---|---|
| `package.json` | node |
| `pubspec.yaml` | flutter |
| `requirements.txt` | python |
| `pyproject.toml` | python |
| `Cargo.toml` | rust |
| `go.mod` | go |

If multiple manifests are present, list all matches; if none match, leave `tech` empty (or ask the user).

## Hub `dev-docs/` — the product knowledge root

The hub carries its own `dev-docs/` — the ONLY place product-level internal
documentation lives — beside `openwiki/` (the derived map). Authored truth is
here; derived structure is there; both are fed by `working` repos.

```
dev-docs/
├── architecture.md      # cross-repo synthesis — hub-architect writes here
│                        # (THIN when openwiki/ exists: boundaries + contracts + pointer)
├── contracts.md         # optional — shared cross-repo contracts, when they exist
├── deployment.md        # optional — deploy topology, when deployment files exist
├── decisions/           # PRODUCT ADRs (two-tier; concern >1 repo or the client)
├── runbooks/            # product-level operational runbooks
└── scoping/             # processed client deliveries — one dated doc per
                         # delivery, written by /ws-hub intake (see Input repos)
```

Split rule: **an end user reads it → the `purpose: docs` output repo. It
concerns more than one repo, or the client, and is internal → hub
`dev-docs/`.** Working sub-repos keep only repo-specific `dev-docs/`.
CHANGELOG.md stays per-repo.

## Input repos (`type: input`)

Material arriving from outside that must be PROCESSED into project knowledge:
client deliveries, design assets, data dumps. Named by source:
`<project>-client`, `<project>-design`, … (unlimited). Scaffold: README,
AGENTS.md carrying the **dated-folder convention** (see `### Dated folders` below), `history.md`.

Input repos are **immutable raw** — nothing writes into them except new
dated delivery folders and `history.md`. All distillation lands in the hub's
`dev-docs/`.

### Dated folders

Deliveries arrive successively and newer deliveries supersede older ones:

- One folder per delivery, named by date: `2026-07-12/`, `2026-07-20/`, …
- **The latest date is the most accurate truth**; older folders are preserved
  history and are never deleted or edited.
- Change requests from the client land in the dated folder they arrived with;
  a top-level `history.md` logs the request trail (date → what changed → which
  ADR/spec/ticket it triggered).
- When processing a new delivery: diff it against the previous dated folder,
  record what changed in `history.md`, and raise ADRs/spec updates for anything
  that alters agreed scope.

### Processing pipeline (`/ws-hub intake`)

A delivery is **unprocessed** while no scoping doc references it. The intake
verb detects unprocessed dated folders and drives:

1. **Intake** — diff vs previous delivery; append the `history.md` entry.
2. **Scoping doc** — `dev-docs/scoping/YYYY-MM-DD-<slug>.md` in the HUB:
   delivery reference, plain-language summary, extracted requirements, scope
   of work (in / explicitly out), open questions for the client, decisions
   raised, tickets raised. Dated like the delivery — never edited retroactively;
   a new delivery produces a new scoping doc.
3. **Decisions** — product ADRs into hub `dev-docs/decisions/` (`/ws-docs adr`).
4. **Spec & tickets** — `ws-to-spec` / `ws-to-tickets` into the tracker of the
   WORKING repo where the change lands (local `dev-docs/tickets/` or Jira);
   the scoping doc references the keys.
5. **Development** — `/ws-matt` flow in the working repo(s). Unchanged.
6. **Loop close** — `history.md` records which ADRs/specs/tickets the
   delivery triggered.

## Output repos (`type: output`)

Derived artifacts, regenerated rather than hand-maintained where a generator
exists. `purpose` selects the consuming tool; the vocabulary is open (unknown
purposes are legal — tooling ignores them, doctor reports them), but each
KNOWN purpose is unique per hub: commands that write `project.yaml` must
refuse a second `purpose: docs` or `purpose: explained` entry.

### Product docs repo (`purpose: docs`)

The product's USER-facing documentation source of truth — an ordinary
sub-repo (own git, mounted by invoke-ai.sh) with this layout:

```
<project>-docs/
├── README.md
├── AGENTS.md                # writing rules (scope, Outline-safe profile)
├── CLAUDE.md                # thin @AGENTS.md import
├── docs/                    # USER track (Diátaxis) → syncs to Outline
│   ├── index.md
│   ├── explained.md         # GENERATED by /ws-docs explain
│   ├── tutorials/  how-to/  reference/  explanation/
│   ├── assets/              # images (uploaded as Outline attachments)
│   └── release-notes/
└── .outline-sync.json       # sync state (committed)
```

Audience: **end users only.** It carries NO product-level `dev-docs/` —
those live in the hub (see above). Like any repo it MAY keep its own
repo-level `dev-docs/` for maintaining the docs repo itself (dual-track),
but nothing is scaffolded there.

### Explained repo (`purpose: explained`)

Generated human-facing visual documentation (ws-artefacts HTML) — see the
`ws-artefacts-explained` skill. Synthesized FROM the hub's `project.yaml`,
`openwiki/`, hub `dev-docs/`, and working-repo `dev-docs/` + READMEs.

## `.gitignore` managed block

The plugin maintains a single block in the hub's `.gitignore`:

```gitignore
# === ws-project-hub: sub-repos (auto-managed, do not edit) ===
/<project>-app/
/<project>-design/
/<project>-client/
/<project>-docs/
# === /ws-project-hub ===
```

Rules:
- Anything outside the two literal markers — `# === ws-project-hub: sub-repos (auto-managed, do not edit) ===` (opening) and `# === /ws-project-hub ===` (closing) — is hand-written and preserved
- `/ws-hub add` (with or without `--scan`) rewrites only what's between the markers
- Sibling-pathed repos (`../X`) are NOT added — they're not in the hub
- If the block is missing, commands create it at the top of `.gitignore`

## Harness policy

Hub tooling is **harness-agnostic**. Commands and generated files never assume a specific agent harness; today's supported harnesses are Claude Code and omp, and the structure is built for more:

- `invoke-ai.sh` keeps an extensible agent registry — add a name to `REGISTERED_AGENTS` plus an `agent_cmd_<name>()` function.
- Prose that genuinely differs per harness is written as a **"Harness notes"** list with one bullet per harness — a new harness is one more bullet, never a fork of the flow.
- Everything else (project.yaml, AGENTS.md, doctor checks, docs flows) is neutral by construction.

## Context-file cascade

`AGENTS.md` is the canonical, agent-neutral context file at every level — hub and sub-repos alike. Each `CLAUDE.md` is a thin import containing only `@AGENTS.md` plus one comment line, kept because Claude Code always reads `CLAUDE.md` and the `@import` guarantees the same content loads everywhere. Why AGENTS.md is canonical: omp finds `AGENTS.md` by walking up from the cwd but **never reads a root-level `CLAUDE.md`** — content left in a fat CLAUDE.md is invisible to omp. Keep all content in `AGENTS.md`; never fatten the thin `CLAUDE.md`. One permitted exception: **tool-managed marker blocks** (e.g. OpenWiki's `<!-- OPENWIKI:START/END -->`) that a tool rewrites idempotently on its own runs — leave those alone in both files.

## Knowledge wiki (OpenWiki) — hub level

A hub MAY carry an [OpenWiki](https://github.com/langchain-ai/openwiki) at `<hub>/openwiki/` — the knowledge repository for the whole product. Detection is filesystem presence (no config flag). Conventions:

- Initialized once at the hub root (`openwiki --init`; `/ws-hub init` step 5a offers it, and the same flow retrofits an existing hub). Init also writes the **coverage scope into `openwiki/INSTRUCTIONS.md`** (all registered `type: working` sub-repos, each a separate nested git repo — without this OpenWiki tends to document only the largest repo) and **deletes the generated CI workflow**.
- Every sub-repo's `AGENTS.md` carries a "Hub knowledge wiki" pointer section at `../openwiki/quickstart.md` — consult the wiki BEFORE exploring code or answering cross-repo questions. `/ws-hub add` writes the pointer for new repos (and adds `type: working` repos to the INSTRUCTIONS.md scope).
- **Refresh is AI-driven — no CI**: agents run it occasionally, before major cross-repo work when the wiki is stale (`openwiki/.last-update.json` vs recent sub-repo activity) and after completing major changes. It is always prompted — `openwiki --update "Refresh; re-scan sub-repos: <list>"` — because sub-repo commits are invisible to the hub's git (plain `--update` would skip as "no changes"). `/ws-hub docs` offers this after generating cross-repo docs.
- Generated pages are never hand-edited; the wiki is a DERIVED index, never the source of truth — authored truth lives in the dual-track docs (hub `dev-docs/` + per-repo `dev-docs/`); when wiki and dev-docs disagree, dev-docs wins and the wiki gets regenerated. The wiki is internal (not part of the `docs/` Outline track).
- The wiki indexes `type: working` repos only — never inputs (raw, unprocessed) and never outputs (derived).
- **Standalone repos count too (ADR 0007):** with no hub, the repo's own `dev-docs/` IS the product knowledge root, so the freshness detectors walk it (plus any immediate sub-directory `dev-docs/`) for staleness — excluding `openwiki/` and `dev-docs/tickets/`. In hub-root mode the hub's own `dev-docs/` is excluded (authored truth is not wiki input) and only `type: working` repos are walked.

## omp preset — conventions as enforcement

Hubs used with omp carry a project `.omp/` preset written by `/ws-hub init`:

- `.omp/config.yml` — approval posture defaults to `yolo` (omp's own default;
  the template carries a commented `write` block for cautious client repos)
  and bash guard patterns default to off (commented deny/prompt examples);
  `/ws-hub init` asks about both, plus whether to fill the per-project
  `modelRoles` block. Earlier compaction is on by default.
- `.omp/hooks/post/openwiki-freshness.ts` — a native omp TypeScript hook: on
  every session settle it compares `type: working` repos' `dev-docs/**` mtimes
  (excluding `dev-docs/tickets/`) against `openwiki/.last-update.json` and
  shows a persistent banner + toast with the exact prompted `openwiki
  --update` command (working-repo list parsed from project.yaml).
  Non-blocking; omp-only (Claude Code uses the plugin's shell Stop hook for
  the same purpose).
  Caveat: never park loose `.ts`/`.sh` files in `.claude/hooks/pre|post/`
  directories — omp's Claude-compat provider scans them.
- `.omp/rules/` — the WS rules pack, TTSR stream-interrupting rules:
  `ws-guard-git` (destructive git ops), `ws-commit-format` (Conventional
  Commits + ticket key + WS trailer, reminded per commit attempt),
  `ws-generated-files` (never hand-edit openwiki pages / changelog mirror /
  explained artefacts — fix the source), plus `openwiki-freshness` and
  ws-matt's `omp-edge-discipline`. These turn WS conventions from prose into
  enforcement in the model's output stream.

## Artifact language

Every artifact a hub generates — scoping docs, hub `dev-docs/` pages, generated `AGENTS.md` regions, `project.yaml` descriptions, ADRs and the explained artefact — is written in English regardless of the conversation language. Translations are derived copies, never the original.

## Herdr — agent fleets

Hubs pair well with [herdr](https://herdr.dev) (terminal agent multiplexer; supports claude and omp agent kinds). The ws plugin ships the vendored `herdr` skill (`plugins/ws/skills/herdr`, self-guarded by `HERDR_ENV=1`), so no per-repo or global skill install is needed where the plugin is installed. On machines WITHOUT the ws plugin, one **global** skill install per machine — `npx skills add ogulcancelik/herdr --skill herdr -g` — covers every repo and agent reading `~/.claude/skills/`; nothing is written per sub-repo. Hub pattern: one herdr workspace per sub-repo (`herdr workspace create --cwd <hub>/<repo> --label <repo>`); `HERDR_ENV=1` marks a herdr-managed pane. The hub AGENTS.md keeps a short Herdr section when in use.

**Layer ownership.** A hub's working sub-repos are the natural outer lanes: with `HERDR_ENV=1` and two or more of them genuinely in play, Herdr panes are the outer backend and the user need not name Herdr again. Parallel edits need `herdr worktree` — shared-cwd panes are coordination-only. A lane's own agent may still fan out inner `task` workers over that repo's disjoint slices, but a sub-repo is never scheduled at both layers. The full precedence table lives in `ws-graph-engineering`; the binding form is the `omp-edge-discipline` rule.

The cascade:

1. `<hub>/AGENTS.md` — high-level project map (cross-repo notes, what's where)
2. `<hub>/<sub-repo>/AGENTS.md` — per-repo rules

How each agent loads it:

- **Claude Code** — `invoke-ai.sh` (agent `claude`) passes `--add-dir <hub>/<sub-repo>` for each available sub-repo; Claude auto-loads the hub context plus each mounted repo's context (via the thin `CLAUDE.md` imports).
- **omp** — walks up from the cwd to `AGENTS.md`; it has no `--add-dir`, so sub-repo context files are not auto-loaded. The hub AGENTS.md therefore carries the instruction: when working inside `<sub-repo>/`, read `<sub-repo>/AGENTS.md` first.

Per-repo rules belong **in the repo they apply to**, not in the hub. The hub's AGENTS.md is for cross-cutting context only.

### Regenerated region (marker pair)

The hub AGENTS.md's "Sub-repos" section is machine-managed between paired markers — this is the **single definition** of the region:

```
<!-- ws-hub:repos:start -->
…one block per registered repo, generated from project.yaml…
<!-- ws-hub:repos:end -->
```

Rules:
- Commands rewrite ONLY the content between the markers; everything outside is hand-written and preserved
- `/ws-hub init` fills the region via the template's `__REPO_SECTIONS__` placeholder; later commands regenerate it from `project.yaml`
- If the markers are missing, recreate the pair at the end of the "Sub-repos" section — never guess at a partial match

## `invoke-ai.sh` contract

Six steps every launch:

1. **Intro animation** (3 s, `WS_HUB_ANIM_SECONDS` env to adjust) — `WS.agency » INVOKE AI for <project>` header, atlas silhouette with rotating Earth and random lightning bolts.
2. **Agent pick** — numbered menu of the registered agents (claude, omp, …). ENTER accepts the default: the last-used agent, cached in `~/.cache/ws-hub/last-agent`, falling back to `claude`. The selection is persisted back to that cache file. Bypass the menu with `--agent <name>` or the `WS_HUB_AGENT` env var; an unknown name errors out, listing the registered agents.
3. **Project summary** — name, description, and per-repo table with `✓` (reachable/mounted) or `⊘` (skipped, no local checkout). The reachability column is rendered for the chosen agent: when omp is chosen, sibling-pathed (`../`) repos show `⊘ unreachable in omp`.
4. **Marketplace check** — `git ls-remote $WS_MARKETPLACE_URL` (default `https://github.com/wsagency/ws-claude-marketplace.git`, override via the `WS_MARKETPLACE_URL` env var), bounded by a 5 s timeout when `timeout`/`gtimeout` is available; if the remote can't be reached, the check is skipped with an offline note. Compares against the cached SHA in `~/.cache/ws-hub/known-marketplace-sha`, which is rewritten on every launch — so the messages are relative to the last launch: a first-time-add hint, "changed since last launch", or "no new changes since last launch". The hint is per-agent: claude → `claude plugin marketplace add|update …` CLI commands; omp → its `/marketplace` command.
5. **ENTER prompt** — user confirms before launch.
6. **Launch** — the chosen agent's registry function builds the command:
   - `claude` → `claude --dangerously-skip-permissions --add-dir <abs> …` for every accessible repo
   - `omp` → plain `omp` at the hub root (omp has no `--add-dir` equivalent)
   - Inside tmux (`$TMUX` set) → exec directly
   - Else if `tmux` available: check `has-session -t <session>`
     - Exists → prompt `[a]ttach / [n]ew with suffix / [c]ancel`
     - Missing → create new session and run the chosen agent inside
   - Else: exec without tmux, with a hint to install it

Agent registry (extensibility): agents are registered near the top of the script — a `REGISTERED_AGENTS` list plus one `agent_cmd_<name>()` function per agent, marked with the "add new agents here" comment. Adding an agent = append its name to the list + define its command function.

Arg forwarding: `--agent <name>` is parsed and consumed only BEFORE a literal `--`. Everything after `--` is forwarded verbatim to the chosen agent's command and is agent-specific — e.g. `./invoke-ai.sh --agent claude -- --resume` (`--resume` is a claude arg, not an omp one).

Filesystem presence is the source of truth for access — never check git permissions from the script.

## Common workflows

| Want to... | Use |
|---|---|
| Create a new hub | `/ws-hub init` |
| Launch an agent (claude / omp) across all repos | `cd <hub> && ./invoke-ai.sh` |
| Bootstrap on a new machine (clone all sub-repos) | `/ws-hub repos clone` |
| Update all sub-repos | `/ws-hub repos pull` |
| Check what's changed everywhere | `/ws-hub status` |
| Add a new sub-repo | `/ws-hub add` |
| Find unregistered sub-repos | `/ws-hub add --scan` |
| Refresh sub-repo descriptions | `/ws-hub describe` |
| Generate cross-repo docs | `/ws-hub docs` |
| Process a client delivery | `/ws-hub intake` |
| Upgrade hub conventions | `/ws-hub update` |

## Access control model

There is no explicit access control. It relies on git permissions of each underlying repo:

- The hub repo (`<project>-main`) is typically broadly accessible — it contains metadata plus the product `dev-docs/`
- `/ws-hub repos clone` tries to clone each registered URL; repos the user can't access fail and are skipped
- `invoke-ai.sh` skips sub-repos missing from disk
- PO has access to all → sees everything; marketing has only marketing → mounts only marketing

No config branching needed. The filesystem reflects access. Client deliveries
and design assets live in dedicated input repos precisely so their git access
stays separable from the hub's.

## When NOT to use a hub

- Single-repo projects — use that repo's own `AGENTS.md`
- Truly independent products that just happen to share a client
- True monorepos (workspace tooling already gives a unified view)

Hubs shine when repos are technically separate (different stacks, different deploy cadences, different access boundaries) but logically part of one product.
