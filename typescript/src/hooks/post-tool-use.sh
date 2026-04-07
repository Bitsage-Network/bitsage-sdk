#!/usr/bin/env bash
# ObelyZK PostToolUse Audit Hook
#
# Logs tool execution results for audit trail. Captures:
# - Tool name and timestamp
# - Resolved action decisions, threat scores, proof hashes
# - Transaction hashes from on-chain operations
#
# Install in .claude/settings.json:
#   {
#     "hooks": {
#       "PostToolUse": [{
#         "matcher": "Bash|mcp__obelyzk-policy__.*",
#         "hooks": [{
#           "type": "command",
#           "command": "/path/to/post-tool-use.sh",
#           "async": true
#         }]
#       }]
#     }
#   }
#
# Environment:
#   OBELYZK_AUDIT_LOG  - Path to audit log file (default: ~/.obelyzk/audit.jsonl)
#
# This hook is async (non-blocking) — it logs but never blocks tool execution.

set -euo pipefail

AUDIT_LOG="${OBELYZK_AUDIT_LOG:-$HOME/.obelyzk/audit.jsonl}"

# Ensure log directory exists
mkdir -p "$(dirname "$AUDIT_LOG")"

# Read hook context from stdin
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")

# Extract tool output if available
TOOL_OUTPUT=$(echo "$INPUT" | jq -r '.tool_output // empty' 2>/dev/null || echo "")

# Build audit entry based on tool type
case "$TOOL_NAME" in
  mcp__obelyzk-policy__obelyzk_classify|mcp__obelyzk-policy__firewall_classify)
    # Classification result
    DECISION=$(echo "$TOOL_OUTPUT" | jq -r '.decision // empty' 2>/dev/null || echo "")
    SCORE=$(echo "$TOOL_OUTPUT" | jq -r '.threat_score // 0' 2>/dev/null || echo "0")
    IO_COMMIT=$(echo "$TOOL_OUTPUT" | jq -r '.io_commitment // empty' 2>/dev/null || echo "")
    POLICY=$(echo "$TOOL_OUTPUT" | jq -r '.policy_commitment // empty' 2>/dev/null || echo "")

    jq -nc \
      --arg ts "$TIMESTAMP" \
      --arg sid "$SESSION_ID" \
      --arg tool "$TOOL_NAME" \
      --arg decision "$DECISION" \
      --argjson score "$SCORE" \
      --arg io "$IO_COMMIT" \
      --arg policy "$POLICY" \
      '{timestamp: $ts, session: $sid, event: "classify", tool: $tool, decision: $decision, threat_score: $score, io_commitment: $io, policy_commitment: $policy}' \
      >> "$AUDIT_LOG"
    ;;

  mcp__obelyzk-policy__obelyzk_resolve_action|mcp__obelyzk-policy__firewall_resolve_action)
    # Resolved action
    ACTION_ID=$(echo "$TOOL_OUTPUT" | jq -r '.action_id // empty' 2>/dev/null || echo "")
    DECISION=$(echo "$TOOL_OUTPUT" | jq -r '.decision // empty' 2>/dev/null || echo "")
    SCORE=$(echo "$TOOL_OUTPUT" | jq -r '.threat_score // 0' 2>/dev/null || echo "0")
    TX_HASH=$(echo "$TOOL_OUTPUT" | jq -r '.tx_hash // empty' 2>/dev/null || echo "")

    jq -nc \
      --arg ts "$TIMESTAMP" \
      --arg sid "$SESSION_ID" \
      --arg action "$ACTION_ID" \
      --arg decision "$DECISION" \
      --argjson score "$SCORE" \
      --arg tx "$TX_HASH" \
      '{timestamp: $ts, session: $sid, event: "resolve", action_id: $action, decision: $decision, threat_score: $score, tx_hash: $tx}' \
      >> "$AUDIT_LOG"
    ;;

  mcp__obelyzk-policy__obelyzk_submit_action|mcp__obelyzk-policy__firewall_submit_action)
    # Submitted action
    ACTION_ID=$(echo "$TOOL_OUTPUT" | jq -r '.action_id // empty' 2>/dev/null || echo "")
    TX_HASH=$(echo "$TOOL_OUTPUT" | jq -r '.tx_hash // empty' 2>/dev/null || echo "")

    jq -nc \
      --arg ts "$TIMESTAMP" \
      --arg sid "$SESSION_ID" \
      --arg action "$ACTION_ID" \
      --arg tx "$TX_HASH" \
      '{timestamp: $ts, session: $sid, event: "submit", action_id: $action, tx_hash: $tx}' \
      >> "$AUDIT_LOG"
    ;;

  Bash)
    # Log on-chain Bash commands
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
    if echo "$COMMAND" | grep -qE '(starkli invoke|sncast invoke|starkli deploy)'; then
      jq -nc \
        --arg ts "$TIMESTAMP" \
        --arg sid "$SESSION_ID" \
        --arg cmd "$COMMAND" \
        '{timestamp: $ts, session: $sid, event: "onchain_bash", command: $cmd}' \
        >> "$AUDIT_LOG"
    fi
    ;;
esac

exit 0
