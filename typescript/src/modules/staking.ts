/**
 * Enhanced Staking Module
 * Full staking system with TEE support, slashing, and worker tiers
 */

import { HttpClient } from '../transport/http-client';
import { ContractClient, toFelt } from '../transport/contract-client';
import type { TransactionReceipt } from '../transport/contract-client';
import type {
  GpuTier,
  WorkerTier,
  HolderTier,
  SlashReason,
  WorkerStake,
  StakeInfo,
  StakingConfig,
  SlashRecord,
  DisputeRecord,
  WorkerTierBenefits,
  UnstakeRequest,
} from '../types/generated/staking';
import {
  MIN_STAKE,
  SLASH_PERCENTAGES,
  UNSTAKE_LOCKUP_SECS,
  isWorkerEligible,
  getMinStakeForTier,
} from '../types/generated/staking';

export interface StakingClientConfig {
  /** Prover staking contract address */
  proverStakingAddress: string;
  /** CDC Pool contract address */
  cdcPoolAddress: string;
}

/** Transaction result */
export interface TransactionResult {
  transaction_hash: string;
  status: 'pending' | 'accepted' | 'rejected';
  receipt?: TransactionReceipt;
}

/** TEE type for enhanced staking */
export type TeeType = 'IntelTDX' | 'AMDSEVSNP' | 'NvidiaCC';

/**
 * Enhanced Staking Client
 *
 * Full staking system including:
 * - Basic staking operations (stake, unstake, claim)
 * - TEE-enhanced staking with bonus rewards
 * - 8-level worker tier system
 * - Slashing and dispute mechanisms
 * - Delegation support
 *
 * @example
 * ```typescript
 * const staking = new StakingClient(httpClient, contractClient, config);
 *
 * // Stake with TEE support
 * await staking.stakeWithTEE(5000n * 10n**18n, 'DataCenter', true, 'NvidiaCC');
 *
 * // Check worker tier and benefits
 * const tier = await staking.getWorkerTier(workerAddress);
 * const benefits = await staking.getWorkerTierBenefits(tier);
 * console.log(`Tier: ${tier}, Job multiplier: ${benefits.job_multiplier_bps/100}%`);
 *
 * // Claim rewards
 * await staking.claimRewards();
 * ```
 */
export class StakingClient {
  private http: HttpClient;
  private contract: ContractClient;
  private config: StakingClientConfig;

  constructor(
    http: HttpClient,
    contract: ContractClient,
    config: StakingClientConfig
  ) {
    this.http = http;
    this.contract = contract;
    this.config = config;
  }

  // =========================================================================
  // Core Staking Operations
  // =========================================================================

  /**
   * Stake SAGE tokens
   *
   * @param amount - Amount to stake (wei)
   * @param gpuTier - GPU tier classification
   * @returns Transaction result
   */
  async stake(amount: bigint, gpuTier: GpuTier): Promise<TransactionResult> {
    const minRequired = getMinStakeForTier(gpuTier);
    if (amount < minRequired) {
      throw new Error(`Minimum stake for ${gpuTier} is ${minRequired / 10n ** 18n} SAGE`);
    }

    return this.contract.invokeAndWait(
      this.config.proverStakingAddress,
      'stake',
      [toFelt(amount), this.gpuTierToFelt(gpuTier)]
    );
  }

  /**
   * Stake with TEE support for bonus rewards
   *
   * @param amount - Amount to stake (wei)
   * @param gpuTier - GPU tier classification
   * @param hasTEE - Whether worker has TEE support
   * @param teeType - Type of TEE if hasTEE is true
   * @returns Transaction result
   */
  async stakeWithTEE(
    amount: bigint,
    gpuTier: GpuTier,
    hasTEE: boolean,
    teeType?: TeeType
  ): Promise<TransactionResult> {
    const minRequired = this.getMinStakeForTierWithTEE(gpuTier, hasTEE);
    if (amount < minRequired) {
      throw new Error(`Minimum stake for ${gpuTier} ${hasTEE ? 'with TEE' : ''} is ${minRequired / 10n ** 18n} SAGE`);
    }

    const teeTypeFelt = hasTEE && teeType ? this.teeTypeToFelt(teeType) : '0';

    return this.contract.invokeAndWait(
      this.config.proverStakingAddress,
      'stake_with_tee',
      [toFelt(amount), this.gpuTierToFelt(gpuTier), hasTEE ? '1' : '0', teeTypeFelt]
    );
  }

  /**
   * Request to unstake tokens (enters lockup period)
   *
   * @param amount - Amount to unstake (wei)
   * @returns Transaction result with unstake request ID
   */
  async requestUnstake(amount: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.proverStakingAddress,
      'request_unstake',
      [toFelt(amount)]
    );
  }

  /**
   * Complete unstake after lockup period
   *
   * @param requestId - Unstake request ID
   * @returns Transaction result
   */
  async completeUnstake(requestId: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.proverStakingAddress,
      'complete_unstake',
      [toFelt(requestId)]
    );
  }

  /**
   * Cancel pending unstake request
   *
   * @param requestId - Unstake request ID
   * @returns Transaction result
   */
  async cancelUnstake(requestId: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.proverStakingAddress,
      'cancel_unstake',
      [toFelt(requestId)]
    );
  }

  /**
   * Claim pending staking rewards
   *
   * @returns Transaction result
   */
  async claimRewards(): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.proverStakingAddress,
      'claim_rewards',
      []
    );
  }

  // =========================================================================
  // Read Operations
  // =========================================================================

  /**
   * Get stake info for an address
   *
   * @param address - Worker address
   * @returns Complete stake information
   */
  async getStakeInfo(address: string): Promise<StakeInfo> {
    const response = await this.http.get<{
      stake: {
        amount: string;
        locked_amount: string;
        staked_at: number;
        last_claim_at: number;
        gpu_tier: string;
        is_active: boolean;
        consecutive_failures: number;
        total_successes: string;
        total_slashed: string;
        has_tee: boolean;
        tee_type?: string;
      };
      pending_rewards: string;
      total_rewards_claimed: string;
      estimated_apy_bps: number;
      worker_tier: string;
      holder_tier: string;
      locked_until?: number;
      is_eligible: boolean;
    }>(`/api/staking/info/${address}`);

    return {
      stake: {
        amount: BigInt(response.stake.amount),
        locked_amount: BigInt(response.stake.locked_amount),
        staked_at: response.stake.staked_at,
        last_claim_at: response.stake.last_claim_at,
        gpu_tier: response.stake.gpu_tier as GpuTier,
        is_active: response.stake.is_active,
        consecutive_failures: response.stake.consecutive_failures,
        total_successes: BigInt(response.stake.total_successes),
        total_slashed: BigInt(response.stake.total_slashed),
        has_tee: response.stake.has_tee,
        tee_type: response.stake.tee_type as TeeType | undefined,
      },
      pending_rewards: BigInt(response.pending_rewards),
      total_rewards_claimed: BigInt(response.total_rewards_claimed),
      estimated_apy_bps: response.estimated_apy_bps,
      worker_tier: response.worker_tier as WorkerTier,
      holder_tier: response.holder_tier as HolderTier,
      locked_until: response.locked_until,
      is_eligible: response.is_eligible,
    };
  }

  /**
   * Get minimum stake for GPU tier with optional TEE
   *
   * @param gpuTier - GPU tier
   * @param hasTEE - Whether has TEE support
   * @param reputationScore - Optional reputation score (0-100)
   * @returns Minimum stake amount (wei)
   */
  getMinStake(gpuTier: GpuTier, hasTEE: boolean = false, reputationScore: number = 50): bigint {
    const base = getMinStakeForTier(gpuTier);

    // TEE reduces minimum stake by 10%
    const teeMultiplier = hasTEE ? 90n : 100n;

    // High reputation (>80) reduces by 5%, low (<30) increases by 10%
    let reputationMultiplier = 100n;
    if (reputationScore > 80) {
      reputationMultiplier = 95n;
    } else if (reputationScore < 30) {
      reputationMultiplier = 110n;
    }

    return (base * teeMultiplier * reputationMultiplier) / 10000n;
  }

  /**
   * Get minimum stake for tier with TEE (private helper)
   */
  private getMinStakeForTierWithTEE(gpuTier: GpuTier, hasTEE: boolean): bigint {
    const base = getMinStakeForTier(gpuTier);
    return hasTEE ? (base * 90n) / 100n : base;
  }

  /**
   * Get worker's current tier
   *
   * @param workerAddress - Worker address
   * @returns Worker tier
   */
  async getWorkerTier(workerAddress: string): Promise<WorkerTier> {
    const response = await this.http.get<{ tier: string }>(
      `/api/staking/worker-tier/${workerAddress}`
    );
    return response.tier as WorkerTier;
  }

  /**
   * Get benefits for a worker tier
   *
   * @param tier - Worker tier
   * @returns Tier benefits
   */
  async getWorkerTierBenefits(tier: WorkerTier): Promise<WorkerTierBenefits> {
    return this.http.get<WorkerTierBenefits>(`/api/staking/tier-benefits/${tier}`);
  }

  /**
   * Get pending unstake requests for an address
   *
   * @param address - Worker address
   * @returns Array of unstake requests
   */
  async getUnstakeRequests(address: string): Promise<UnstakeRequest[]> {
    const response = await this.http.get<Array<{
      request_id: string;
      worker: string;
      amount: string;
      requested_at: number;
      available_at: number;
      status: string;
    }>>(`/api/staking/unstake-requests/${address}`);

    return response.map(req => ({
      request_id: BigInt(req.request_id),
      worker: req.worker,
      amount: BigInt(req.amount),
      requested_at: req.requested_at,
      available_at: req.available_at,
      status: req.status as UnstakeRequest['status'],
    }));
  }

  // =========================================================================
  // Slashing Operations
  // =========================================================================

  /**
   * Slash a worker (governance/protocol only)
   *
   * @param worker - Worker address to slash
   * @param percentage - Slash percentage (basis points)
   * @param reason - Slash reason
   * @param jobId - Related job ID if applicable
   * @param evidenceHash - Hash of evidence
   * @returns Transaction result
   */
  async slash(
    worker: string,
    percentage: number,
    reason: SlashReason,
    jobId?: bigint,
    evidenceHash?: bigint
  ): Promise<TransactionResult> {
    const maxPercentage = SLASH_PERCENTAGES[reason];
    if (percentage > maxPercentage) {
      throw new Error(`Maximum slash for ${reason} is ${maxPercentage / 100}%`);
    }

    return this.contract.invokeAndWait(
      this.config.proverStakingAddress,
      'slash_worker',
      [
        worker,
        toFelt(percentage),
        this.slashReasonToFelt(reason),
        jobId ? toFelt(jobId) : '0',
        evidenceHash ? toFelt(evidenceHash) : '0',
      ]
    );
  }

  /**
   * Challenge a slash (stake bond to dispute)
   *
   * @param slashId - Slash ID to challenge
   * @param evidence - Evidence supporting the challenge
   * @returns Transaction result with dispute ID
   */
  async challengeSlash(slashId: bigint, evidence: string[]): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.proverStakingAddress,
      'challenge_slash',
      [toFelt(slashId), ...evidence]
    );
  }

  /**
   * Resolve a slash challenge (governance only)
   *
   * @param disputeId - Dispute ID
   * @param upheld - Whether the original slash is upheld
   * @param reason - Resolution reason
   * @returns Transaction result
   */
  async resolveSlashChallenge(
    disputeId: bigint,
    upheld: boolean,
    reason: string
  ): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.proverStakingAddress,
      'resolve_slash_challenge',
      [toFelt(disputeId), upheld ? '1' : '0', reason]
    );
  }

  /**
   * Get slash record
   *
   * @param slashId - Slash ID
   * @returns Slash record details
   */
  async getSlashRecord(slashId: bigint): Promise<SlashRecord> {
    const response = await this.http.get<{
      slash_id: string;
      worker: string;
      reason: string;
      amount: string;
      percentage_bps: number;
      job_id?: string;
      challenger?: string;
      slashed_at: number;
      evidence_hash?: string;
      is_disputed: boolean;
      dispute_id?: string;
    }>(`/api/staking/slash/${slashId}`);

    return {
      slash_id: BigInt(response.slash_id),
      worker: response.worker,
      reason: response.reason as SlashReason,
      amount: BigInt(response.amount),
      percentage_bps: response.percentage_bps,
      job_id: response.job_id ? BigInt(response.job_id) : undefined,
      challenger: response.challenger,
      slashed_at: response.slashed_at,
      evidence_hash: response.evidence_hash ? BigInt(response.evidence_hash) : undefined,
      is_disputed: response.is_disputed,
      dispute_id: response.dispute_id ? BigInt(response.dispute_id) : undefined,
    };
  }

  /**
   * Get dispute record
   *
   * @param disputeId - Dispute ID
   * @returns Dispute record details
   */
  async getDisputeRecord(disputeId: bigint): Promise<DisputeRecord> {
    const response = await this.http.get<{
      dispute_id: string;
      slash_id: string;
      challenger: string;
      bond_amount: string;
      evidence_hash: string;
      status: string;
      submitted_at: number;
      resolved_at?: number;
      resolution_reason?: string;
      slash_upheld?: boolean;
    }>(`/api/staking/dispute/${disputeId}`);

    return {
      dispute_id: BigInt(response.dispute_id),
      slash_id: BigInt(response.slash_id),
      challenger: response.challenger,
      bond_amount: BigInt(response.bond_amount),
      evidence_hash: BigInt(response.evidence_hash),
      status: response.status as DisputeRecord['status'],
      submitted_at: response.submitted_at,
      resolved_at: response.resolved_at,
      resolution_reason: response.resolution_reason,
      slash_upheld: response.slash_upheld,
    };
  }

  // =========================================================================
  // Configuration & Statistics
  // =========================================================================

  /**
   * Get staking configuration
   *
   * @returns Staking config
   */
  async getStakingConfig(): Promise<StakingConfig> {
    return this.http.get<StakingConfig>('/api/staking/config');
  }

  /**
   * Get total staked amount
   *
   * @returns Total staked (wei)
   */
  async getTotalStaked(): Promise<bigint> {
    const response = await this.http.get<{ total: string }>('/api/staking/total');
    return BigInt(response.total);
  }

  /**
   * Get total slashed amount
   *
   * @returns Total slashed (wei)
   */
  async getTotalSlashed(): Promise<bigint> {
    const response = await this.http.get<{ total: string }>('/api/staking/total-slashed');
    return BigInt(response.total);
  }

  /**
   * Get staking leaderboard
   *
   * @param limit - Number of entries
   * @returns Leaderboard entries
   */
  async getStakingLeaderboard(limit: number = 100): Promise<Array<{
    rank: number;
    worker: string;
    staked: bigint;
    tier: WorkerTier;
    apy_bps: number;
  }>> {
    const response = await this.http.get<Array<{
      rank: number;
      worker: string;
      staked: string;
      tier: string;
      apy_bps: number;
    }>>(`/api/staking/leaderboard?limit=${limit}`);

    return response.map(entry => ({
      rank: entry.rank,
      worker: entry.worker,
      staked: BigInt(entry.staked),
      tier: entry.tier as WorkerTier,
      apy_bps: entry.apy_bps,
    }));
  }

  // =========================================================================
  // Delegation
  // =========================================================================

  /**
   * Delegate stake to a worker
   *
   * @param worker - Worker to delegate to
   * @param amount - Amount to delegate (wei)
   * @returns Transaction result
   */
  async delegateStake(worker: string, amount: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.cdcPoolAddress,
      'delegate_stake',
      [worker, toFelt(amount)]
    );
  }

  /**
   * Undelegate stake from a worker
   *
   * @param worker - Worker to undelegate from
   * @param amount - Amount to undelegate (wei)
   * @returns Transaction result
   */
  async undelegateStake(worker: string, amount: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.cdcPoolAddress,
      'undelegate_stake',
      [worker, toFelt(amount)]
    );
  }

  /**
   * Get delegation info
   *
   * @param delegator - Delegator address
   * @returns Delegation info
   */
  async getDelegationInfo(delegator: string): Promise<Array<{
    worker: string;
    amount: bigint;
    rewards_share_bps: number;
    delegated_at: number;
  }>> {
    const response = await this.http.get<Array<{
      worker: string;
      amount: string;
      rewards_share_bps: number;
      delegated_at: number;
    }>>(`/api/staking/delegations/${delegator}`);

    return response.map(d => ({
      worker: d.worker,
      amount: BigInt(d.amount),
      rewards_share_bps: d.rewards_share_bps,
      delegated_at: d.delegated_at,
    }));
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Check if worker is eligible for jobs
   *
   * @param stake - Worker stake info
   * @returns Whether worker is eligible
   */
  static isEligible(stake: WorkerStake): boolean {
    return isWorkerEligible(stake);
  }

  /**
   * Get lockup end timestamp
   *
   * @param requestedAt - When unstake was requested
   * @returns Timestamp when unstake becomes available
   */
  static getLockupEndTimestamp(requestedAt: number): number {
    return requestedAt + UNSTAKE_LOCKUP_SECS;
  }

  /**
   * Calculate expected slash amount
   *
   * @param stakeAmount - Current stake (wei)
   * @param reason - Slash reason
   * @returns Expected slash amount (wei)
   */
  static calculateSlashAmount(stakeAmount: bigint, reason: SlashReason): bigint {
    const bps = SLASH_PERCENTAGES[reason];
    return (stakeAmount * BigInt(bps)) / 10000n;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private gpuTierToFelt(tier: GpuTier): string {
    const mapping: Record<GpuTier, string> = {
      Consumer: '0',
      Workstation: '1',
      DataCenter: '2',
      Enterprise: '3',
      Frontier: '4',
    };
    return mapping[tier];
  }

  private teeTypeToFelt(tee: TeeType): string {
    const mapping: Record<TeeType, string> = {
      IntelTDX: '1',
      AMDSEVSNP: '2',
      NvidiaCC: '3',
    };
    return mapping[tee];
  }

  private slashReasonToFelt(reason: SlashReason): string {
    const mapping: Record<SlashReason, string> = {
      InvalidProof: '0',
      Timeout: '1',
      RepeatedFailures: '2',
      Malicious: '3',
      BenchmarkFraud: '4',
      ProtocolViolation: '5',
      Unavailable: '6',
      PoorPerformance: '7',
      Fraud: '8',
    };
    return mapping[reason];
  }
}

/**
 * Create a StakingClient instance
 */
export function createStakingClient(
  http: HttpClient,
  contract: ContractClient,
  proverStakingAddress: string,
  cdcPoolAddress: string
): StakingClient {
  return new StakingClient(http, contract, {
    proverStakingAddress,
    cdcPoolAddress,
  });
}

// Re-export types and constants
export type {
  GpuTier,
  WorkerTier,
  HolderTier,
  SlashReason,
  WorkerStake,
  StakeInfo,
  StakingConfig,
  SlashRecord,
  DisputeRecord,
  WorkerTierBenefits,
  UnstakeRequest,
};

export {
  MIN_STAKE,
  SLASH_PERCENTAGES,
  UNSTAKE_LOCKUP_SECS,
  isWorkerEligible,
  getMinStakeForTier,
};
