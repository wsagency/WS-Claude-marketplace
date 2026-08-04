#!/usr/bin/env bash
# SessionStart hook: inject the WS orchestration and English-artifact
# discipline contract into every Claude Code session.
#
# omp receives this contract via the packaged alwaysApply rule
# (omp-edge-discipline); Claude Code has no equivalent rule mechanism, so this
# hook closes the distribution gap by emitting it as SessionStart context.
#
# Emits a single JSON object of the SessionStart shape:
#   {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}
#
# Pure bash, no external binaries (no jq), no side effects, no config reads.
# The contract text is fixed. Fail-safe: the whole payload is assembled into a
# variable before any output, so any unexpected failure leaves no partial or
# malformed JSON. We deliberately avoid `set -e` so construction can never abort
# mid-payload; the trailing `|| exit 0` guarantees a clean exit with no output
# on any error. Emitting nothing is acceptable; emitting malformed JSON is not.

emit() {
  # Contract text. Authored with NO double quotes and NO backslashes, so the
  # only JSON escaping needed is joining lines with a literal backslash-n.
  local lines=(
    '[ws] Session discipline contract'
    ''
    'ENGLISH ARTIFACTS'
    ''
    'Every artifact any skill, agent, or tool writes is English. The conversation'
    'may be in any language, but written artifacts never follow it. User-facing'
    'translations are derived copies; originals stay English.'
    ''
    'ORCHESTRATION'
    ''
    'Exactly one available backend owns each work unit. Schedulers may nest only'
    'by subdivision, never by submitting the same unit twice. Backend precedence:'
    'leaf / explicit user-selected backend / Herdr director when `HERDR_ENV=1` and'
    '2+ substantial, independent, long-lived repo or subsystem lanes / batched'
    'same-session `task` / sequential.'
    'When the Herdr-director row wins, explicitly load the vendored `herdr` skill'
    'before any Herdr CLI call; the binding WS policy authorizes that load.'
    'The Herdr director stamps each top-level prompt `WS-HERDR-LANE`; a stamped'
    'lane never starts panes or resubmits lanes, but may batch genuinely disjoint'
    'inner sub-slices with `task`. WS Task workers are leaves and never spawn or'
    're-orchestrate; they return results to their owning session.'
    'Shared-cwd panes are coordination-only; parallel edits require'
    '`herdr worktree`. The full precedence table and substantial-lane definition'
    'live in the `ws-graph-engineering` skill.'
  )

  # Join lines with a literal backslash-n (the JSON escape). No source line
  # contains a double quote or a backslash, so this is the only escape needed.
  local ctx=''
  local i
  for i in "${!lines[@]}"; do
    [[ "$i" -gt 0 ]] && ctx+='\n'
    ctx+="${lines[$i]}"
  done

  # One printf, last action: %s inserts ctx verbatim (no escape interpretation
  # of the argument); the trailing \n in the format is the line terminator.
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$ctx"
}

emit || exit 0
exit 0
