#!/usr/bin/env bash
# ws plugin Stop hook
# Blocks claude stop when uncommitted code changes exist without a CHANGELOG.md update.
# No-op when .claude/docs-config.yaml is missing in the project.

set -euo pipefail

# Read the hook event from stdin (not directly used, but consume it)
cat > /dev/null || true

# Opt-in check
[[ -f .claude/docs-config.yaml ]] || exit 0

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

# Are there uncommitted code changes (working tree OR staged) outside docs?
diff_files=$( { git diff --name-only; git diff --cached --name-only; } 2>/dev/null | sort -u || true)
[[ -z "$diff_files" ]] && exit 0

has_code=0
while IFS= read -r f; do
  case "$f" in
    docs/*|dev-docs/*|*.md|*.MD|CHANGELOG.md) ;;
    *) has_code=1 ;;
  esac
done <<< "$diff_files"

[[ $has_code -eq 0 ]] && exit 0

# Has CHANGELOG been updated in the uncommitted set?
if printf '%s\n' "$diff_files" | grep -q '^CHANGELOG\.md$'; then
  exit 0
fi

# Block stop with a prompt
cat <<JSON
{
  "decision": "block",
  "reason": "Uncommitted code changes detected with no CHANGELOG.md update. Run /ws-docs changelog to add an entry, or confirm 'stop anyway' to override."
}
JSON
exit 0
