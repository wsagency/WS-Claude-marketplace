#!/usr/bin/env bash
# ws plugin PreToolUse hook. Canonical policy is parsed by the shared Node
# runtime so shell tooling never grows a second YAML reader.

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec "${NODE_BINARY:-node}" "$SCRIPT_DIR/docs-policy.mjs" pre-commit
