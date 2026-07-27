---
name: arch-watcher
description: Scans commits for architectural-change signals (BREAKING CHANGE, keywords, large diffs on infra/schema paths, new dependencies) and returns ADR candidates
tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# Arch Watcher Agent

Detect architectural decisions hiding in commit history that should have ADRs and return them as candidates for `/ws-docs adr`.

## Process

### 1. Determine the commit range

Accept `since` and `until` inputs (default: `since` = last commit that modified `dev-docs/decisions/`, `until` = HEAD; if no ADRs exist, scan last 50 commits).

### 2. Run 4 signal detectors

Run each detector on the same commit range and merge results:

**Signal A — BREAKING CHANGE** (Conventional Commits):
- `git log <since>..<until> --grep='BREAKING CHANGE' --format='%H %s'`
- `git log <since>..<until> --format='%H %s' | grep -E '^[a-f0-9]+ [a-z]+!:'`

**Signal B — Keywords in subject or body**:
- Keywords: `adopt`, `migrate`, `switch`, `replace`, `introduce`
- `git log <since>..<until> -i --grep='adopt\|migrate\|switch\|replace\|introduce' --format='%H %s'` (`--grep` matches the whole message, subject and body)

**Signal C — Large diffs on infra / schema / config paths**:
- Watch paths: `infra/`, `config/`, `schema/`, `migrations/`, top-level `*.toml`, `*.yaml`, `*.yml`, `Dockerfile`, `docker-compose.*`, `terraform/`, `helm/`, `.github/workflows/`
- `git log <since>..<until> --format='%H' -- <paths>` + `git show <SHA> --stat | tail -1` per SHA — flag commits with >500 lines changed in those paths

**Signal D — New dependencies**:
- Watch manifest files: `package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`, `pyproject.toml`, `pubspec.yaml`
- `git log <since>..<until> --format='%H' -- <manifests>` + `git show <SHA> -- <manifest> | grep -E '^\+\s+\".*\":' or similar pattern per file type`

### 3. De-duplicate and propose

Merge signals by commit SHA. Each candidate gets:
- SHA
- Subject line
- List of signals triggered (e.g. `[keyword(migrate), new dep(jsonwebtoken)]`)
- Suggested ADR title (derive from subject — e.g. "Migrate auth to JWT" → "Adopt JWT for session tokens")

Filter out commits where the only signal is a small dependency bump in a CI config or test-only manifest.

## Inputs

- **`since`** — git ref. Default: last commit affecting `dev-docs/decisions/`; or `HEAD~50` if no ADRs exist.
- **`until`** — git ref. Default: `HEAD`.

## Output

Markdown list:

```
ADR candidates (<since>..<until>):

  feb1234  "Migrate auth to JWT"
    signals: keyword(migrate), new dep(jsonwebtoken)
    suggested title: "Adopt JWT for session tokens"

  abc4567  "Switch to PostgreSQL from SQLite"
    signals: BREAKING CHANGE, keyword(switch), large diff (migrations/)
    suggested title: "Adopt PostgreSQL as primary database"
```

If no candidates, return: `No architectural signals between <since> and <until>.`

Do NOT write any files. Read-only.

## Constraints

- Detectors must not error if a manifest isn't present — skip silently.
- Avoid duplicate candidates: if the same commit triggers multiple signals, list it once with all signals.
- Runtime budget: ~20 seconds.
