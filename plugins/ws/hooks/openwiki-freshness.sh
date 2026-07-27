#!/usr/bin/env bash
# Stop hook: non-blocking freshness reminder for hub-level OpenWiki.
# Convention (WS): refresh is AI-driven — a session that changed any dev-docs/
# should refresh the wiki before wrapping up. This hook only REMINDS (never
# blocks): if any */dev-docs/** file is newer than openwiki/.last-update.json,
# emit a systemMessage suggesting the prompted refresh.
set -euo pipefail

STAMP="./openwiki/.last-update.json"
[[ -f "$STAMP" ]] || exit 0   # not a hub with OpenWiki — stay silent

# dev-docs trees: hub-level (docs repo lives nested) and any sub-repo's
newer=$(find . -maxdepth 4 -path '*/dev-docs/*' -type f -newer "$STAMP" \
          -not -path './openwiki/*' 2>/dev/null | head -5)
[[ -n "$newer" ]] || exit 0

count=$(printf '%s\n' "$newer" | wc -l | tr -d ' ')
files=$(printf '%s\n' "$newer" | sed 's|^\./||' | paste -sd ', ' -)
printf '{"systemMessage":"OpenWiki freshness: %s dev-docs file(s) changed since the last wiki refresh (%s). Convention: refresh before wrapping up — openwiki --update \\"Refresh; re-scan sub-repos: <list from project.yaml, development repos only>\\""}\n' \
  "$count" "$files"
exit 0
