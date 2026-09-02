#!/usr/bin/env bash
# ws plugin Stop hook. Canonical policy is parsed by the shared Node runtime
# so hub children never inherit policy and legacy files are never fallbacks.

set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec "${NODE_BINARY:-node}" "$SCRIPT_DIR/docs-policy.mjs" stop
