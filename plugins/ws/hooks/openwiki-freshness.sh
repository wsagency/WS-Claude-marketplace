#!/usr/bin/env bash
# Stop hook: non-blocking freshness reminder for hub-level OpenWiki.
# Convention (WS): refresh is AI-driven — a session that changed any dev-docs/
# should refresh the wiki before wrapping up. This hook only REMINDS (never
# blocks): if any dev-docs file the wiki actually covers is newer than
# openwiki/.last-update.json, emit a systemMessage suggesting the prompted
# refresh.
#
# Coverage (ADR 0006): in a hub (project.yaml present) only `type: working`
# repos count — input repos (raw deliveries) and output repos (derived
# artifacts) are not indexed by the wiki, and neither is the hub's own
# dev-docs/ (authored truth, not wiki input). Outside a hub, fall back to the
# legacy walk (the standalone repo's own dev-docs).
set -euo pipefail

STAMP="./openwiki/.last-update.json"
[[ -f "$STAMP" ]] || exit 0   # no OpenWiki here — stay silent

newer=""
names=""
if [[ -f "./project.yaml" ]]; then
  # Parse repos entries line-wise; keep working repos only:
  # explicit `type: working`, or legacy entries with neither type nor role.
  # Prints two tab-separated fields per repo: path and name.
  repos=$(awk '
    function flush() {
      if (have && (type == "working" || (type == "" && role == "")))
        print (path == "" ? "./" name : path) "\t" name
    }
    /^[[:space:]]*-[[:space:]]*name:/ {
      flush(); have=1; type=""; role=""; path=""
      v=$0; sub(/.*-[[:space:]]*name:[[:space:]]*/, "", v)
      sub(/[[:space:]]+#.*$/, "", v); gsub(/["'"'"']/, "", v); gsub(/[[:space:]]+$/, "", v)
      name=v; next
    }
    have && /^[[:space:]]+(type|role|path):/ {
      key=$0; sub(/^[[:space:]]*/, "", key); sub(/:.*/, "", key)
      v=$0; sub(/^[[:space:]]*[a-z]+:[[:space:]]*/, "", v)
      sub(/[[:space:]]+#.*$/, "", v); gsub(/["'"'"']/, "", v); gsub(/[[:space:]]+$/, "", v)
      if (key == "type") type=v; else if (key == "role") role=v; else path=v
      next
    }
    END { flush() }
  ' ./project.yaml)

  while IFS=$'\t' read -r rpath rname; do
    [[ -n "$rpath" && -d "$rpath/dev-docs" ]] || continue
    found=$(find "$rpath/dev-docs" -path '*/tickets' -prune -o -type f -newer "$STAMP" -print 2>/dev/null | head -5)
    if [[ -n "$found" ]]; then
      newer=$(printf '%s\n%s' "$newer" "$found")
      names=$(printf '%s, %s' "$names" "$rname")
    fi
  done <<< "$repos"
  newer=$(printf '%s' "$newer" | sed '/^$/d' | head -5)
  names=${names#, }
else
  # Standalone repo (no project.yaml): legacy behavior — any dev-docs tree,
  # including this repo's own.
  newer=$(find . -maxdepth 4 -path '*/dev-docs/*' -type f -newer "$STAMP" \
            -not -path './openwiki/*' -not -path '*/dev-docs/tickets/*' 2>/dev/null | head -5)
fi

[[ -n "$newer" ]] || exit 0

count=$(printf '%s\n' "$newer" | wc -l | tr -d ' ')
files=$(printf '%s\n' "$newer" | sed 's|^\./||' | paste -sd ', ' -)
repolist=${names:-<working repos from project.yaml>}
printf '{"systemMessage":"OpenWiki freshness: %s dev-docs file(s) changed since the last wiki refresh (%s). Convention: refresh before wrapping up — openwiki --update \\"Refresh; re-scan sub-repos: %s\\""}\n' \
  "$count" "$files" "$repolist"
exit 0
