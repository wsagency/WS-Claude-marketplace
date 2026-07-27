#!/bin/bash
# Parse git log for changelog generation
# Usage: ./parse-git-log.sh [since-ref] [until-ref]
#
# Examples:
#   ./parse-git-log.sh                    # All commits since last tag
#   ./parse-git-log.sh v1.0.0             # Commits since v1.0.0
#   ./parse-git-log.sh v1.0.0 v1.1.0      # Commits between v1.0.0 and v1.1.0

set -e

SINCE_REF="${1:-}"
UNTIL_REF="${2:-HEAD}"

# If no since-ref provided, try to find the last tag
if [ -z "$SINCE_REF" ]; then
    SINCE_REF=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
fi

# Build the git log range
if [ -n "$SINCE_REF" ]; then
    RANGE="${SINCE_REF}..${UNTIL_REF}"
else
    RANGE="$UNTIL_REF"
fi

# Output format: hash|type|subject|body
# Type is extracted from conventional commit prefix if present
git log "$RANGE" --no-merges --pretty=format:'%h|%s|%b---END---' | while IFS= read -r line; do
    # Skip empty lines
    [ -z "$line" ] && continue

    # Extract fields
    hash=$(echo "$line" | cut -d'|' -f1)
    subject=$(echo "$line" | cut -d'|' -f2)
    body=$(echo "$line" | cut -d'|' -f3- | sed 's/---END---$//')

    # Try to extract conventional commit type
    type=""
    if [[ "$subject" =~ ^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:\ (.+)$ ]]; then
        type="${BASH_REMATCH[1]}"
        subject="${BASH_REMATCH[3]}"
    fi

    # Map type to changelog section
    section=""
    case "$type" in
        feat)     section="Added" ;;
        fix)      section="Fixed" ;;
        docs)     section="Changed" ;;
        refactor) section="Changed" ;;
        perf)     section="Changed" ;;
        revert)   section="Removed" ;;
        *)
            # Try to infer from subject keywords
            subject_lower=$(echo "$subject" | tr '[:upper:]' '[:lower:]')
            if [[ "$subject_lower" =~ ^add|^new|^introduce|^implement ]]; then
                section="Added"
            elif [[ "$subject_lower" =~ ^fix|^repair|^resolve|^close ]]; then
                section="Fixed"
            elif [[ "$subject_lower" =~ ^remove|^delete|^drop ]]; then
                section="Removed"
            elif [[ "$subject_lower" =~ ^deprecate ]]; then
                section="Deprecated"
            elif [[ "$subject_lower" =~ ^security|^vuln|cve ]]; then
                section="Security"
            else
                section="Changed"
            fi
            ;;
    esac

    # Check for breaking change indicator
    breaking=""
    if [[ "$subject" =~ ^!|BREAKING ]]; then
        breaking="BREAKING: "
    fi

    # Output as JSON-like format for easy parsing
    echo "{\"hash\":\"$hash\",\"section\":\"$section\",\"subject\":\"${breaking}${subject}\",\"body\":\"$body\"}"
done
