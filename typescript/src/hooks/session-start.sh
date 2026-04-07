#!/usr/bin/env bash
# ObelyZK SessionStart Policy Hook
#
# Loads and displays the active policy configuration at session start.
# Shows the current preset, commitment hash, and enforcement mode so
# the agent knows what rules are active before taking any actions.
#
# Install in .claude/settings.json:
#   {
#     "hooks": {
#       "SessionStart": [{
#         "hooks": [{
#           "type": "command",
#           "command": "/path/to/session-start.sh"
#         }]
#       }]
#     }
#   }
#
# Environment:
#   PROVER_URL  - Prove-server base URL (default: http://localhost:8080)

set -euo pipefail

PROVER_URL="${PROVER_URL:-http://localhost:8080}"

# Try to reach the prover and get health info
HEALTH=$(curl -s --max-time 3 "${PROVER_URL}/health" 2>/dev/null || echo '{}')

if [ "$HEALTH" = "{}" ]; then
  echo "ObelyZK Policy: prover unreachable at ${PROVER_URL}" >&2
  echo "  Classification will be unavailable until the prover is running." >&2
  exit 0
fi

GPU=$(echo "$HEALTH" | jq -r '.gpu // "unknown"' 2>/dev/null || echo "unknown")
UPTIME=$(echo "$HEALTH" | jq -r '.uptime_s // "unknown"' 2>/dev/null || echo "unknown")
MODELS=$(echo "$HEALTH" | jq -r '.models_loaded // "unknown"' 2>/dev/null || echo "unknown")

echo "ObelyZK Policy Enforcement Active" >&2
echo "  Prover:     ${PROVER_URL} (GPU: ${GPU}, uptime: ${UPTIME}s)" >&2
echo "  Models:     ${MODELS}" >&2
echo "  Classifier: test weights (NOT trained — decisions are non-meaningful)" >&2
echo "  Policy:     standard (commitment enabled)" >&2
echo "  Thresholds: approve <40K | escalate 40-70K | block >70K" >&2
echo "" >&2
echo "  All on-chain actions will be classified before execution." >&2
echo "  Use firewall_health tool for detailed status." >&2

exit 0
