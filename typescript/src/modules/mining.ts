/**
 * Mining Rewards Module
 * Interacts with the MiningRewards contract for per-job rewards
 */

import { HttpClient } from '../transport/http-client';
import { ContractClient, toFelt, fromFelt } from '../transport/contract-client';
import type { TransactionResult } from '../types/generated/payments';
import type {
  StakeTier,
  MiningGpuTier,
  WorkerMiningStats,
  MiningPoolStatus,
  RewardResult,
  MiningConfig,
  DailyStats,
} from '../types/generated/mining';
import {
  DAILY_CAPS,
  GPU_MULTIPLIERS,
  HALVENING_SCHEDULE,
  getStakeTierFromAmount,
} from '../types/generated/mining';

export interface MiningClientConfig {
  /** Mining rewards contract address */
  contractAddress: string;
}

/**
 * Mining Rewards Client
 *
 * Provides access to the mining rewards system including:
 * - Per-job reward estimation
 * - Worker mining statistics
 * - Mining pool status and halvening
 * - Daily caps by stake tier
 *
 * @example
 * ```typescript
 * const mining = new MiningClient(httpClient, contractClient, { contractAddress: '0x...' });
 *
 * // Estimate reward for a job
 * const estimate = await mining.getMiningRewardEstimate('Frontier');
 * console.log(`Expected reward: ${estimate.amount / 10n**18n} SAGE`);
 *
 * // Check worker stats
 * const stats = await mining.getWorkerMiningStats('worker-123');
 * console.log(`Total earned: ${stats.total_earned} SAGE`);
 * ```
 */
export class MiningClient {
  private http: HttpClient;
  private contract: ContractClient;
  private config: MiningClientConfig;

  constructor(
    http: HttpClient,
    contract: ContractClient,
    config: MiningClientConfig
  ) {
    this.http = http;
    this.contract = contract;
    this.config = config;
  }

  // =========================================================================
  // Read Operations (via API)
  // =========================================================================

  /**
   * Estimate mining reward for a job completion
   *
   * @param gpuTier - GPU tier of the worker
   * @param workerAddress - Optional worker address for accurate daily cap
   * @returns Estimated reward with cap status
   */
  async getMiningRewardEstimate(
    gpuTier: MiningGpuTier,
    workerAddress?: string
  ): Promise<RewardResult> {
    const params: Record<string, string> = { gpu_tier: gpuTier };
    if (workerAddress) {
      params.worker = workerAddress;
    }

    return this.http.get<RewardResult>('/api/mining/estimate', params);
  }

  /**
   * Get worker's mining statistics
   *
   * @param workerId - Worker identifier
   * @returns Lifetime mining statistics
   */
  async getWorkerMiningStats(workerId: string): Promise<WorkerMiningStats> {
    return this.http.get<WorkerMiningStats>(`/api/mining/stats/${workerId}`);
  }

  /**
   * Get mining pool status
   *
   * @returns Current pool status including distributed amount and halvening
   */
  async getMiningPoolStatus(): Promise<MiningPoolStatus> {
    return this.http.get<MiningPoolStatus>('/api/mining/pool');
  }

  /**
   * Get daily cap for a stake tier
   *
   * @param stakeTier - Stake tier
   * @returns Daily cap in wei
   */
  async getDailyCap(stakeTier: StakeTier): Promise<bigint> {
    // Can use local constant or fetch from contract
    return DAILY_CAPS[stakeTier];
  }

  /**
   * Get current base reward (with halvening applied)
   *
   * @returns Base reward per job in wei
   */
  async getCurrentBaseReward(): Promise<bigint> {
    const poolStatus = await this.getMiningPoolStatus();
    return poolStatus.current_base_reward;
  }

  /**
   * Get GPU multiplier for a tier
   *
   * @param gpuTier - GPU tier
   * @returns Multiplier in basis points (10000 = 1.0x)
   */
  getGPUMultiplier(gpuTier: MiningGpuTier): number {
    return GPU_MULTIPLIERS[gpuTier];
  }

  /**
   * Get remaining daily cap for a worker
   *
   * @param workerAddress - Worker address
   * @returns Remaining cap in wei
   */
  async getRemainingDailyCap(workerAddress: string): Promise<bigint> {
    const response = await this.http.get<{ remaining_cap: string }>(
      `/api/mining/cap/${workerAddress}`
    );
    return BigInt(response.remaining_cap);
  }

  /**
   * Get mining configuration
   *
   * @returns Full mining configuration
   */
  async getMiningConfig(): Promise<MiningConfig> {
    return this.http.get<MiningConfig>('/api/mining/config');
  }

  /**
   * Get worker's daily statistics for a specific day
   *
   * @param workerId - Worker identifier
   * @param day - Day number (optional, defaults to today)
   * @returns Daily statistics
   */
  async getWorkerDailyStats(workerId: string, day?: number): Promise<DailyStats> {
    const params = day !== undefined ? { day: day.toString() } : undefined;
    return this.http.get<DailyStats>(`/api/mining/stats/${workerId}/daily`, params);
  }

  /**
   * Get total distributed from mining pool
   *
   * @returns Total distributed in wei
   */
  async getTotalDistributed(): Promise<bigint> {
    const poolStatus = await this.getMiningPoolStatus();
    return poolStatus.total_distributed;
  }

  /**
   * Get remaining in mining pool
   *
   * @returns Remaining pool in wei
   */
  async getRemainingPool(): Promise<bigint> {
    const poolStatus = await this.getMiningPoolStatus();
    return poolStatus.remaining_pool;
  }

  /**
   * Get current halvening year and multiplier
   *
   * @returns Halvening info
   */
  async getHalveningInfo(): Promise<{ year: number; multiplier: number }> {
    const poolStatus = await this.getMiningPoolStatus();
    return {
      year: poolStatus.current_year,
      multiplier: poolStatus.halvening_multiplier,
    };
  }

  /**
   * Calculate expected reward locally (without API call)
   *
   * @param gpuTier - GPU tier
   * @param stakeTier - Stake tier
   * @param baseReward - Base reward (optional, uses Year 1 default)
   * @param halveningYear - Halvening year (optional, defaults to 1)
   * @returns Calculated reward
   */
  calculateRewardLocally(
    gpuTier: MiningGpuTier,
    stakeTier: StakeTier,
    baseReward: bigint = 2n * 10n ** 18n, // 2 SAGE default
    halveningYear: number = 1
  ): bigint {
    // Get halvening multiplier
    const halveningMultiplier = HALVENING_SCHEDULE[halveningYear as keyof typeof HALVENING_SCHEDULE] || 2500;

    // Get GPU multiplier
    const gpuMultiplier = GPU_MULTIPLIERS[gpuTier];

    // Calculate reward
    // reward = baseReward * halveningMultiplier / 10000 * gpuMultiplier / 10000
    const reward = (baseReward * BigInt(halveningMultiplier) * BigInt(gpuMultiplier)) / (10000n * 10000n);

    // Get daily cap
    const dailyCap = DAILY_CAPS[stakeTier];

    // Return capped reward
    return reward > dailyCap ? dailyCap : reward;
  }

  // =========================================================================
  // Write Operations (via Contract)
  // =========================================================================

  /**
   * Record job completion and distribute mining reward
   * Note: This is typically called by the coordinator, not directly by workers
   *
   * @param jobId - Completed job ID
   * @param gpuTier - Worker's GPU tier
   * @returns Transaction result
   */
  async recordJobCompletion(
    jobId: string,
    gpuTier: MiningGpuTier
  ): Promise<TransactionResult> {
    // Convert GPU tier to contract enum value
    const gpuTierValue = this.gpuTierToContractValue(gpuTier);

    return this.contract.invokeAndWait(
      this.config.contractAddress,
      'record_job_completion',
      [toFelt(jobId), toFelt(gpuTierValue)]
    );
  }

  // =========================================================================
  // Contract Read Operations
  // =========================================================================

  /**
   * Get worker stats directly from contract
   *
   * @param workerAddress - Worker address
   * @returns Worker mining stats
   */
  async getWorkerMiningStatsFromContract(workerAddress: string): Promise<WorkerMiningStats> {
    const result = await this.contract.call(
      this.config.contractAddress,
      'get_worker_stats',
      [workerAddress]
    );

    // Parse contract response
    return this.parseWorkerStatsResponse(result);
  }

  /**
   * Get remaining cap from contract
   *
   * @param workerAddress - Worker address
   * @returns Remaining cap in wei
   */
  async getRemainingCapFromContract(workerAddress: string): Promise<bigint> {
    const result = await this.contract.call(
      this.config.contractAddress,
      'get_remaining_cap',
      [workerAddress]
    );

    return fromFelt(result[0]);
  }

  /**
   * Get stake tier from contract
   *
   * @param workerAddress - Worker address
   * @returns Stake tier
   */
  async getStakeTierFromContract(workerAddress: string): Promise<StakeTier> {
    const result = await this.contract.call(
      this.config.contractAddress,
      'get_stake_tier',
      [workerAddress]
    );

    return this.contractValueToStakeTier(Number(fromFelt(result[0])));
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /**
   * Convert GPU tier to contract enum value
   */
  private gpuTierToContractValue(tier: MiningGpuTier): number {
    const mapping: Record<MiningGpuTier, number> = {
      Consumer: 0,
      Workstation: 1,
      DataCenter: 2,
      Enterprise: 3,
      Frontier: 4,
    };
    return mapping[tier];
  }

  /**
   * Convert contract value to stake tier
   */
  private contractValueToStakeTier(value: number): StakeTier {
    const mapping: Record<number, StakeTier> = {
      0: 'None',
      1: 'Bronze',
      2: 'Silver',
      3: 'Gold',
      4: 'Platinum',
    };
    return mapping[value] || 'None';
  }

  /**
   * Parse worker stats response from contract
   */
  private parseWorkerStatsResponse(result: string[]): WorkerMiningStats {
    // Contract returns: total_jobs, total_earned_low, total_earned_high, first_job_at, last_job_at
    return {
      total_jobs: fromFelt(result[0]),
      total_earned: fromFelt(result[1]) + (fromFelt(result[2]) << 128n),
      daily_stats: [], // Would need separate call for daily stats
      first_job_at: Number(fromFelt(result[3])),
      last_job_at: Number(fromFelt(result[4])),
    };
  }
}

/**
 * Create a MiningClient instance
 */
export function createMiningClient(
  http: HttpClient,
  contract: ContractClient,
  contractAddress: string
): MiningClient {
  return new MiningClient(http, contract, { contractAddress });
}
