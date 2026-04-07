#!/usr/bin/env node
/**
 * ObelyZK Policy MCP Server — Entry Point
 *
 * Starts the ZKML policy enforcement MCP server over stdio transport.
 * AI agents (Claude Code, etc.) connect to this process to classify
 * transactions, check trust status, and verify proofs.
 *
 * Environment variables:
 *   PROVER_URL          — Prove-server base URL (default: http://localhost:8080)
 *   STARKNET_RPC        — Starknet JSON-RPC URL (default: Sepolia Alchemy)
 *   FIREWALL_CONTRACT   — AgentFirewallZK contract address
 *   VERIFIER_CONTRACT   — ObelyskVerifier contract address
 *   PROVER_API_KEY      — Bearer token for prove-server auth (optional)
 *
 * Claude Code config (.claude/settings.json):
 *   {
 *     "mcpServers": {
 *       "obelyzk-policy": {
 *         "command": "npx",
 *         "args": ["ts-node", "<path-to>/src/mcp-policy/index.ts"],
 *         "env": {
 *           "PROVER_URL": "http://localhost:8080",
 *           "STARKNET_RPC": "https://starknet-sepolia.g.alchemy.com/...",
 *           "FIREWALL_CONTRACT": "0x...",
 *           "VERIFIER_CONTRACT": "0x..."
 *         }
 *       }
 *     }
 *   }
 */
import { startPolicyServer } from "./server";

startPolicyServer().catch((err) => {
  console.error("Fatal: ObelyZK Policy MCP server failed to start:", err);
  process.exit(1);
});
