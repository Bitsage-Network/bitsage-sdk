/**
 * ZKML Agent Firewall SDK
 *
 * Verifiable AI guardrails for autonomous agent transactions.
 * Replaces LLM-based oracles with ZKML-proven classifier inference.
 *
 * @example
 * ```typescript
 * import { AgentFirewallSDK } from '@obelyzk/sdk/firewall';
 *
 * const firewall = new AgentFirewallSDK({
 *   proverUrl: 'https://prover.bitsage.network',
 *   firewallContract: '0x...',
 *   verifierContract: '0x...',
 *   rpcUrl: process.env.STARKNET_RPC!,
 *   account: myAccount,
 * });
 *
 * // Classify a transaction (prove + score)
 * const result = await firewall.classify({
 *   target: '0x1234...',
 *   value: '1000000000',
 *   selector: '0xa9059cbb',
 * });
 * console.log(result.decision);      // "approve" | "escalate" | "block"
 * console.log(result.threatScore);    // 0-100000
 * console.log(result.ioCommitment);   // for on-chain submission
 *
 * // Register an agent
 * await firewall.registerAgent('my-agent-001');
 *
 * // Check trust status
 * const status = await firewall.getAgentStatus('my-agent-001');
 * console.log(status.trusted);        // true
 * console.log(status.trustScore);     // 0
 * console.log(status.strikes);        // 0
 * ```
 *
 * @packageDocumentation
 */

export { AgentFirewallSDK } from "./client";
export type {
  FirewallConfig,
  TransactionFeatures,
  ClassifyResult,
  AgentStatus,
  Decision,
  SubmitActionResult,
  ResolveResult,
} from "./types";
