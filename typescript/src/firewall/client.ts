/**
 * AgentFirewallSDK — ZKML-powered transaction guardrails for AI agents.
 *
 * Wraps the full flow:
 *   1. Classify transaction via prove-server (/api/v1/classify)
 *   2. Submit action to AgentFirewallZK contract
 *   3. Submit ZKML proof to ObelyskVerifier (streaming or recursive)
 *   4. Resolve action with proven threat score
 *   5. Query approval status
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
 * const result = await firewall.evaluateAction({
 *   target: '0x1234...',
 *   value: '1000000000',
 *   selector: '0xa9059cbb',
 * });
 *
 * if (result.decision === 'approve') {
 *   // safe to execute
 * }
 * ```
 */

import { Account, RpcProvider, Contract, CallData } from "starknet";
import type {
  FirewallConfig,
  TransactionFeatures,
  ClassifyResult,
  AgentStatus,
  Decision,
  SubmitActionResult,
  ResolveResult,
} from "./types";

/** Policy commitment for PolicyConfig::strict() — must match Rust/Cairo. */
const STRICT_POLICY_COMMITMENT =
  "0x0370c9348ed6edddf310baf5d8104d57c07f36962deea9738dd00519d9948449";

export class AgentFirewallSDK {
  private config: FirewallConfig;
  private provider: RpcProvider;

  constructor(config: FirewallConfig) {
    this.config = config;
    this.provider = new RpcProvider({ nodeUrl: config.rpcUrl });
  }

  // ── Classification ─────────────────────────────────────────────────

  /**
   * Classify a transaction through the ZKML classifier.
   *
   * Sends the transaction features to the prove-server, which runs
   * the MLP classifier and generates a GKR+STARK proof. Returns the
   * proven threat score and decision.
   *
   * Does NOT submit anything on-chain — use `evaluateAction()` for
   * the full flow including on-chain submission.
   */
  async classify(tx: TransactionFeatures): Promise<ClassifyResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const body = {
      target: tx.target,
      value: tx.value || "0",
      selector: tx.selector || "0x0",
      calldata: tx.calldata || "0x",
      agent_trust_score: tx.agentTrustScore || 0,
      agent_strikes: tx.agentStrikes || 0,
      agent_age_blocks: tx.agentAgeBlocks || 0,
      target_verified: tx.targetVerified || false,
      target_is_proxy: tx.targetIsProxy || false,
      target_has_source: tx.targetHasSource || false,
      target_interaction_count: tx.targetInteractionCount || 0,
      tx_frequency: tx.txFrequency || 0,
      unique_targets_24h: tx.uniqueTargets24h || 0,
      avg_value_24h: tx.avgValue24h || 0,
      max_value_24h: tx.maxValue24h || 0,
    };

    const response = await fetch(`${this.config.proverUrl}/api/v1/classify`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Classification failed (${response.status}): ${(error as any).error || response.statusText}`);
    }

    const data = await response.json() as any;
    return {
      requestId: data.request_id,
      decision: data.decision as Decision,
      threatScore: data.threat_score,
      scores: data.scores,
      ioCommitment: data.io_commitment,
      policyCommitment: data.policy_commitment,
      proveTimeMs: data.prove_time_ms,
    };
  }

  // ── Agent Management ───────────────────────────────────────────────

  /**
   * Register a new agent on the firewall contract.
   * The calling account becomes the agent owner.
   */
  async registerAgent(agentId: string): Promise<string> {
    this.requireAccount();
    const tx = await this.config.account!.execute({
      contractAddress: this.config.firewallContract,
      entrypoint: "register_agent",
      calldata: CallData.compile({ agent_id: agentId }),
    });
    await this.provider.waitForTransaction(tx.transaction_hash);
    return tx.transaction_hash;
  }

  /** Deactivate an agent (owner or contract admin). */
  async deactivateAgent(agentId: string): Promise<string> {
    this.requireAccount();
    const tx = await this.config.account!.execute({
      contractAddress: this.config.firewallContract,
      entrypoint: "deactivate_agent",
      calldata: CallData.compile({ agent_id: agentId }),
    });
    await this.provider.waitForTransaction(tx.transaction_hash);
    return tx.transaction_hash;
  }

  /** Reactivate an agent and reset strikes (agent owner only). */
  async reactivateAgent(agentId: string): Promise<string> {
    this.requireAccount();
    const tx = await this.config.account!.execute({
      contractAddress: this.config.firewallContract,
      entrypoint: "reactivate_agent",
      calldata: CallData.compile({ agent_id: agentId }),
    });
    await this.provider.waitForTransaction(tx.transaction_hash);
    return tx.transaction_hash;
  }

  // ── Queries ────────────────────────────────────────────────────────

  /** Get the full status of an agent. */
  async getAgentStatus(agentId: string): Promise<AgentStatus> {
    const contract = new Contract(
      FIREWALL_ABI,
      this.config.firewallContract,
      this.provider,
    );

    const [registered, active, trustScore, strikes, trusted] =
      await Promise.all([
        contract.is_agent_registered(agentId) as Promise<boolean>,
        contract.is_agent_active(agentId) as Promise<boolean>,
        contract.get_trust_score(agentId) as Promise<bigint>,
        contract.get_strikes(agentId) as Promise<bigint>,
        contract.is_trusted(agentId) as Promise<boolean>,
      ]);

    return {
      registered,
      active,
      trustScore: Number(trustScore),
      strikes: Number(strikes),
      trusted,
    };
  }

  /** Check if a specific action has been approved. */
  async isActionApproved(actionId: number): Promise<boolean> {
    const contract = new Contract(
      FIREWALL_ABI,
      this.config.firewallContract,
      this.provider,
    );
    return contract.is_action_approved(actionId) as Promise<boolean>;
  }

  /** Check if an agent is trusted. */
  async isAgentTrusted(agentId: string): Promise<boolean> {
    const contract = new Contract(
      FIREWALL_ABI,
      this.config.firewallContract,
      this.provider,
    );
    return contract.is_trusted(agentId) as Promise<boolean>;
  }

  /** Get the decision for an action (0=pending, 1=approved, 2=escalated, 3=blocked). */
  async getActionDecision(actionId: number): Promise<number> {
    const contract = new Contract(
      FIREWALL_ABI,
      this.config.firewallContract,
      this.provider,
    );
    return Number(await contract.get_action_decision(actionId));
  }

  /** Get the threat score for a resolved action. */
  async getActionThreatScore(actionId: number): Promise<number> {
    const contract = new Contract(
      FIREWALL_ABI,
      this.config.firewallContract,
      this.provider,
    );
    return Number(await contract.get_action_threat_score(actionId));
  }

  /** Get the IO commitment for an action. */
  async getActionIoCommitment(actionId: number): Promise<string> {
    const contract = new Contract(
      FIREWALL_ABI,
      this.config.firewallContract,
      this.provider,
    );
    const result = await contract.get_action_io_commitment(actionId);
    return `0x${BigInt(result).toString(16)}`;
  }

  // ── On-Chain Actions ────────────────────────────────────────────────

  /**
   * Submit a pending action to the firewall contract.
   * Returns the action_id assigned by the contract.
   */
  async submitAction(
    agentId: string,
    target: string,
    value: string,
    selector: number,
    ioCommitment: string
  ): Promise<SubmitActionResult> {
    this.requireAccount();
    const tx = await this.config.account!.execute({
      contractAddress: this.config.firewallContract,
      entrypoint: "submit_action",
      calldata: CallData.compile({
        agent_id: agentId,
        target,
        value,
        selector,
        io_commitment: ioCommitment,
      }),
    });
    const receipt = await this.provider.waitForTransaction(tx.transaction_hash);

    // Extract action_id from ActionSubmitted event
    let actionId = 0;
    const events = (receipt as any).events;
    if (Array.isArray(events)) {
      for (const event of events) {
        if (event.data && event.data.length >= 2) {
          const candidateId = Number(BigInt(event.data[0]));
          if (candidateId > 0) {
            actionId = candidateId;
            break;
          }
        }
      }
    }

    return { actionId, txHash: tx.transaction_hash };
  }

  /**
   * Resolve a pending action with a verified ZKML proof.
   * The proof must already be verified on the ObelyskVerifier contract.
   */
  async resolveAction(
    actionId: number,
    proofHash: string,
    originalIoLen: number,
    packedRawIo: string[]
  ): Promise<ResolveResult> {
    this.requireAccount();
    const tx = await this.config.account!.execute({
      contractAddress: this.config.firewallContract,
      entrypoint: "resolve_action_with_proof",
      calldata: CallData.compile({
        action_id: actionId,
        proof_hash: proofHash,
        original_io_len: originalIoLen,
        packed_raw_io: packedRawIo,
      }),
    });
    const receipt = await this.provider.waitForTransaction(tx.transaction_hash);

    // Extract decision from ActionResolved event
    let decision: Decision = "approve";
    let threatScore = 0;
    const resolveEvents = (receipt as any).events;
    if (Array.isArray(resolveEvents)) {
      for (const event of resolveEvents) {
        if (event.data && event.data.length >= 4) {
          const decisionCode = Number(BigInt(event.data[2]));
          threatScore = Number(BigInt(event.data[3]));
          if (decisionCode === 1) decision = "approve";
          else if (decisionCode === 2) decision = "escalate";
          else if (decisionCode === 3) decision = "block";
          break;
        }
      }
    }

    return { decision, threatScore, txHash: tx.transaction_hash };
  }

  /** Approve an escalated action (human-in-the-loop). */
  async approveEscalated(actionId: number): Promise<string> {
    this.requireAccount();
    const tx = await this.config.account!.execute({
      contractAddress: this.config.firewallContract,
      entrypoint: "approve_escalated",
      calldata: CallData.compile({ action_id: actionId }),
    });
    await this.provider.waitForTransaction(tx.transaction_hash);
    return tx.transaction_hash;
  }

  /** Reject an escalated action and add a strike. */
  async rejectEscalated(actionId: number): Promise<string> {
    this.requireAccount();
    const tx = await this.config.account!.execute({
      contractAddress: this.config.firewallContract,
      entrypoint: "reject_escalated",
      calldata: CallData.compile({ action_id: actionId }),
    });
    await this.provider.waitForTransaction(tx.transaction_hash);
    return tx.transaction_hash;
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private requireAccount(): void {
    if (!this.config.account) {
      throw new Error(
        "Account required for write operations. Pass `account` in FirewallConfig."
      );
    }
  }
}

/** Minimal ABI for the AgentFirewallZK contract (view functions only). */
const FIREWALL_ABI = [
  {
    name: "is_agent_registered",
    type: "function",
    inputs: [{ name: "agent_id", type: "felt" }],
    outputs: [{ type: "felt" }],
    state_mutability: "view",
  },
  {
    name: "is_agent_active",
    type: "function",
    inputs: [{ name: "agent_id", type: "felt" }],
    outputs: [{ type: "felt" }],
    state_mutability: "view",
  },
  {
    name: "get_trust_score",
    type: "function",
    inputs: [{ name: "agent_id", type: "felt" }],
    outputs: [{ type: "felt" }],
    state_mutability: "view",
  },
  {
    name: "get_strikes",
    type: "function",
    inputs: [{ name: "agent_id", type: "felt" }],
    outputs: [{ type: "felt" }],
    state_mutability: "view",
  },
  {
    name: "is_trusted",
    type: "function",
    inputs: [{ name: "agent_id", type: "felt" }],
    outputs: [{ type: "felt" }],
    state_mutability: "view",
  },
  {
    name: "is_action_approved",
    type: "function",
    inputs: [{ name: "action_id", type: "felt" }],
    outputs: [{ type: "felt" }],
    state_mutability: "view",
  },
  {
    name: "get_action_decision",
    type: "function",
    inputs: [{ name: "action_id", type: "felt" }],
    outputs: [{ type: "felt" }],
    state_mutability: "view",
  },
  {
    name: "get_action_threat_score",
    type: "function",
    inputs: [{ name: "action_id", type: "felt" }],
    outputs: [{ type: "felt" }],
    state_mutability: "view",
  },
  {
    name: "get_action_io_commitment",
    type: "function",
    inputs: [{ name: "action_id", type: "felt" }],
    outputs: [{ type: "felt" }],
    state_mutability: "view",
  },
] as const;
