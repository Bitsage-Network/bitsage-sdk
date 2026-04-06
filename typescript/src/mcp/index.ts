#!/usr/bin/env node
/**
 * Obelysk Protocol MCP Server — Entry Point
 *
 * Starts the Model Context Protocol server over stdio transport.
 * AI assistants (Claude, Cursor, etc.) connect to this process to
 * interact with the Obelysk protocol on Starknet mainnet.
 *
 * Environment variables:
 *   STARKNET_RPC        — Starknet JSON-RPC URL (default: Alchemy mainnet)
 *   VM31_RELAYER_URL     — VM31 relayer endpoint (default: http://35.163.191.22:3080)
 *   DEPLOYER_PRIVKEY     — Private key for write operations (optional, read-only without it)
 *   DEPLOYER_ADDRESS     — Starknet account address for write operations (optional)
 *
 * Usage:
 *   npx ts-node src/mcp/index.ts
 *
 * Claude Desktop config (~/.claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "obelysk": {
 *         "command": "npx",
 *         "args": ["ts-node", "<path-to>/src/mcp/index.ts"],
 *         "env": {
 *           "STARKNET_RPC": "https://starknet-mainnet.g.alchemy.com/..."
 *         }
 *       }
 *     }
 *   }
 */
import { startServer } from './server';

startServer().catch((err) => {
  console.error('Fatal: Obelysk MCP server failed to start:', err);
  process.exit(1);
});
