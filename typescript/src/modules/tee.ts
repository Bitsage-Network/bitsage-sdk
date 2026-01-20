/**
 * TEE Integration Module
 * Trusted Execution Environment attestation and verification
 */

import { HttpClient } from '../transport/http-client';
import { ContractClient, toFelt } from '../transport/contract-client';
import type { TransactionReceipt } from '../transport/contract-client';
import type {
  TeeType,
  TeeAttestation,
  EnclaveInfo,
  TeeQuote,
  ExecutionMetrics,
} from '../types/generated/proofs';

export interface TeeClientConfig {
  /** Optimistic TEE contract address */
  optimisticTeeAddress: string;
  /** TEE Registry contract address */
  teeRegistryAddress?: string;
}

/** Transaction result */
export interface TransactionResult {
  transaction_hash: string;
  status: 'pending' | 'accepted' | 'rejected';
  receipt?: TransactionReceipt;
}

/** TEE result submission parameters */
export interface TeeResultParams {
  /** Job ID */
  job_id: bigint;
  /** Output data hash */
  output_hash: bigint;
  /** TEE quote */
  quote: TeeQuote;
  /** Execution metrics */
  execution_metrics: ExecutionMetrics;
}

/** TEE job result */
export interface TeeJobResult {
  /** Job ID */
  job_id: bigint;
  /** Worker address */
  worker: string;
  /** Output hash */
  output_hash: bigint;
  /** TEE type used */
  tee_type: TeeType;
  /** Enclave measurement */
  enclave_measurement: bigint;
  /** Status */
  status: 'Pending' | 'Accepted' | 'Challenged' | 'Finalized' | 'Rejected';
  /** Submission timestamp */
  submitted_at: number;
  /** Finalization timestamp */
  finalized_at?: number;
  /** Challenge window end */
  challenge_window_end: number;
  /** Challenge ID if challenged */
  challenge_id?: bigint;
}

/** TEE challenge parameters */
export interface TeeChallengeParams {
  /** Job ID to challenge */
  job_id: bigint;
  /** Challenge stake (wei) */
  stake: bigint;
  /** Challenge reason */
  reason: string;
  /** Evidence data */
  evidence?: string[];
}

/** TEE challenge status */
export interface TeeChallengeStatus {
  /** Challenge ID */
  challenge_id: bigint;
  /** Job ID challenged */
  job_id: bigint;
  /** Challenger address */
  challenger: string;
  /** Stake amount */
  stake: bigint;
  /** Reason */
  reason: string;
  /** Status */
  status: 'Pending' | 'Investigating' | 'Resolved' | 'Rejected';
  /** Submitted at */
  submitted_at: number;
  /** Resolution timestamp */
  resolved_at?: number;
  /** Whether challenge was upheld */
  upheld?: boolean;
  /** Reward/penalty amount */
  result_amount?: bigint;
}

/** GPU attestation details */
export interface GpuAttestation {
  /** GPU model */
  gpu_model: string;
  /** GPU serial (hashed) */
  gpu_serial_hash: bigint;
  /** TEE type */
  tee_type: TeeType;
  /** Driver version */
  driver_version: string;
  /** Firmware hash */
  firmware_hash: bigint;
  /** Attestation timestamp */
  attestation_timestamp: number;
  /** Expiry timestamp */
  expiry_timestamp: number;
  /** Is valid */
  is_valid: boolean;
}

/** Worker TEE status */
export interface WorkerTeeStatus {
  /** Worker address */
  worker: string;
  /** Has valid TEE attestation */
  has_valid_attestation: boolean;
  /** TEE types supported */
  tee_types: TeeType[];
  /** GPU attestations */
  gpu_attestations: GpuAttestation[];
  /** Last attestation refresh */
  last_refresh: number;
  /** Attestation expiry */
  attestation_expiry: number;
  /** Jobs processed with TEE */
  tee_jobs_count: bigint;
  /** TEE failure rate (basis points) */
  failure_rate_bps: number;
}

/**
 * TEE Integration Client
 *
 * Manages Trusted Execution Environment operations including:
 * - TEE result submission and verification
 * - Challenge and dispute mechanisms
 * - Enclave attestation management
 * - GPU TEE (H100/H200/B200) support
 * - Worker TEE status tracking
 *
 * @example
 * ```typescript
 * const tee = new TeeClient(httpClient, contractClient, config);
 *
 * // Submit TEE result for a job
 * await tee.submitTeeResult({
 *   job_id: jobId,
 *   output_hash: outputHash,
 *   quote: {
 *     quote_data: quoteBytes,
 *     enclave_measurement: measurement,
 *     timestamp: Date.now(),
 *     claims: {},
 *   },
 *   execution_metrics: {
 *     cpu_cycles: 1000000n,
 *     memory_peak: 1024n * 1024n * 1024n,
 *     execution_time_ms: 5000,
 *   },
 * });
 *
 * // Verify enclave attestation
 * const isValid = await tee.verifyEnclaveAttestation(measurement);
 *
 * // Check worker TEE status
 * const status = await tee.getWorkerTeeStatus(workerAddress);
 * ```
 */
export class TeeClient {
  private http: HttpClient;
  private contract: ContractClient;
  private config: TeeClientConfig;

  constructor(
    http: HttpClient,
    contract: ContractClient,
    config: TeeClientConfig
  ) {
    this.http = http;
    this.contract = contract;
    this.config = config;
  }

  // =========================================================================
  // TEE Result Submission
  // =========================================================================

  /**
   * Submit TEE execution result
   *
   * @param params - TEE result parameters
   * @returns Transaction result
   */
  async submitTeeResult(params: TeeResultParams): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.optimisticTeeAddress,
      'submit_tee_result',
      [
        toFelt(params.job_id),
        toFelt(params.output_hash),
        this.teeTypeToFelt(this.getTeeTypeFromQuote(params.quote)),
        toFelt(params.quote.enclave_measurement),
        toFelt(params.quote.timestamp),
        toFelt(params.execution_metrics.cpu_cycles),
        toFelt(params.execution_metrics.memory_peak),
        toFelt(params.execution_metrics.execution_time_ms),
        toFelt(params.execution_metrics.gpu_utilization || 0),
      ]
    );
  }

  /**
   * Get TEE result for a job
   *
   * @param jobId - Job ID
   * @returns TEE job result
   */
  async getTeeResult(jobId: bigint): Promise<TeeJobResult | null> {
    try {
      const response = await this.http.get<{
        job_id: string;
        worker: string;
        output_hash: string;
        tee_type: string;
        enclave_measurement: string;
        status: string;
        submitted_at: number;
        finalized_at?: number;
        challenge_window_end: number;
        challenge_id?: string;
      }>(`/api/tee/results/${jobId}`);

      return {
        job_id: BigInt(response.job_id),
        worker: response.worker,
        output_hash: BigInt(response.output_hash),
        tee_type: response.tee_type as TeeType,
        enclave_measurement: BigInt(response.enclave_measurement),
        status: response.status as TeeJobResult['status'],
        submitted_at: response.submitted_at,
        finalized_at: response.finalized_at,
        challenge_window_end: response.challenge_window_end,
        challenge_id: response.challenge_id
          ? BigInt(response.challenge_id)
          : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Finalize TEE result after challenge window
   *
   * @param jobId - Job ID
   * @returns Transaction result
   */
  async finalizeTeeResult(jobId: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.optimisticTeeAddress,
      'finalize_result',
      [toFelt(jobId)]
    );
  }

  /**
   * Check if TEE result can be finalized
   *
   * @param jobId - Job ID
   * @returns Finalization status
   */
  async canFinalizeTeeResult(jobId: bigint): Promise<{
    can_finalize: boolean;
    reason?: string;
    time_remaining_secs?: number;
  }> {
    const result = await this.getTeeResult(jobId);

    if (!result) {
      return { can_finalize: false, reason: 'No TEE result found' };
    }

    if (result.status !== 'Pending' && result.status !== 'Accepted') {
      return { can_finalize: false, reason: `Result status is ${result.status}` };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now < result.challenge_window_end) {
      return {
        can_finalize: false,
        reason: 'Challenge window not ended',
        time_remaining_secs: result.challenge_window_end - now,
      };
    }

    return { can_finalize: true };
  }

  // =========================================================================
  // Challenge Operations
  // =========================================================================

  /**
   * Challenge a TEE result
   *
   * @param params - Challenge parameters
   * @returns Transaction result with challenge ID
   */
  async challengeTeeResult(params: TeeChallengeParams): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.optimisticTeeAddress,
      'challenge_result',
      [
        toFelt(params.job_id),
        toFelt(params.stake),
        params.reason,
        toFelt(params.evidence?.length || 0),
        ...(params.evidence || []),
      ]
    );
  }

  /**
   * Get challenge status
   *
   * @param challengeId - Challenge ID
   * @returns Challenge status
   */
  async getChallengeStatus(challengeId: bigint): Promise<TeeChallengeStatus> {
    const response = await this.http.get<{
      challenge_id: string;
      job_id: string;
      challenger: string;
      stake: string;
      reason: string;
      status: string;
      submitted_at: number;
      resolved_at?: number;
      upheld?: boolean;
      result_amount?: string;
    }>(`/api/tee/challenges/${challengeId}`);

    return {
      challenge_id: BigInt(response.challenge_id),
      job_id: BigInt(response.job_id),
      challenger: response.challenger,
      stake: BigInt(response.stake),
      reason: response.reason,
      status: response.status as TeeChallengeStatus['status'],
      submitted_at: response.submitted_at,
      resolved_at: response.resolved_at,
      upheld: response.upheld,
      result_amount: response.result_amount
        ? BigInt(response.result_amount)
        : undefined,
    };
  }

  /**
   * Get challenges for a job
   *
   * @param jobId - Job ID
   * @returns Array of challenges
   */
  async getJobChallenges(jobId: bigint): Promise<TeeChallengeStatus[]> {
    const response = await this.http.get<Array<{
      challenge_id: string;
      job_id: string;
      challenger: string;
      stake: string;
      reason: string;
      status: string;
      submitted_at: number;
      resolved_at?: number;
      upheld?: boolean;
      result_amount?: string;
    }>>(`/api/tee/jobs/${jobId}/challenges`);

    return response.map(c => ({
      challenge_id: BigInt(c.challenge_id),
      job_id: BigInt(c.job_id),
      challenger: c.challenger,
      stake: BigInt(c.stake),
      reason: c.reason,
      status: c.status as TeeChallengeStatus['status'],
      submitted_at: c.submitted_at,
      resolved_at: c.resolved_at,
      upheld: c.upheld,
      result_amount: c.result_amount ? BigInt(c.result_amount) : undefined,
    }));
  }

  // =========================================================================
  // Attestation Management
  // =========================================================================

  /**
   * Verify enclave attestation
   *
   * @param measurement - Enclave measurement hash
   * @returns Whether attestation is valid
   */
  async verifyEnclaveAttestation(measurement: string): Promise<boolean> {
    const response = await this.http.get<{ valid: boolean }>(
      `/api/tee/enclaves/${measurement}/verify`
    );
    return response.valid;
  }

  /**
   * Get enclave info
   *
   * @param measurement - Enclave measurement
   * @returns Enclave info or null
   */
  async getEnclaveInfo(measurement: string): Promise<EnclaveInfo | null> {
    try {
      const response = await this.http.get<{
        measurement: string;
        tee_type: string;
        whitelisted_at: number;
        whitelisted_by: string;
        is_valid: boolean;
        revoked_at?: number;
      }>(`/api/tee/enclaves/${measurement}`);

      return {
        measurement: BigInt(response.measurement),
        tee_type: response.tee_type as TeeType,
        whitelisted_at: response.whitelisted_at,
        whitelisted_by: response.whitelisted_by,
        is_valid: response.is_valid,
        revoked_at: response.revoked_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all whitelisted enclaves
   *
   * @returns Array of enclave info
   */
  async getWhitelistedEnclaves(): Promise<EnclaveInfo[]> {
    const response = await this.http.get<Array<{
      measurement: string;
      tee_type: string;
      whitelisted_at: number;
      whitelisted_by: string;
      is_valid: boolean;
      revoked_at?: number;
    }>>('/api/tee/enclaves/whitelisted');

    return response.map(e => ({
      measurement: BigInt(e.measurement),
      tee_type: e.tee_type as TeeType,
      whitelisted_at: e.whitelisted_at,
      whitelisted_by: e.whitelisted_by,
      is_valid: e.is_valid,
      revoked_at: e.revoked_at,
    }));
  }

  /**
   * Submit GPU attestation for worker
   *
   * @param attestation - GPU attestation data
   * @returns Transaction result
   */
  async submitGpuAttestation(attestation: GpuAttestation): Promise<TransactionResult> {
    const registryAddress = this.config.teeRegistryAddress || this.config.optimisticTeeAddress;

    return this.contract.invokeAndWait(
      registryAddress,
      'submit_gpu_attestation',
      [
        attestation.gpu_model,
        toFelt(attestation.gpu_serial_hash),
        this.teeTypeToFelt(attestation.tee_type),
        attestation.driver_version,
        toFelt(attestation.firmware_hash),
        toFelt(attestation.attestation_timestamp),
      ]
    );
  }

  /**
   * Refresh worker TEE attestation
   *
   * @returns Transaction result
   */
  async refreshAttestation(): Promise<TransactionResult> {
    const registryAddress = this.config.teeRegistryAddress || this.config.optimisticTeeAddress;

    return this.contract.invokeAndWait(
      registryAddress,
      'refresh_attestation',
      []
    );
  }

  // =========================================================================
  // Worker TEE Status
  // =========================================================================

  /**
   * Get worker TEE status
   *
   * @param workerAddress - Worker address
   * @returns Worker TEE status
   */
  async getWorkerTeeStatus(workerAddress: string): Promise<WorkerTeeStatus> {
    const response = await this.http.get<{
      worker: string;
      has_valid_attestation: boolean;
      tee_types: string[];
      gpu_attestations: Array<{
        gpu_model: string;
        gpu_serial_hash: string;
        tee_type: string;
        driver_version: string;
        firmware_hash: string;
        attestation_timestamp: number;
        expiry_timestamp: number;
        is_valid: boolean;
      }>;
      last_refresh: number;
      attestation_expiry: number;
      tee_jobs_count: string;
      failure_rate_bps: number;
    }>(`/api/tee/workers/${workerAddress}/status`);

    return {
      worker: response.worker,
      has_valid_attestation: response.has_valid_attestation,
      tee_types: response.tee_types as TeeType[],
      gpu_attestations: response.gpu_attestations.map(g => ({
        gpu_model: g.gpu_model,
        gpu_serial_hash: BigInt(g.gpu_serial_hash),
        tee_type: g.tee_type as TeeType,
        driver_version: g.driver_version,
        firmware_hash: BigInt(g.firmware_hash),
        attestation_timestamp: g.attestation_timestamp,
        expiry_timestamp: g.expiry_timestamp,
        is_valid: g.is_valid,
      })),
      last_refresh: response.last_refresh,
      attestation_expiry: response.attestation_expiry,
      tee_jobs_count: BigInt(response.tee_jobs_count),
      failure_rate_bps: response.failure_rate_bps,
    };
  }

  /**
   * Get workers with valid TEE attestation
   *
   * @param teeType - Optional TEE type filter
   * @returns Array of worker addresses
   */
  async getTeeEnabledWorkers(teeType?: TeeType): Promise<string[]> {
    const queryParams = teeType ? `?tee_type=${teeType}` : '';
    const response = await this.http.get<{ workers: string[] }>(
      `/api/tee/workers/enabled${queryParams}`
    );
    return response.workers;
  }

  // =========================================================================
  // Statistics
  // =========================================================================

  /**
   * Get TEE statistics
   *
   * @returns TEE statistics
   */
  async getTeeStats(): Promise<{
    total_tee_jobs: bigint;
    finalized_jobs: bigint;
    challenged_jobs: bigint;
    challenge_success_rate_bps: number;
    avg_finalization_time_secs: number;
    workers_with_tee: number;
    tee_type_breakdown: Record<TeeType, number>;
  }> {
    const response = await this.http.get<{
      total_tee_jobs: string;
      finalized_jobs: string;
      challenged_jobs: string;
      challenge_success_rate_bps: number;
      avg_finalization_time_secs: number;
      workers_with_tee: number;
      tee_type_breakdown: Record<string, number>;
    }>('/api/tee/stats');

    return {
      total_tee_jobs: BigInt(response.total_tee_jobs),
      finalized_jobs: BigInt(response.finalized_jobs),
      challenged_jobs: BigInt(response.challenged_jobs),
      challenge_success_rate_bps: response.challenge_success_rate_bps,
      avg_finalization_time_secs: response.avg_finalization_time_secs,
      workers_with_tee: response.workers_with_tee,
      tee_type_breakdown: response.tee_type_breakdown as Record<TeeType, number>,
    };
  }

  /**
   * Get TEE job history for worker
   *
   * @param workerAddress - Worker address
   * @param limit - Number of jobs
   * @returns Array of TEE job results
   */
  async getWorkerTeeHistory(
    workerAddress: string,
    limit: number = 100
  ): Promise<TeeJobResult[]> {
    const response = await this.http.get<Array<{
      job_id: string;
      worker: string;
      output_hash: string;
      tee_type: string;
      enclave_measurement: string;
      status: string;
      submitted_at: number;
      finalized_at?: number;
      challenge_window_end: number;
      challenge_id?: string;
    }>>(`/api/tee/workers/${workerAddress}/history?limit=${limit}`);

    return response.map(r => ({
      job_id: BigInt(r.job_id),
      worker: r.worker,
      output_hash: BigInt(r.output_hash),
      tee_type: r.tee_type as TeeType,
      enclave_measurement: BigInt(r.enclave_measurement),
      status: r.status as TeeJobResult['status'],
      submitted_at: r.submitted_at,
      finalized_at: r.finalized_at,
      challenge_window_end: r.challenge_window_end,
      challenge_id: r.challenge_id ? BigInt(r.challenge_id) : undefined,
    }));
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Check if TEE type is supported
   *
   * @param teeType - TEE type to check
   * @returns Whether TEE type is supported
   */
  isTeeTypeSupported(teeType: TeeType): boolean {
    const supported: TeeType[] = ['IntelTDX', 'AMDSEVSNP', 'NvidiaCC'];
    return supported.includes(teeType);
  }

  /**
   * Get TEE type display name
   *
   * @param teeType - TEE type
   * @returns Display name
   */
  getTeeTypeDisplayName(teeType: TeeType): string {
    const names: Record<TeeType, string> = {
      IntelTDX: 'Intel TDX',
      AMDSEVSNP: 'AMD SEV-SNP',
      NvidiaCC: 'NVIDIA Confidential Computing',
    };
    return names[teeType];
  }

  /**
   * Calculate challenge window end
   *
   * @param submittedAt - Submission timestamp
   * @param windowSecs - Challenge window duration (default 24h)
   * @returns Challenge window end timestamp
   */
  calculateChallengeWindowEnd(
    submittedAt: number,
    windowSecs: number = 24 * 60 * 60
  ): number {
    return submittedAt + windowSecs;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private teeTypeToFelt(teeType: TeeType): string {
    const mapping: Record<TeeType, string> = {
      IntelTDX: '1',
      AMDSEVSNP: '2',
      NvidiaCC: '3',
    };
    return mapping[teeType];
  }

  private getTeeTypeFromQuote(quote: TeeQuote): TeeType {
    // Determine TEE type from quote data
    // In production, this would parse the actual quote format
    const measurement = quote.enclave_measurement;

    // Placeholder logic - real implementation would inspect quote structure
    if (quote.claims && quote.claims['tee_type']) {
      const teeTypeNum = Number(quote.claims['tee_type']);
      switch (teeTypeNum) {
        case 1:
          return 'IntelTDX';
        case 2:
          return 'AMDSEVSNP';
        case 3:
          return 'NvidiaCC';
      }
    }

    // Default to NvidiaCC for GPU workloads
    return 'NvidiaCC';
  }
}

/**
 * Create a TeeClient instance
 */
export function createTeeClient(
  http: HttpClient,
  contract: ContractClient,
  optimisticTeeAddress: string,
  teeRegistryAddress?: string
): TeeClient {
  return new TeeClient(http, contract, {
    optimisticTeeAddress,
    teeRegistryAddress,
  });
}

// Re-export types from generated proofs
export type {
  TeeType,
  TeeAttestation,
  EnclaveInfo,
  TeeQuote,
  ExecutionMetrics,
};
