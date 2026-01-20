/**
 * Enhanced Workers Module
 * Full worker management with registration, heartbeat, and leaderboard
 */

import { HttpClient } from '../transport/http-client';
import { ContractClient, toFelt } from '../transport/contract-client';
import type { TransactionReceipt } from '../transport/contract-client';
import type {
  GpuTier,
  WorkerTier,
  SlashReason,
  SlashRecord,
  DisputeRecord,
} from '../types/generated/staking';

export interface WorkersClientConfig {
  /** CDC Pool contract address */
  cdcPoolAddress: string;
  /** Reputation Manager contract address */
  reputationManagerAddress: string;
}

/** Transaction result */
export interface TransactionResult {
  transaction_hash: string;
  status: 'pending' | 'accepted' | 'rejected';
  receipt?: TransactionReceipt;
}

/** Worker status */
export type WorkerStatus = 'Active' | 'Inactive' | 'Suspended' | 'Banned' | 'PendingRegistration';

/** Worker capabilities flags */
export interface WorkerCapabilities {
  /** Has GPU */
  has_gpu: boolean;
  /** GPU tier if has_gpu */
  gpu_tier?: GpuTier;
  /** VRAM in GB */
  vram_gb?: number;
  /** Has TEE support */
  has_tee: boolean;
  /** TEE type */
  tee_type?: 'IntelTDX' | 'AMDSEVSNP' | 'NvidiaCC';
  /** Supported job types (bitfield) */
  supported_job_types: number;
  /** Maximum concurrent jobs */
  max_concurrent_jobs: number;
  /** Network bandwidth (Mbps) */
  bandwidth_mbps: number;
  /** Available storage (GB) */
  storage_gb: number;
  /** CPU cores */
  cpu_cores: number;
  /** RAM (GB) */
  ram_gb: number;
}

/** Worker capability flags */
export const CAPABILITY_FLAGS = {
  AI_INFERENCE: 1 << 0,
  ZK_PROVING: 1 << 1,
  IMAGE_GENERATION: 1 << 2,
  VIDEO_GENERATION: 1 << 3,
  TRAINING: 1 << 4,
  FINE_TUNING: 1 << 5,
  EMBEDDINGS: 1 << 6,
  CUSTOM_COMPUTE: 1 << 7,
} as const;

/** Worker basic info */
export interface WorkerInfo {
  /** Worker address */
  address: string;
  /** Worker ID (may differ from address) */
  worker_id: string;
  /** Current status */
  status: WorkerStatus;
  /** Registration timestamp */
  registered_at: number;
  /** Capabilities */
  capabilities: WorkerCapabilities;
  /** Reputation score (0-100) */
  reputation: number;
  /** Total jobs completed */
  total_jobs: bigint;
  /** Success rate (basis points) */
  success_rate_bps: number;
  /** Current stake */
  stake: bigint;
  /** Worker tier */
  tier: WorkerTier;
  /** Geographic region */
  region?: string;
  /** Last heartbeat timestamp */
  last_heartbeat: number;
}

/** Worker detailed profile */
export interface WorkerProfile {
  /** Basic info */
  info: WorkerInfo;
  /** Total earnings (wei) */
  total_earnings: bigint;
  /** Average job completion time (seconds) */
  avg_completion_time_secs: number;
  /** Jobs in last 24h */
  jobs_24h: number;
  /** Earnings in last 24h (wei) */
  earnings_24h: bigint;
  /** Proof success rate (basis points) */
  proof_success_rate_bps: number;
  /** Consecutive successful jobs */
  consecutive_successes: number;
  /** Slash history count */
  slash_count: number;
  /** Total slashed amount (wei) */
  total_slashed: bigint;
  /** Delegated stake amount (wei) */
  delegated_stake: bigint;
  /** Number of delegators */
  delegator_count: number;
  /** TEE attestation status */
  tee_attestation_valid: boolean;
  /** TEE attestation expiry */
  tee_attestation_expiry?: number;
}

/** Worker performance data for heartbeat */
export interface PerformanceData {
  /** Current CPU usage (0-100) */
  cpu_usage: number;
  /** Current memory usage (0-100) */
  memory_usage: number;
  /** Current GPU usage (0-100) */
  gpu_usage?: number;
  /** Current GPU temperature (Celsius) */
  gpu_temp?: number;
  /** Current GPU memory usage (0-100) */
  gpu_memory_usage?: number;
  /** Active jobs count */
  active_jobs: number;
  /** Queue depth */
  queue_depth: number;
  /** Network latency (ms) */
  network_latency_ms: number;
  /** Is available for new jobs */
  is_available: boolean;
  /** Custom metrics */
  custom_metrics?: Record<string, number>;
}

/** Leaderboard metric type */
export type LeaderboardMetric = 'reputation' | 'earnings' | 'jobs' | 'stake' | 'success_rate';

/** Leaderboard entry */
export interface LeaderboardEntry {
  /** Rank */
  rank: number;
  /** Worker address */
  worker: string;
  /** Metric value */
  value: bigint | number;
  /** Worker tier */
  tier: WorkerTier;
  /** Change from previous period */
  change: number;
}

/** Worker registration params */
export interface RegisterWorkerParams {
  /** Worker capabilities */
  capabilities: WorkerCapabilities;
  /** TEE attestation proof (if has TEE) */
  tee_attestation?: string;
  /** Geographic region code */
  region?: string;
  /** Initial stake amount (wei) */
  initial_stake: bigint;
  /** Benchmark proof */
  benchmark_proof: string;
  /** Benchmark result hash */
  benchmark_hash: string;
}

/**
 * Enhanced Workers Client
 *
 * Full worker management including:
 * - Worker registration and onboarding
 * - Heartbeat and health monitoring
 * - Profile and capability queries
 * - Leaderboard and rankings
 * - Delegation support
 * - Dispute handling
 *
 * @example
 * ```typescript
 * const workers = new WorkersClient(httpClient, contractClient, config);
 *
 * // Register a new worker
 * await workers.registerWorker({
 *   capabilities: {
 *     has_gpu: true,
 *     gpu_tier: 'DataCenter',
 *     vram_gb: 80,
 *     has_tee: true,
 *     tee_type: 'NvidiaCC',
 *     supported_job_types: CAPABILITY_FLAGS.AI_INFERENCE | CAPABILITY_FLAGS.ZK_PROVING,
 *     max_concurrent_jobs: 4,
 *     bandwidth_mbps: 1000,
 *     storage_gb: 500,
 *     cpu_cores: 32,
 *     ram_gb: 256,
 *   },
 *   initial_stake: 5000n * 10n**18n,
 *   benchmark_proof: '0x...',
 *   benchmark_hash: '0x...',
 * });
 *
 * // Submit periodic heartbeat
 * await workers.submitHeartbeat({
 *   cpu_usage: 45,
 *   memory_usage: 60,
 *   gpu_usage: 80,
 *   gpu_temp: 72,
 *   active_jobs: 2,
 *   queue_depth: 5,
 *   network_latency_ms: 15,
 *   is_available: true,
 * });
 * ```
 */
export class WorkersClient {
  private http: HttpClient;
  private contract: ContractClient;
  private config: WorkersClientConfig;

  constructor(
    http: HttpClient,
    contract: ContractClient,
    config: WorkersClientConfig
  ) {
    this.http = http;
    this.contract = contract;
    this.config = config;
  }

  // =========================================================================
  // Worker Registration
  // =========================================================================

  /**
   * Register a new worker
   *
   * @param params - Registration parameters
   * @returns Transaction result
   */
  async registerWorker(params: RegisterWorkerParams): Promise<TransactionResult> {
    const capabilitiesCalldata = this.encodeCapabilities(params.capabilities);

    return this.contract.invokeAndWait(
      this.config.cdcPoolAddress,
      'register_worker',
      [
        ...capabilitiesCalldata,
        params.tee_attestation || '0',
        params.region || '',
        toFelt(params.initial_stake),
        params.benchmark_proof,
        params.benchmark_hash,
      ]
    );
  }

  /**
   * Update worker capabilities
   *
   * @param capabilities - New capabilities
   * @returns Transaction result
   */
  async updateCapabilities(capabilities: WorkerCapabilities): Promise<TransactionResult> {
    const capabilitiesCalldata = this.encodeCapabilities(capabilities);

    return this.contract.invokeAndWait(
      this.config.cdcPoolAddress,
      'update_capabilities',
      capabilitiesCalldata
    );
  }

  /**
   * Deregister worker
   *
   * @returns Transaction result
   */
  async deregisterWorker(): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.cdcPoolAddress,
      'deregister_worker',
      []
    );
  }

  // =========================================================================
  // Heartbeat & Health
  // =========================================================================

  /**
   * Submit worker heartbeat with performance data
   *
   * @param performanceData - Current performance metrics
   * @returns Transaction result
   */
  async submitHeartbeat(performanceData: PerformanceData): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.cdcPoolAddress,
      'submit_heartbeat',
      [
        toFelt(performanceData.cpu_usage),
        toFelt(performanceData.memory_usage),
        toFelt(performanceData.gpu_usage || 0),
        toFelt(performanceData.gpu_temp || 0),
        toFelt(performanceData.gpu_memory_usage || 0),
        toFelt(performanceData.active_jobs),
        toFelt(performanceData.queue_depth),
        toFelt(performanceData.network_latency_ms),
        performanceData.is_available ? '1' : '0',
      ]
    );
  }

  /**
   * Mark worker as unavailable
   *
   * @param reason - Reason for unavailability
   * @param estimatedReturnTime - Unix timestamp for estimated return
   * @returns Transaction result
   */
  async setUnavailable(reason: string, estimatedReturnTime?: number): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.cdcPoolAddress,
      'set_unavailable',
      [reason, estimatedReturnTime ? toFelt(estimatedReturnTime) : '0']
    );
  }

  /**
   * Mark worker as available
   *
   * @returns Transaction result
   */
  async setAvailable(): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.cdcPoolAddress,
      'set_available',
      []
    );
  }

  // =========================================================================
  // Worker Queries
  // =========================================================================

  /**
   * List all workers
   *
   * @param params - Filter parameters
   * @returns Array of worker info
   */
  async listWorkers(params?: {
    status?: WorkerStatus;
    min_reputation?: number;
    gpu_tier?: GpuTier;
    has_tee?: boolean;
    capability_flags?: number;
    limit?: number;
    offset?: number;
  }): Promise<WorkerInfo[]> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.set('status', params.status);
    if (params?.min_reputation) queryParams.set('min_reputation', params.min_reputation.toString());
    if (params?.gpu_tier) queryParams.set('gpu_tier', params.gpu_tier);
    if (params?.has_tee !== undefined) queryParams.set('has_tee', params.has_tee.toString());
    if (params?.capability_flags) queryParams.set('capability_flags', params.capability_flags.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());

    const response = await this.http.get<Array<{
      address: string;
      worker_id: string;
      status: string;
      registered_at: number;
      capabilities: WorkerCapabilities;
      reputation: number;
      total_jobs: string;
      success_rate_bps: number;
      stake: string;
      tier: string;
      region?: string;
      last_heartbeat: number;
    }>>(`/api/workers?${queryParams.toString()}`);

    return response.map(w => ({
      ...w,
      status: w.status as WorkerStatus,
      total_jobs: BigInt(w.total_jobs),
      stake: BigInt(w.stake),
      tier: w.tier as WorkerTier,
    }));
  }

  /**
   * Get worker info by ID
   *
   * @param workerId - Worker ID or address
   * @returns Worker info
   */
  async getWorker(workerId: string): Promise<WorkerInfo> {
    const response = await this.http.get<{
      address: string;
      worker_id: string;
      status: string;
      registered_at: number;
      capabilities: WorkerCapabilities;
      reputation: number;
      total_jobs: string;
      success_rate_bps: number;
      stake: string;
      tier: string;
      region?: string;
      last_heartbeat: number;
    }>(`/api/workers/${workerId}`);

    return {
      ...response,
      status: response.status as WorkerStatus,
      total_jobs: BigInt(response.total_jobs),
      stake: BigInt(response.stake),
      tier: response.tier as WorkerTier,
    };
  }

  /**
   * Get detailed worker profile
   *
   * @param workerId - Worker ID or address
   * @returns Detailed worker profile
   */
  async getWorkerProfile(workerId: string): Promise<WorkerProfile> {
    const response = await this.http.get<{
      info: {
        address: string;
        worker_id: string;
        status: string;
        registered_at: number;
        capabilities: WorkerCapabilities;
        reputation: number;
        total_jobs: string;
        success_rate_bps: number;
        stake: string;
        tier: string;
        region?: string;
        last_heartbeat: number;
      };
      total_earnings: string;
      avg_completion_time_secs: number;
      jobs_24h: number;
      earnings_24h: string;
      proof_success_rate_bps: number;
      consecutive_successes: number;
      slash_count: number;
      total_slashed: string;
      delegated_stake: string;
      delegator_count: number;
      tee_attestation_valid: boolean;
      tee_attestation_expiry?: number;
    }>(`/api/workers/${workerId}/profile`);

    return {
      info: {
        ...response.info,
        status: response.info.status as WorkerStatus,
        total_jobs: BigInt(response.info.total_jobs),
        stake: BigInt(response.info.stake),
        tier: response.info.tier as WorkerTier,
      },
      total_earnings: BigInt(response.total_earnings),
      avg_completion_time_secs: response.avg_completion_time_secs,
      jobs_24h: response.jobs_24h,
      earnings_24h: BigInt(response.earnings_24h),
      proof_success_rate_bps: response.proof_success_rate_bps,
      consecutive_successes: response.consecutive_successes,
      slash_count: response.slash_count,
      total_slashed: BigInt(response.total_slashed),
      delegated_stake: BigInt(response.delegated_stake),
      delegator_count: response.delegator_count,
      tee_attestation_valid: response.tee_attestation_valid,
      tee_attestation_expiry: response.tee_attestation_expiry,
    };
  }

  /**
   * Get workers by capability flags
   *
   * @param flags - Capability flags (bitfield)
   * @param minReputation - Minimum reputation score
   * @returns Array of worker addresses
   */
  async getWorkersByCapability(flags: number, minReputation: number = 0): Promise<string[]> {
    const response = await this.http.get<{ workers: string[] }>(
      `/api/workers/by-capability?flags=${flags}&min_reputation=${minReputation}`
    );
    return response.workers;
  }

  /**
   * Get available workers for a job type
   *
   * @param jobType - Job type capability flag
   * @param gpuTierRequired - Minimum GPU tier required
   * @returns Array of available worker addresses
   */
  async getAvailableWorkers(jobType: number, gpuTierRequired?: GpuTier): Promise<string[]> {
    const queryParams = new URLSearchParams();
    queryParams.set('job_type', jobType.toString());
    if (gpuTierRequired) queryParams.set('gpu_tier', gpuTierRequired);

    const response = await this.http.get<{ workers: string[] }>(
      `/api/workers/available?${queryParams.toString()}`
    );
    return response.workers;
  }

  // =========================================================================
  // Leaderboard
  // =========================================================================

  /**
   * Get worker leaderboard
   *
   * @param metric - Ranking metric
   * @param limit - Number of entries
   * @param period - Time period ('day' | 'week' | 'month' | 'all')
   * @returns Leaderboard entries
   */
  async getLeaderboard(
    metric: LeaderboardMetric,
    limit: number = 100,
    period: 'day' | 'week' | 'month' | 'all' = 'all'
  ): Promise<LeaderboardEntry[]> {
    const response = await this.http.get<Array<{
      rank: number;
      worker: string;
      value: string;
      tier: string;
      change: number;
    }>>(`/api/workers/leaderboard/${metric}?limit=${limit}&period=${period}`);

    return response.map(entry => ({
      rank: entry.rank,
      worker: entry.worker,
      value: metric === 'reputation' || metric === 'success_rate'
        ? Number(entry.value)
        : BigInt(entry.value),
      tier: entry.tier as WorkerTier,
      change: entry.change,
    }));
  }

  /**
   * Get worker rank for a metric
   *
   * @param workerId - Worker ID
   * @param metric - Ranking metric
   * @returns Worker's rank
   */
  async getWorkerRank(workerId: string, metric: LeaderboardMetric): Promise<number> {
    const response = await this.http.get<{ rank: number }>(
      `/api/workers/${workerId}/rank/${metric}`
    );
    return response.rank;
  }

  // =========================================================================
  // Reputation
  // =========================================================================

  /**
   * Get worker reputation details
   *
   * @param workerId - Worker ID
   * @returns Reputation breakdown
   */
  async getReputationDetails(workerId: string): Promise<{
    overall: number;
    job_completion: number;
    proof_accuracy: number;
    uptime: number;
    response_time: number;
    peer_reviews: number;
    stake_factor: number;
    history: Array<{
      timestamp: number;
      change: number;
      reason: string;
    }>;
  }> {
    return this.http.get(`/api/workers/${workerId}/reputation`);
  }

  /**
   * Submit peer review (for other workers)
   *
   * @param workerId - Worker being reviewed
   * @param jobId - Job the review is for
   * @param rating - Rating (1-5)
   * @param comment - Optional comment
   * @returns Transaction result
   */
  async submitPeerReview(
    workerId: string,
    jobId: bigint,
    rating: number,
    comment?: string
  ): Promise<TransactionResult> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    return this.contract.invokeAndWait(
      this.config.reputationManagerAddress,
      'submit_peer_review',
      [workerId, toFelt(jobId), toFelt(rating), comment || '']
    );
  }

  // =========================================================================
  // Disputes
  // =========================================================================

  /**
   * Challenge a slash against this worker
   *
   * @param slashId - Slash ID to challenge
   * @param evidence - Evidence supporting the challenge
   * @param bond - Bond amount (wei)
   * @returns Transaction result with dispute ID
   */
  async challengeSlash(
    slashId: bigint,
    evidence: string[],
    bond: bigint
  ): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.cdcPoolAddress,
      'challenge_slash',
      [toFelt(slashId), toFelt(bond), ...evidence]
    );
  }

  /**
   * Get dispute status
   *
   * @param disputeId - Dispute ID
   * @returns Dispute record
   */
  async getDisputeStatus(disputeId: bigint): Promise<DisputeRecord> {
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
    }>(`/api/workers/disputes/${disputeId}`);

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

  /**
   * Get slash records for a worker
   *
   * @param workerId - Worker ID
   * @returns Array of slash records
   */
  async getSlashHistory(workerId: string): Promise<SlashRecord[]> {
    const response = await this.http.get<Array<{
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
    }>>(`/api/workers/${workerId}/slashes`);

    return response.map(s => ({
      slash_id: BigInt(s.slash_id),
      worker: s.worker,
      reason: s.reason as SlashReason,
      amount: BigInt(s.amount),
      percentage_bps: s.percentage_bps,
      job_id: s.job_id ? BigInt(s.job_id) : undefined,
      challenger: s.challenger,
      slashed_at: s.slashed_at,
      evidence_hash: s.evidence_hash ? BigInt(s.evidence_hash) : undefined,
      is_disputed: s.is_disputed,
      dispute_id: s.dispute_id ? BigInt(s.dispute_id) : undefined,
    }));
  }

  // =========================================================================
  // TEE Operations
  // =========================================================================

  /**
   * Submit TEE attestation
   *
   * @param attestation - TEE attestation data
   * @returns Transaction result
   */
  async submitTeeAttestation(attestation: string): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.cdcPoolAddress,
      'submit_tee_attestation',
      [attestation]
    );
  }

  /**
   * Verify worker's TEE attestation
   *
   * @param workerId - Worker ID
   * @returns Whether attestation is valid
   */
  async verifyTeeAttestation(workerId: string): Promise<{
    valid: boolean;
    tee_type?: string;
    expires_at?: number;
    measurement?: string;
  }> {
    return this.http.get(`/api/workers/${workerId}/tee-attestation`);
  }

  // =========================================================================
  // Statistics
  // =========================================================================

  /**
   * Get network-wide worker statistics
   *
   * @returns Worker statistics
   */
  async getNetworkStats(): Promise<{
    total_workers: number;
    active_workers: number;
    total_stake: bigint;
    avg_reputation: number;
    workers_by_tier: Record<WorkerTier, number>;
    workers_by_gpu_tier: Record<GpuTier, number>;
    tee_enabled_workers: number;
  }> {
    const response = await this.http.get<{
      total_workers: number;
      active_workers: number;
      total_stake: string;
      avg_reputation: number;
      workers_by_tier: Record<string, number>;
      workers_by_gpu_tier: Record<string, number>;
      tee_enabled_workers: number;
    }>('/api/workers/stats');

    return {
      ...response,
      total_stake: BigInt(response.total_stake),
      workers_by_tier: response.workers_by_tier as Record<WorkerTier, number>,
      workers_by_gpu_tier: response.workers_by_gpu_tier as Record<GpuTier, number>,
    };
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private encodeCapabilities(capabilities: WorkerCapabilities): string[] {
    return [
      capabilities.has_gpu ? '1' : '0',
      capabilities.gpu_tier ? this.gpuTierToFelt(capabilities.gpu_tier) : '0',
      toFelt(capabilities.vram_gb || 0),
      capabilities.has_tee ? '1' : '0',
      capabilities.tee_type ? this.teeTypeToFelt(capabilities.tee_type) : '0',
      toFelt(capabilities.supported_job_types),
      toFelt(capabilities.max_concurrent_jobs),
      toFelt(capabilities.bandwidth_mbps),
      toFelt(capabilities.storage_gb),
      toFelt(capabilities.cpu_cores),
      toFelt(capabilities.ram_gb),
    ];
  }

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

  private teeTypeToFelt(tee: 'IntelTDX' | 'AMDSEVSNP' | 'NvidiaCC'): string {
    const mapping = {
      IntelTDX: '1',
      AMDSEVSNP: '2',
      NvidiaCC: '3',
    };
    return mapping[tee];
  }
}

/**
 * Create a WorkersClient instance
 */
export function createWorkersClient(
  http: HttpClient,
  contract: ContractClient,
  cdcPoolAddress: string,
  reputationManagerAddress: string
): WorkersClient {
  return new WorkersClient(http, contract, {
    cdcPoolAddress,
    reputationManagerAddress,
  });
}
