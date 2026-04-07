#!/usr/bin/env bash
# ObelyZK PreToolUse Hook
#
# Claude Code hook that intercepts tool calls and classifies on-chain
# transactions before execution using the ZKML classifier.
#
# Install in .claude/settings.json:
#   {
#     "hooks": {
#       "PreToolUse": [{
#         "matcher": "Bash",
#         "hooks": [{
#           "type": "command",
#           "command": "/path/to/pre-tool-use.sh"
#         }]
#       }]
#     }
#   }
#
# Environment:
#   PROVER_URL  - Prove-server base URL (default: http://localhost:8080)
#
# Exit behavior:
#   Outputs JSON to stdout. Exit 0 always (fail-open).
#   When classifier uses test weights, only warns — never blocks.

set -euo pipefail

PROVER_URL="${PROVER_URL:-http://localhost:8080}"
CLASSIFY_TIMEOUT=5

# Read hook context from stdin
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

# Only intercept Bash tool
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
if [ -z "$COMMAND" ]; then
  exit 0
fi

# Match on-chain transaction patterns
if ! echo "$COMMAND" | grep -qE '(starkli invoke|starkli deploy|sncast invoke|sncast deploy)'; then
  exit 0
fi

# Extract the first hex address from the command (target contract)
TARGET=$(echo "$COMMAND" | grep -oE '0x[0-9a-fA-F]{10,66}' | head -1 || echo "")
if [ -z "$TARGET" ]; then
  exit 0
fi

# Classify the transaction
RESULT=$(curl -s --max-time "$CLASSIFY_TIMEOUT" \
  -X POST "${PROVER_URL}/api/v1/classify" \
  -H "Content-Type: application/json" \
  -d "{\"target\": \"$TARGET\", \"value\": \"0\", \"selector\": \"0x0\"}" \
  2>/dev/null || echo '{"error": "prover_unreachable"}')

# Check for errors
ERROR=$(echo "$RESULT" | jq -r '.error // empty' 2>/dev/null || echo "")
if [ -n "$ERROR" ]; then
  # Fail-open: prover unreachable or error, allow the action
  echo "ObelyZK: prover unreachable or error ($ERROR), allowing action" >&2
  exit 0
fi

DECISION=$(echo "$RESULT" | jq -r '.decision // "approve"' 2>/dev/null || echo "approve")
SCORE=$(echo "$RESULT" | jq -r '.threat_score // 0' 2>/dev/null || echo "0")
PROOF_HASH=$(echo "$RESULT" | jq -r '.io_commitment // "unknown"' 2>/dev/null || echo "unknown")

# Log classification result to stderr (visible in Claude Code logs)
echo "ObelyZK classify: target=$TARGET decision=$DECISION threat_score=$SCORE" >&2

case "$DECISION" in
  block)
    # With test weights, warn but don't block
    echo "ObelyZK: WOULD BLOCK (test weights active). threat_score=$SCORE proof=$PROOF_HASH" >&2
    # When trained weights are deployed, uncomment the following to enforce:
    # jq -n --arg reason "ObelyZK Firewall: transaction blocked (threat_score=$SCORE). Proof: $PROOF_HASH" '{
    #   hookSpecificOutput: {
    #     hookEventName: "PreToolUse",
    #     permissionDecision: "deny",
    #     permissionDecisionReason: $reason
    #   }
    # }'
    exit 0
    ;;
  escalate)
    # Ask the user for confirmation
    jq -n --arg reason "ObelyZK Firewall: transaction flagged (threat_score=$SCORE, target=$TARGET). Review before proceeding." '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: $reason
      }
    }'
    exit 0
    ;;
  *)
    # Approved — allow
    exit 0
    ;;
esac
