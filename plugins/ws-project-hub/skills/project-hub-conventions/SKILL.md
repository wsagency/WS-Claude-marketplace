---
name: project-hub-conventions
description: Conventions for WS Agency multi-repo project hubs (subfolder layout, project.yaml schema, CLAUDE.md cascade, .gitignore managed block, invoke-ai.sh contract). Use when creating, extending, or troubleshooting a `<project>-main` hub repo, or when asked about "project hub", "multi-repo", or `<name>-main` repos.
---

# Project Hub Conventions

The WS Agency `ws-project-hub` plugin organizes multi-repo projects under a single hub repo (`<project>-main`). Each sub-repo (mobile app, marketing site, design assets, docs, etc.) lives in a **subfolder of the hub** with its own independent git history.

## Layout

```
<project>-main/
├── .git/                     # hub's git — tracks meta files only
├── .gitignore                # managed block excludes sub-repo subfolders
├── .claude/skills/           # vendored conventions (this file)
├── project.yaml              # registry of all sub-repos
├── CLAUDE.md                 # project map for Claude
├── invoke-ai.sh              # launches Claude with --add-dir for every sub-repo
├── README.md
├── <project>-app/.git/       # own git, gitignored
├── <project>-marketing/.git/ # own git, gitignored
├── <project>-design/.git/    # own git, gitignored
└── <project>-docs/.git/      # own git, gitignored
```

Sibling layout (`path: ../<name>`) is still supported for back-compat, but new repos default to nested subfolders.

## `project.yaml` schema

```yaml
project:
  name: <kebab-case-project-name>
  description: <one-line description>
  session: <tmux-session-name>  # optional, default <name>-hub

repos:
  - name: <repo-name>           # required, matches directory name
    path: ./<repo-name>         # required, relative to hub; nested by default
    url: <git-remote-url>       # optional but recommended (enables /ws-hub-repos clone)
    description: <purpose>      # required (may be "TODO" temporarily)
    tech: <stack-keywords>      # optional, e.g. "react-native, typescript"
```

Path rules:
- Nested (recommended): `./<name>` — auto-added to `.gitignore` managed block
- Sibling (legacy): `../<name>` — not in `.gitignore` (it's outside the hub)
- `name` matches the directory basename so `/ws-hub-add-repo --scan` can detect new repos

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

## `.gitignore` managed block

The plugin maintains a single block in the hub's `.gitignore`:

```gitignore
# === ws-project-hub: sub-repos (auto-managed, do not edit) ===
/<project>-app/
/<project>-marketing/
/<project>-design/
# === /ws-project-hub ===
```

Rules:
- Anything outside the `=== ws-project-hub: ... ===` markers is hand-written and preserved
- `/ws-hub-add-repo` (with or without `--scan`) rewrites only what's between the markers
- Sibling-pathed repos (`../X`) are NOT added — they're not in the hub
- If the block is missing, commands create it at the top of `.gitignore`

## CLAUDE.md cascade

When `invoke-ai.sh` launches Claude with `--add-dir <hub>/<sub-repo>` for each available sub-repo, Claude Code automatically loads:

1. `<hub>/CLAUDE.md` — high-level project map (cross-repo notes, what's where)
2. `<hub>/<sub-repo>/CLAUDE.md` — per-repo rules (loaded for each `--add-dir`'d folder)

Per-repo rules belong **in the repo they apply to**, not in the hub. The hub's CLAUDE.md is for cross-cutting context only.

### Regenerated region (marker pair)

The hub CLAUDE.md's "Sub-repos" section is machine-managed between paired markers — this is the **single definition** of the region:

```
<!-- ws-hub:repos:start -->
…one block per registered repo, generated from project.yaml…
<!-- ws-hub:repos:end -->
```

Rules:
- Commands rewrite ONLY the content between the markers; everything outside is hand-written and preserved
- `/ws-hub-init` fills the region via the template's `__REPO_SECTIONS__` placeholder; later commands regenerate it from `project.yaml`
- If the markers are missing, recreate the pair at the end of the "Sub-repos" section — never guess at a partial match

## `invoke-ai.sh` contract

Five steps every launch:

1. **Intro animation** (3 s, `WS_HUB_ANIM_SECONDS` env to adjust) — `WS.agency » INVOKE AI for <project>` header, atlas silhouette with rotating Earth and random lightning bolts.
2. **Project summary** — name, description, and per-repo table with `✓` (mounted) or `⊘` (skipped, no local checkout).
3. **Marketplace check** — `git ls-remote $WS_MARKETPLACE_URL` (default `wsagency/ws-claude-marketplace`); compares against cached SHA in `~/.cache/ws-hub/known-marketplace-sha`. Prints first-time-add, update-available, or up-to-date message.
4. **ENTER prompt** — user confirms before launch.
5. **Launch**:
   - Builds `claude --dangerously-skip-permissions --add-dir <abs> …` for every accessible repo
   - Inside tmux (`$TMUX` set) → exec directly
   - Else if `tmux` available: check `has-session -t <session>`
     - Exists → prompt `[a]ttach / [n]ew with suffix / [c]ancel`
     - Missing → create new session and run claude inside
   - Else: exec without tmux, with a hint to install it
- Forwards extra args (`./invoke-ai.sh -- --resume`) to claude

Filesystem presence is the source of truth for access — never check git permissions from the script.

## Common workflows

| Want to... | Use |
|---|---|
| Create a new hub | `/ws-hub-init` |
| Launch Claude across all repos | `cd <hub> && ./invoke-ai.sh` |
| Bootstrap on a new machine (clone all sub-repos) | `/ws-hub-repos clone` |
| Update all sub-repos | `/ws-hub-repos pull` |
| Check what's changed everywhere | `/ws-hub-status` |
| Add a new sub-repo | `/ws-hub-add-repo` |
| Find unregistered sub-repos | `/ws-hub-add-repo --scan` |
| Refresh sub-repo descriptions | `/ws-hub-describe` |
| Generate cross-repo docs | `/ws-hub-docs` |

## Access control model

There is no explicit access control. It relies on git permissions of each underlying repo:

- The hub repo (`<project>-main`) is typically broadly accessible — it contains only metadata
- `/ws-hub-repos clone` tries to clone each registered URL; repos the user can't access fail and are skipped
- `invoke-ai.sh` skips sub-repos missing from disk
- PO has access to all → sees everything; marketing has only marketing → mounts only marketing

No config branching needed. The filesystem reflects access.

## When NOT to use a hub

- Single-repo projects — use that repo's own `CLAUDE.md`
- Truly independent products that just happen to share a client
- True monorepos (workspace tooling already gives a unified view)

Hubs shine when repos are technically separate (different stacks, different deploy cadences, different access boundaries) but logically part of one product.
