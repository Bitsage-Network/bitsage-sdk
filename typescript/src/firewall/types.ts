/**
 * Types for the ZKML Agent Firewall SDK.
 *
 * These types map 1:1 to the Rust classifier and Cairo AgentFirewallZK contract.
 */

/** Transaction features sent to the classifier. */
export interface TransactionFeatures {
  /** Target contract address (hex, 0x-prefixed). */
  target: string;
  /** Transaction value (decimal string, u256). */
  value?: string;
  /** Function selector (hex, 4 bytes, 0x-prefixed). */
  selector?: string;
  /** Calldata (hex, after selector, 0x-prefixed). */
  calldata?: string;
  /** Agent's current trust score (0-100000). */
  agentTrustScore?: number;
  /** Agent's current strike count. */
  agentStrikes?: number;
  /** Agent age in blocks since registration. */
  agentAgeBlocks?: number;
  /** Target contract metadata. */
  targetVerified?: boolean;
  targetIsProxy?: boolean;
  targetHasSource?: boolean;
  targetInteractionCount?: number;
  /** Behavioral features. */
  txFrequency?: number;
  uniqueTargets24h?: number;
  avgValue24h?: number;
  maxValue24h?: number;
}

/** Classifier decision. */
export type Decision = "approve" | "escalate" | "block";

/** Result from evaluating a transaction through the ZKML classifier. */
export interface ClassifyResult {
  /** Unique request ID. */
  requestId: string;
  /** Classifier decision. */
  decision: Decision;
  /** Threat score (0-100000). */
  threatScore: number;
  /** Raw output scores: [safe, suspicious, malicious]. */
  scores: [number, number, number];
  /** IO commitment (Poseidon hash of classifier input + output). */
  ioCommitment: string;
  /** Policy commitment (strict policy hash). */
  policyCommitment: string;
  /** Proving time in milliseconds. */
  proveTimeMs: number;
}

/** Result from submitting an action to the firewall contract. */
export interface SubmitActionResult {
  /** Action ID assigned by the contract. */
  actionId: number;
  /** Transaction hash. */
  txHash: string;
}

/** Result from resolving an action with a verified proof. */
export interface ResolveResult {
  /** Final decision after proof verification. */
  decision: Decision;
  /** Threat score applied to the agent. */
  threatScore: number;
  /** Transaction hash. */
  txHash: string;
}

/** Agent trust status. */
export interface AgentStatus {
  /** Whether the agent is registered. */
  registered: boolean;
  /** Whether the agent is active (not frozen). */
  active: boolean;
  /** Current trust score (0-100000, EMA smoothed). */
  trustScore: number;
  /** Current strike count. */
  strikes: number;
  /** Whether the agent is trusted (active + score < threshold + strikes < max). */
  trusted: boolean;
}

/** Firewall SDK configuration. */
export interface FirewallConfig {
  /** Prover server URL (for /api/v1/classify). */
  proverUrl: string;
  /** AgentFirewallZK contract address on Starknet. */
  firewallContract: string;
  /** ObelyskVerifier contract address on Starknet. */
  verifierContract: string;
  /** Starknet RPC URL. */
  rpcUrl: string;
  /** Starknet account for signing transactions. */
  account?: import("starknet").Account;
  /** API key for the prover server (optional). */
  apiKey?: string;
}
