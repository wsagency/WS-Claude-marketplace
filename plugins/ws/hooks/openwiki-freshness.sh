#!/usr/bin/env bash
# Stop hook: non-blocking freshness reminder for hub-level OpenWiki.
# Convention (WS): refresh is AI-driven — a session that changed any dev-docs/
# should refresh the wiki before wrapping up. This hook only REMINDS (never
# blocks): if any dev-docs file the wiki actually covers is newer than
# openwiki/.last-update.json, emit a systemMessage suggesting the prompted
# refresh.
#
# Coverage (ADR 0006 / ADR 0007):
#  - Hub (project.yaml present): only `type: working` repos count (legacy hubs:
#    entries with neither `type` nor `role` read as working). Input repos (raw
#    deliveries), output repos (derived artifacts — including any entry carrying
#    `purpose:`), and the hub's OWN dev-docs/ (authored truth, not wiki input)
#    are never walked.
#  - Standalone (no project.yaml): the repo's OWN dev-docs/ is the product
#    knowledge root and COUNTS, plus each immediate sub-directory's dev-docs/.
#  - Both modes exclude openwiki/ and any dev-docs/tickets/ subtree; the walker
#    also prunes node_modules/ and .git/ and skips dotfiles (parity with the omp
#    twins extensions/omp-ws/src/wiki-freshness.ts and the template hook).
# Designed for /bin/bash 3.2 (no mapfile/readarray/assoc-arrays/${var,,}).
set -euo pipefail

STAMP="./openwiki/.last-update.json"
[[ -f "$STAMP" ]] || exit 0   # no OpenWiki here — stay silent

# Print dev-docs files newer than $STAMP under $1. Never exits non-zero: it
# tolerates unreadable directories (`2>/dev/null` + `|| true`) and arbitrarily
# large file counts (no `head` in the pipe, so `find` never takes SIGPIPE under
# `set -o pipefail`). Prunes tickets/node_modules/.git and skips dotfiles.
stale_under() {
	find "$1" \( -name tickets -o -name node_modules -o -name .git \) -prune \
		-o -type f -newer "$STAMP" ! -name '.*' -print 2>/dev/null || true
}

newer=""
names=""
hub=0
if [[ -f "./project.yaml" ]]; then
	hub=1
	# Parse only the `repos:` block (a column-0 key ends it — the rule
	# lib/yaml-lite.ts uses). Keep working repos: explicit `type: working`, or
	# legacy entries with neither type nor role; an entry carrying `purpose:` is
	# an output repo and never counts. Prints two tab-separated fields: path, name.
	repos=$(awk '
		function clean(v) {
			sub(/[[:space:]]+#.*$/, "", v)
			gsub(/^["'"'"']|["'"'"']$/, "", v)
			sub(/[[:space:]]+$/, "", v)
			return v
		}
		function flush() {
			if (inRepos && have && name != "" && purpose == "" && (type == "working" || (type == "" && role == "")))
				print (path == "" ? "./" name : path) "\t" name
		}
		BEGIN { inRepos=0; have=0; name=""; type=""; role=""; purpose=""; path=""; sawRepos=0; sawName=0 }
		/^[^[:space:]]/ {
			if (have) flush()
			have=0; name=""; type=""; role=""; purpose=""; path=""
			inRepos = ($0 ~ /^repos:[[:space:]]*$/)
			if (inRepos) sawRepos=1
			next
		}
		!inRepos { next }
		/^[[:space:]]*-[[:space:]]*name:/ {
			if (have) flush()
			have=1; type=""; role=""; purpose=""; path=""
			v=$0; sub(/.*-[[:space:]]*name:[[:space:]]*/, "", v)
			name=clean(v)
			if (name != "") sawName=1
			next
		}
		have && /^[[:space:]]+(type|role|path|purpose):/ {
			key=$0; sub(/^[[:space:]]*/, "", key); sub(/:.*/, "", key)
			v=$0; sub(/^[[:space:]]*[a-z]+:[[:space:]]*/, "", v)
			v=clean(v)
			if (key == "type") type=v; else if (key == "role") role=v; else if (key == "purpose") purpose=v; else path=v
			next
		}
		END {
			if (have) flush()
			if (sawRepos && !sawName)
				print "openwiki-freshness: project.yaml has a `repos:` block but no list entries were recognised (expected `- name: <repo>`). Sub-repo scanning may be misconfigured — see ADR 0006." > "/dev/stderr"
		}
	' ./project.yaml)

	while IFS=$'\t' read -r rpath rname; do
		names=$(printf '%s, %s' "$names" "$rname")   # every working repo, not just stale ones
		[[ -d "$rpath/dev-docs" ]] || continue
		found=$(stale_under "$rpath/dev-docs")
		[[ -n "$found" ]] && newer=$(printf '%s\n%s' "$newer" "$found")
	done <<< "$repos"
	names=${names#, }
else
	# Standalone repo (no project.yaml — ADR 0007): the repo's OWN dev-docs/ is
	# the product knowledge root and counts; also walk each immediate
	# sub-directory's dev-docs/. Excludes openwiki/ and dev-docs/tickets/.
	if [[ -d "./dev-docs" ]]; then
		newer=$(stale_under "./dev-docs")
	fi
	for sub in */; do
		[[ "$sub" == "openwiki/" || "$sub" == "node_modules/" ]] && continue
		case "$sub" in .*) continue ;; esac
		if [[ -d "./${sub}dev-docs" ]]; then
			found=$(stale_under "./${sub}dev-docs")
			[[ -n "$found" ]] && newer=$(printf '%s\n%s' "$newer" "$found")
		fi
	done
fi

[[ -n "$newer" ]] || exit 0

# True total first (count before truncating the display list), then cap display.
count=$(printf '%s\n' "$newer" | sed '/^$/d' | wc -l | tr -d ' ')
# Join with ", ": `paste -sd ', '` rotates its delimiter list and yields "a,b c,d".
files=$(printf '%s\n' "$newer" | sed '/^$/d' | sed -n '1,5p' | sed 's|^\./||' | paste -sd, - | sed 's/,/, /g')
if [[ "$count" -gt 5 ]]; then
	files="$files, … and $((count - 5)) more"
fi
if [[ "$hub" -eq 1 ]]; then
	rescan="re-scan sub-repos: $names"
else
	rescan="re-scan all sub-repos"
fi

printf '{"systemMessage":"OpenWiki freshness: %s dev-docs file(s) changed since the last wiki refresh (%s). Convention: refresh before wrapping up — openwiki --update \\"Refresh; %s\\""}\n' \
	"$count" "$files" "$rescan"
exit 0
