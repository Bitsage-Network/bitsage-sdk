/**
 * Dashboard API Module
 * Provides validator metrics, GPU stats, and network information
 */

import { HttpClient } from '../transport/http-client';
import type { ContractRegistry } from '../contracts/registry';
import type { GpuTier } from '../types/generated/staking';
import type { StakeTier } from '../types/generated/mining';

/** Validator registration status */
export type ValidatorStatus = 'unregistered' | 'pending' | 'active' | 'suspended' | 'exiting';

/** Validator status response */
export interface ValidatorStatusResponse {
  /** Wallet address */
  address: string;
  /** Worker ID (if registered) */
  worker_id?: string;
  /** Registration status */
  status: ValidatorStatus;
  /** GPU tier */
  gpu_tier?: GpuTier;
  /** Stake tier */
  stake_tier?: StakeTier;
  /** Reputation score (0-1000) */
  reputation_score: number;
  /** Uptime percentage (basis points) */
  uptime_bps: number;
  /** Total jobs completed */
  jobs_completed: number;
  /** Jobs in progress */
  jobs_in_progress: number;
  /** Registration timestamp */
  registered_at?: number;
  /** Last activity timestamp */
  last_activity_at?: number;
}

/** Individual GPU metrics */
export interface GpuMetrics {
  /** GPU index */
  index: number;
  /** GPU model name */
  model: string;
  /** GPU tier classification */
  tier: GpuTier;
  /** Total VRAM in GB */
  vram_total_gb: number;
  /** Used VRAM in GB */
  vram_used_gb: number;
  /** VRAM utilization percentage */
  vram_utilization: number;
  /** GPU compute utilization percentage */
  compute_utilization: number;
  /** Temperature in Celsius */
  temperature_celsius: number;
  /** Power usage in watts */
  power_watts: number;
  /** Current job ID (if busy) */
  current_job_id?: string;
  /** Driver version */
  driver_version: string;
  /** CUDA version */
  cuda_version?: string;
  /** Whether has TEE support */
  has_tee: boolean;
  /** TEE type if available */
  tee_type?: 'IntelTDX' | 'AMDSEVSNP' | 'NvidiaCC';
}

/** GPU metrics response */
export interface GpuMetricsResponse {
  /** Array of GPU metrics */
  gpus: GpuMetrics[];
  /** Total GPUs */
  total_gpus: number;
  /** Active GPUs (currently processing) */
  active_gpus: number;
  /** Average utilization */
  avg_utilization: number;
  /** Total compute power (TFLOPs) */
  total_tflops: number;
}

/** Rewards information */
export interface RewardsInfo {
  /** Claimable rewards (wei) */
  claimable_rewards: bigint;
  /** Pending rewards (not yet claimable) */
  pending_rewards: bigint;
  /** Total rewards earned (lifetime) */
  total_earned: bigint;
  /** Total rewards claimed (lifetime) */
  total_claimed: bigint;
  /** Estimated APY (basis points) */
  estimated_apy_bps: number;
  /** Last claim timestamp */
  last_claim_at?: number;
  /** Mining rewards (from jobs) */
  mining_rewards: bigint;
  /** Staking rewards */
  staking_rewards: bigint;
}

/** Period filter for history */
export type HistoryPeriod = 'day' | 'week' | 'month' | 'year' | 'all';

/** Reward history entry */
export interface RewardHistoryEntry {
  /** Timestamp */
  timestamp: number;
  /** Amount earned (wei) */
  amount: bigint;
  /** Reward type */
  type: 'mining' | 'staking' | 'bonus';
  /** Related job ID (for mining rewards) */
  job_id?: string;
  /** Transaction hash (for claimed rewards) */
  tx_hash?: string;
}

/** Reward history response */
export interface RewardHistoryResponse {
  /** History entries */
  entries: RewardHistoryEntry[];
  /** Total for period (wei) */
  total: bigint;
  /** Period */
  period: HistoryPeriod;
  /** Period start */
  period_start: number;
  /** Period end */
  period_end: number;
}

/** Job analytics */
export interface JobAnalytics {
  /** Total jobs received */
  total_jobs: number;
  /** Completed jobs */
  completed_jobs: number;
  /** Failed jobs */
  failed_jobs: number;
  /** Success rate (basis points) */
  success_rate_bps: number;
  /** Average completion time (ms) */
  avg_completion_time_ms: number;
  /** Jobs by type */
  jobs_by_type: Record<string, number>;
  /** Average reward per job (wei) */
  avg_reward_per_job: bigint;
  /** Total compute hours */
  total_compute_hours: number;
}

/** Recent job */
export interface RecentJob {
  /** Job ID */
  job_id: string;
  /** Job type */
  job_type: string;
  /** Status */
  status: string;
  /** Reward earned (wei) */
  reward: bigint;
  /** Duration (ms) */
  duration_ms: number;
  /** Completed at */
  completed_at: number;
  /** Proof hash */
  proof_hash?: string;
}

/** Network statistics */
export interface NetworkStats {
  /** Total registered workers */
  total_workers: number;
  /** Currently active workers */
  active_workers: number;
  /** Workers by GPU tier */
  workers_by_tier: Record<GpuTier, number>;
  /** Total jobs completed (all time) */
  total_jobs_completed: bigint;
  /** Jobs in progress */
  jobs_in_progress: number;
  /** Network TPS (jobs per second) */
  current_tps: number;
  /** Total compute hours (all time) */
  total_compute_hours: number;
  /** Network utilization (basis points) */
  utilization_bps: number;
  /** Total SAGE staked (wei) */
  total_staked: bigint;
  /** Average APY (basis points) */
  avg_apy_bps: number;
}

/** Worker summary for network view */
export interface WorkerSummary {
  /** Worker ID */
  worker_id: string;
  /** GPU tier */
  gpu_tier: GpuTier;
  /** Reputation score */
  reputation: number;
  /** Jobs completed (last 24h) */
  jobs_24h: number;
  /** Is currently active */
  is_active: boolean;
  /** Location hash (privacy-preserving) */
  location_hash?: string;
}

/** Network workers response */
export interface NetworkWorkersResponse {
  /** Worker summaries */
  workers: WorkerSummary[];
  /** Total count */
  total: number;
  /** Page */
  page: number;
  /** Page size */
  page_size: number;
  /** Has more pages */
  has_more: boolean;
}

/**
 * Dashboard API Client
 *
 * Provides comprehensive dashboard data for validators including:
 * - Validator status and registration
 * - GPU metrics and utilization
 * - Rewards tracking and history
 * - Job analytics
 * - Network statistics
 *
 * @example
 * ```typescript
 * const dashboard = new DashboardClient(httpClient);
 *
 * // Get validator status
 * const status = await dashboard.getValidatorStatus();
 * console.log(`Status: ${status.status}, Reputation: ${status.reputation_score}`);
 *
 * // Get GPU metrics
 * const gpus = await dashboard.getGPUMetrics();
 * gpus.gpus.forEach(gpu => {
 *   console.log(`${gpu.model}: ${gpu.compute_utilization}% utilization`);
 * });
 * ```
 */
export class DashboardClient {
  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  // =========================================================================
  // Validator Operations
  // =========================================================================

  /**
   * Get current validator status
   *
   * @returns Validator status and metrics
   */
  async getValidatorStatus(): Promise<ValidatorStatusResponse> {
    return this.http.get<ValidatorStatusResponse>('/api/validator/status');
  }

  /**
   * Get GPU metrics for all GPUs
   *
   * @returns GPU metrics array
   */
  async getGPUMetrics(): Promise<GpuMetricsResponse> {
    return this.http.get<GpuMetricsResponse>('/api/validator/gpus');
  }

  /**
   * Get rewards information
   *
   * @returns Claimable and pending rewards
   */
  async getRewardsInfo(): Promise<RewardsInfo> {
    const response = await this.http.get<{
      claimable_rewards: string;
      pending_rewards: string;
      total_earned: string;
      total_claimed: string;
      estimated_apy_bps: number;
      last_claim_at?: number;
      mining_rewards: string;
      staking_rewards: string;
    }>('/api/validator/rewards');

    return {
      claimable_rewards: BigInt(response.claimable_rewards),
      pending_rewards: BigInt(response.pending_rewards),
      total_earned: BigInt(response.total_earned),
      total_claimed: BigInt(response.total_claimed),
      estimated_apy_bps: response.estimated_apy_bps,
      last_claim_at: response.last_claim_at,
      mining_rewards: BigInt(response.mining_rewards),
      staking_rewards: BigInt(response.staking_rewards),
    };
  }

  /**
   * Get rewards history
   *
   * @param period - Time period filter
   * @returns Reward history entries
   */
  async getRewardsHistory(period: HistoryPeriod = 'week'): Promise<RewardHistoryResponse> {
    const response = await this.http.get<{
      entries: Array<{
        timestamp: number;
        amount: string;
        type: 'mining' | 'staking' | 'bonus';
        job_id?: string;
        tx_hash?: string;
      }>;
      total: string;
      period: HistoryPeriod;
      period_start: number;
      period_end: number;
    }>('/api/validator/history', { period });

    return {
      entries: response.entries.map(e => ({
        ...e,
        amount: BigInt(e.amount),
      })),
      total: BigInt(response.total),
      period: response.period,
      period_start: response.period_start,
      period_end: response.period_end,
    };
  }

  // =========================================================================
  // Job Analytics
  // =========================================================================

  /**
   * Get job analytics
   *
   * @returns Job completion statistics
   */
  async getJobAnalytics(): Promise<JobAnalytics> {
    const response = await this.http.get<{
      total_jobs: number;
      completed_jobs: number;
      failed_jobs: number;
      success_rate_bps: number;
      avg_completion_time_ms: number;
      jobs_by_type: Record<string, number>;
      avg_reward_per_job: string;
      total_compute_hours: number;
    }>('/api/jobs/analytics');

    return {
      ...response,
      avg_reward_per_job: BigInt(response.avg_reward_per_job),
    };
  }

  /**
   * Get recent completed jobs
   *
   * @param limit - Maximum number of jobs to return
   * @returns Recent job list
   */
  async getRecentJobs(limit: number = 10): Promise<RecentJob[]> {
    const response = await this.http.get<Array<{
      job_id: string;
      job_type: string;
      status: string;
      reward: string;
      duration_ms: number;
      completed_at: number;
      proof_hash?: string;
    }>>('/api/jobs/recent', { limit });

    return response.map(job => ({
      ...job,
      reward: BigInt(job.reward),
    }));
  }

  // =========================================================================
  // Network Operations
  // =========================================================================

  /**
   * Get network-wide statistics
   *
   * @returns Network statistics
   */
  async getNetworkStats(): Promise<NetworkStats> {
    const response = await this.http.get<{
      total_workers: number;
      active_workers: number;
      workers_by_tier: Record<string, number>;
      total_jobs_completed: string;
      jobs_in_progress: number;
      current_tps: number;
      total_compute_hours: number;
      utilization_bps: number;
      total_staked: string;
      avg_apy_bps: number;
    }>('/api/network/stats');

    return {
      ...response,
      workers_by_tier: response.workers_by_tier as Record<GpuTier, number>,
      total_jobs_completed: BigInt(response.total_jobs_completed),
      total_staked: BigInt(response.total_staked),
    };
  }

  /**
   * Get list of network workers
   *
   * @param page - Page number (1-indexed)
   * @param pageSize - Items per page
   * @returns Paginated worker list
   */
  async getNetworkWorkers(page: number = 1, pageSize: number = 20): Promise<NetworkWorkersResponse> {
    return this.http.get<NetworkWorkersResponse>('/api/network/workers', {
      page,
      page_size: pageSize,
    });
  }

  /**
   * Get deployed contract addresses
   *
   * @returns Contract registry
   */
  async getContractAddresses(): Promise<ContractRegistry> {
    return this.http.get<ContractRegistry>('/api/contracts');
  }

  // =========================================================================
  // Health Check
  // =========================================================================

  /**
   * Check API health
   *
   * @returns Health status
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency_ms: number }> {
    const start = Date.now();
    const response = await this.http.get<{ status: string }>('/api/health');
    const latency = Date.now() - start;

    return {
      status: response.status as 'healthy' | 'degraded' | 'unhealthy',
      latency_ms: latency,
    };
  }
}

/**
 * Create a DashboardClient instance
 */
export function createDashboardClient(http: HttpClient): DashboardClient {
  return new DashboardClient(http);
}
