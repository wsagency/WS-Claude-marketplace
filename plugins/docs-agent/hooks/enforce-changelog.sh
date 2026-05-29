#!/usr/bin/env bash
# docs-agent PreToolUse hook
# Blocks `git commit` when staged code changes lack a CHANGELOG.md entry.
# No-op when .claude/docs-config.yaml is missing in the project.

set -euo pipefail

# Read the hook event from stdin
input=$(cat)

# Extract tool name and command via simple text parsing (avoid jq dependency)
tool_name=$(printf '%s' "$input" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
[[ "$tool_name" != "Bash" ]] && exit 0

# Extract the command field (single-line assumption; multi-line shell input is rare in hook events but acceptable to skip)
command=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' | head -1)

# Only act on `git commit` invocations (not amend, not --allow-empty)
case "$command" in
  *"git commit"*"--allow-empty"*) exit 0 ;;
  *"git commit"*) ;;
  *) exit 0 ;;
esac

# Opt-in check: only enforce if .claude/docs-config.yaml exists in cwd
[[ -f .claude/docs-config.yaml ]] || exit 0

# Honor auto.enforce_via_hooks (default true; explicit false disables)
enforce=$(awk '
  /^[[:space:]]*auto:/ {inauto=1; next}
  inauto && /^[^[:space:]]/ {inauto=0}
  inauto && /enforce_via_hooks:/ {
    sub(/^[[:space:]]*enforce_via_hooks:[[:space:]]*/,"")
    sub(/[[:space:]]+#.*$/,"")
    print; exit
  }
' .claude/docs-config.yaml)
[[ "$enforce" == "false" ]] && exit 0

# Detect skip-types from config (comma-list inside [...]); default skip set
skip_types_default="docs chore test style build ci"
skip_types=$(awk '
  /^[[:space:]]*changelog:/ {incl=1; next}
  incl && /^[^[:space:]]/ {incl=0}
  incl && /skip_types:/ {
    sub(/^[[:space:]]*skip_types:[[:space:]]*/,"")
    gsub(/[\[\]"'\'']/,"")
    gsub(/,/," ")
    print; exit
  }
' .claude/docs-config.yaml)
skip_types="${skip_types:-$skip_types_default}"

# Inspect staged diff: any code changes outside docs/, dev-docs/, *.md?
staged_files=$(git diff --cached --name-only 2>/dev/null || true)
[[ -z "$staged_files" ]] && exit 0

has_code=0
while IFS= read -r f; do
  case "$f" in
    docs/*|dev-docs/*|*.md|*.MD|CHANGELOG.md) ;;
    *) has_code=1 ;;
  esac
done <<< "$staged_files"

[[ $has_code -eq 0 ]] && exit 0  # only docs/changelog files — fine

# CHANGELOG.md must be in the staged set if has_code
if printf '%s\n' "$staged_files" | grep -q '^CHANGELOG\.md$'; then
  exit 0
fi

# Try to detect commit type from -m message in the command (best-effort)
msg=$(printf '%s' "$command" | sed -n "s/.*-m[[:space:]]*[\"']\([^\"']*\)[\"'].*/\1/p" | head -1)
commit_type=$(printf '%s' "$msg" | sed -n 's/^\([a-z]*\)[(:!].*/\1/p')

if [[ -n "$commit_type" ]]; then
  for t in $skip_types; do
    [[ "$commit_type" == "$t" ]] && exit 0
  done
fi

# Block
cat <<JSON
{
  "hookSpecificOutput": {
    "permissionDecision": "deny"
  },
  "systemMessage": "Code changes staged without a CHANGELOG.md entry. Add an entry under [Unreleased] via /ws-docs changelog, or stage CHANGELOG.md manually. To bypass once, prefix the commit with a skip type (docs:, chore:, test:, style:, build:, ci:)."
}
JSON
exit 2
