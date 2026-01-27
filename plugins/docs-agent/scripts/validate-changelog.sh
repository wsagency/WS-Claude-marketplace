#!/bin/bash
# Validate CHANGELOG.md format against Keep a Changelog standard
# Usage: ./validate-changelog.sh [path/to/CHANGELOG.md]
#
# Exit codes:
#   0 - Valid
#   1 - Invalid or errors found

set -e

CHANGELOG="${1:-CHANGELOG.md}"
ERRORS=0

# Color output (if terminal supports it)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

error() {
    echo -e "${RED}ERROR:${NC} $1"
    ((ERRORS++))
}

warn() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Check file exists
if [ ! -f "$CHANGELOG" ]; then
    error "Changelog file not found: $CHANGELOG"
    exit 1
fi

echo "Validating $CHANGELOG..."
echo ""

# Check for required header
if head -1 "$CHANGELOG" | grep -q "^# Changelog"; then
    success "Has '# Changelog' header"
else
    error "Missing '# Changelog' header on first line"
fi

# Check for Keep a Changelog reference
if grep -q "keepachangelog.com" "$CHANGELOG"; then
    success "References Keep a Changelog"
else
    warn "Should reference keepachangelog.com"
fi

# Check for Semantic Versioning reference
if grep -q "semver.org" "$CHANGELOG"; then
    success "References Semantic Versioning"
else
    warn "Should reference semver.org"
fi

# Check for Unreleased section
if grep -q "^\#\# \[Unreleased\]" "$CHANGELOG"; then
    success "Has [Unreleased] section"
else
    warn "Missing [Unreleased] section"
fi

# Validate version format (should be [X.Y.Z] - YYYY-MM-DD)
echo ""
echo "Checking version entries..."
VERSION_PATTERN='^\#\# \[([0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?)\] - ([0-9]{4}-[0-9]{2}-[0-9]{2})'
INVALID_VERSIONS=$(grep "^## \[" "$CHANGELOG" | grep -v "\[Unreleased\]" | grep -vE "$VERSION_PATTERN" || true)

if [ -n "$INVALID_VERSIONS" ]; then
    error "Invalid version format found:"
    echo "$INVALID_VERSIONS"
    echo "Expected format: ## [X.Y.Z] - YYYY-MM-DD"
else
    success "All version entries have valid format"
fi

# Check date format (should be YYYY-MM-DD)
echo ""
echo "Checking date formats..."
DATES=$(grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}" "$CHANGELOG" || true)
INVALID_DATES=""
while IFS= read -r date; do
    [ -z "$date" ] && continue
    # Basic validation: month 01-12, day 01-31
    month=$(echo "$date" | cut -d'-' -f2)
    day=$(echo "$date" | cut -d'-' -f3)
    if [ "$month" -lt 1 ] || [ "$month" -gt 12 ] || [ "$day" -lt 1 ] || [ "$day" -gt 31 ]; then
        INVALID_DATES="${INVALID_DATES}${date}\n"
    fi
done <<< "$DATES"

if [ -n "$INVALID_DATES" ]; then
    error "Invalid dates found:"
    echo -e "$INVALID_DATES"
else
    success "All dates are valid"
fi

# Check section order within versions
echo ""
echo "Checking section order..."
VALID_SECTIONS=("Added" "Changed" "Deprecated" "Removed" "Fixed" "Security")
SECTION_REGEX='^\#\#\# (Added|Changed|Deprecated|Removed|Fixed|Security)'
INVALID_SECTIONS=$(grep "^### " "$CHANGELOG" | grep -vE "$SECTION_REGEX" || true)

if [ -n "$INVALID_SECTIONS" ]; then
    error "Invalid section names found:"
    echo "$INVALID_SECTIONS"
    echo "Valid sections: ${VALID_SECTIONS[*]}"
else
    success "All section names are valid"
fi

# Check for empty sections
echo ""
echo "Checking for empty sections..."
PREV_LINE=""
EMPTY_SECTIONS=""
while IFS= read -r line; do
    if [[ "$PREV_LINE" =~ ^###\  ]] && [[ "$line" =~ ^###\  || "$line" =~ ^##\  || -z "$line" ]]; then
        EMPTY_SECTIONS="${EMPTY_SECTIONS}${PREV_LINE}\n"
    fi
    PREV_LINE="$line"
done < "$CHANGELOG"

if [ -n "$EMPTY_SECTIONS" ]; then
    warn "Empty sections found (should be removed):"
    echo -e "$EMPTY_SECTIONS"
else
    success "No empty sections"
fi

# Check for comparison links at bottom
echo ""
echo "Checking version links..."
LINK_PATTERN='^\[.*\]: https?://'
if grep -qE "$LINK_PATTERN" "$CHANGELOG"; then
    success "Has version comparison links"
else
    warn "Missing version comparison links at bottom of file"
fi

# Summary
echo ""
echo "================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}Validation passed!${NC}"
    exit 0
else
    echo -e "${RED}Validation failed with $ERRORS error(s)${NC}"
    exit 1
fi
