#!/usr/bin/env bash
# SessionStart hook: when claude opens in a folder bound to a WS project,
# inject a brief assignment dashboard so the user sees their Jira workload
# without having to run /ws-status manually.
#
# Output of this script becomes additional system context for the session.
# We keep it terse — claude will offer to refresh via /ws-status if needed.

set -euo pipefail

PROJECT_CONFIG="./.claude/ws-project.yaml"
GLOBAL_CONFIG="$HOME/.claude/ws/config.yaml"
CACHE="$HOME/.cache/ws-hub/status.txt"

[[ -f "$PROJECT_CONFIG" ]] || exit 0
[[ -f "$GLOBAL_CONFIG" ]] || exit 0

# Honor the per-project / global toggle (default on)
toggle=$(awk '/^hooks:/{inh=1; next} inh && /^[^[:space:]]/{inh=0} inh && /session_start_dashboard:/{sub(/^[[:space:]]*session_start_dashboard:[[:space:]]*/,""); gsub(/[[:space:]]+#.*$/,""); gsub(/[[:space:]]+$/,""); print; exit}' "$PROJECT_CONFIG")
if [[ -z "$toggle" ]]; then
  toggle=$(awk '/^ui:/{inu=1; next} inu && /^[^[:space:]]/{inu=0} inu && /session_start_dashboard:/{sub(/^[[:space:]]*session_start_dashboard:[[:space:]]*/,""); gsub(/[[:space:]]+#.*$/,""); gsub(/[[:space:]]+$/,""); print; exit}' "$GLOBAL_CONFIG")
fi
[[ "$toggle" == "false" ]] && exit 0

project=$(awk '/^jira:/{inj=1; next} inj && /^[^[:space:]]/{inj=0} inj && /project:/{sub(/^[[:space:]]*project:[[:space:]]*/,""); gsub(/[[:space:]]+#.*$/,""); print; exit}' "$PROJECT_CONFIG")
branch=$(git branch --show-current 2>/dev/null || echo "")
ticket=""
if [[ -n "$branch" ]]; then
  ticket=$(printf '%s' "$branch" | grep -oE '^[A-Z]+-[0-9]+' || true)
fi

cat <<EOF
[ws-marketplace] This project is bound to Jira project: ${project:-unknown}.
Current branch: ${branch:-(none)}${ticket:+  · ticket: $ticket}

The user likely wants to see their Jira workload. If they don't immediately give a task, run /ws-status to render their assignments and a suggestion for what to pick up next. Use the cached snapshot at $CACHE if it's less than 5 minutes old; otherwise fetch fresh via jira-cli (/ws-status does this).

Jira-aware commits: /ws-commit (Conventional Commits + ticket suffix, optional Smart Commit worklog). For PR flow: /ws-commit-push-pr.
EOF
