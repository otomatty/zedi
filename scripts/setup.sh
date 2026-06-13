#!/usr/bin/env bash
# Legacy entry point — use: bun run init
set -euo pipefail
cd "$(dirname "$0")/.."
exec bun run init
