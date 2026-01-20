/**
 * Batch Operations Module
 * Provides gas-optimized batch operations for jobs and proofs
 */

import { HttpClient } from '../transport/http-client';
import type {
  SubmitJobRequest,
  SubmitJobResponse,
  JobStatusResponse,
} from '../types';

/** Maximum jobs per batch */
export const MAX_BATCH_SIZE = 100;

/** Batch job submission response */
export interface BatchJobResponse {
  /** Successfully submitted jobs */
  submitted: SubmitJobResponse[];
  /** Failed submissions with errors */
  failed: Array<{
    index: number;
    request: SubmitJobRequest;
    error: string;
  }>;
  /** Total submitted count */
  submitted_count: number;
  /** Total failed count */
  failed_count: number;
  /** Estimated total gas saved (vs individual) */
  gas_saved_estimate: bigint;
}

/** Batch status response */
export interface BatchStatusResponse {
  /** Job statuses by ID */
  statuses: Map<string, JobStatusResponse>;
  /** Jobs not found */
  not_found: string[];
}

/** Batch operation type for gas estimation */
export type BatchOperationType =
  | 'submit_job'
  | 'cancel_job'
  | 'verify_proof'
  | 'claim_rewards';

/** Batch operation for gas estimation */
export interface BatchOperation {
  type: BatchOperationType;
  /** Number of operations */
  count: number;
  /** Estimated calldata size per operation */
  calldata_size?: number;
}

/** Gas estimate result */
export interface GasEstimate {
  /** Total estimated gas */
  total_gas: bigint;
  /** Gas per operation */
  gas_per_operation: bigint;
  /** Estimated gas savings vs individual calls */
  savings_bps: number;
  /** Estimated cost in SAGE (wei) */
  estimated_cost_sage: bigint;
}

/** Batch proof verification request */
export interface BatchVerifyRequest {
  /** Proof hashes to verify */
  proof_hashes: string[];
}

/** Batch proof verification response */
export interface BatchVerifyResponse {
  /** Verification results by proof hash */
  results: Map<string, boolean>;
  /** Total verified */
  verified_count: number;
  /** Total failed */
  failed_count: number;
  /** Gas used */
  gas_used: bigint;
}

/**
 * Batch Operations Client
 *
 * Provides gas-optimized batch operations for:
 * - Submitting multiple jobs at once
 * - Checking status of multiple jobs
 * - Verifying multiple proofs
 *
 * Batch operations can save up to 60% on gas costs compared to
 * individual transactions.
 *
 * @example
 * ```typescript
 * const batch = new BatchClient(httpClient);
 *
 * // Submit multiple jobs
 * const jobs: SubmitJobRequest[] = [...];
 * const result = await batch.submitJobBatch(jobs);
 * console.log(`Submitted ${result.submitted_count} jobs, saved ~${result.gas_saved_estimate} gas`);
 *
 * // Check multiple job statuses
 * const jobIds = result.submitted.map(j => j.job_id);
 * const statuses = await batch.getJobStatusBatch(jobIds);
 * ```
 */
export class BatchClient {
  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Submit multiple jobs in a single batch
   *
   * @param jobs - Array of job requests (max 100)
   * @returns Batch submission result
   * @throws Error if batch size exceeds maximum
   */
  async submitJobBatch(jobs: SubmitJobRequest[]): Promise<BatchJobResponse> {
    if (jobs.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size ${jobs.length} exceeds maximum ${MAX_BATCH_SIZE}`);
    }

    if (jobs.length === 0) {
      return {
        submitted: [],
        failed: [],
        submitted_count: 0,
        failed_count: 0,
        gas_saved_estimate: 0n,
      };
    }

    const response = await this.http.post<{
      submitted: SubmitJobResponse[];
      failed: Array<{
        index: number;
        request: SubmitJobRequest;
        error: string;
      }>;
      submitted_count: number;
      failed_count: number;
      gas_saved_estimate: string;
    }>('/api/jobs/submit/batch', { jobs });

    return {
      ...response,
      gas_saved_estimate: BigInt(response.gas_saved_estimate),
    };
  }

  /**
   * Get status of multiple jobs
   *
   * @param jobIds - Array of job IDs
   * @returns Map of job ID to status
   */
  async getJobStatusBatch(jobIds: string[]): Promise<BatchStatusResponse> {
    if (jobIds.length === 0) {
      return {
        statuses: new Map(),
        not_found: [],
      };
    }

    const response = await this.http.post<{
      statuses: Record<string, JobStatusResponse>;
      not_found: string[];
    }>('/api/jobs/status/batch', { job_ids: jobIds });

    return {
      statuses: new Map(Object.entries(response.statuses)),
      not_found: response.not_found,
    };
  }

  /**
   * Verify multiple proofs in batch
   *
   * @param proofHashes - Array of proof hashes
   * @returns Verification results
   */
  async verifyProofBatch(proofHashes: string[]): Promise<BatchVerifyResponse> {
    if (proofHashes.length === 0) {
      return {
        results: new Map(),
        verified_count: 0,
        failed_count: 0,
        gas_used: 0n,
      };
    }

    const response = await this.http.post<{
      results: Record<string, boolean>;
      verified_count: number;
      failed_count: number;
      gas_used: string;
    }>('/api/proofs/verify/batch', { proof_hashes: proofHashes });

    return {
      results: new Map(Object.entries(response.results)),
      verified_count: response.verified_count,
      failed_count: response.failed_count,
      gas_used: BigInt(response.gas_used),
    };
  }

  /**
   * Estimate gas for batch operations
   *
   * @param operations - Operations to estimate
   * @returns Gas estimate
   */
  async estimateBatchGas(operations: BatchOperation[]): Promise<GasEstimate> {
    const response = await this.http.post<{
      total_gas: string;
      gas_per_operation: string;
      savings_bps: number;
      estimated_cost_sage: string;
    }>('/api/gas/estimate/batch', { operations });

    return {
      total_gas: BigInt(response.total_gas),
      gas_per_operation: BigInt(response.gas_per_operation),
      savings_bps: response.savings_bps,
      estimated_cost_sage: BigInt(response.estimated_cost_sage),
    };
  }

  /**
   * Cancel multiple jobs in batch
   *
   * @param jobIds - Array of job IDs to cancel
   * @returns Cancellation results
   */
  async cancelJobBatch(jobIds: string[]): Promise<{
    cancelled: string[];
    failed: Array<{ job_id: string; error: string }>;
  }> {
    if (jobIds.length === 0) {
      return { cancelled: [], failed: [] };
    }

    return this.http.post('/api/jobs/cancel/batch', { job_ids: jobIds });
  }

  /**
   * Split large array into batches
   *
   * @param items - Items to split
   * @param batchSize - Size of each batch (default: MAX_BATCH_SIZE)
   * @returns Array of batches
   */
  static splitIntoBatches<T>(items: T[], batchSize: number = MAX_BATCH_SIZE): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Process items in batches with parallel execution
   *
   * @param items - Items to process
   * @param processor - Batch processor function
   * @param options - Processing options
   * @returns Combined results
   */
  static async processBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    options: {
      batchSize?: number;
      concurrency?: number;
    } = {}
  ): Promise<R[]> {
    const { batchSize = MAX_BATCH_SIZE, concurrency = 3 } = options;
    const batches = BatchClient.splitIntoBatches(items, batchSize);
    const results: R[] = [];

    // Process batches with limited concurrency
    for (let i = 0; i < batches.length; i += concurrency) {
      const batchGroup = batches.slice(i, i + concurrency);
      const groupResults = await Promise.all(batchGroup.map(processor));
      results.push(...groupResults.flat());
    }

    return results;
  }
}

/**
 * Create a BatchClient instance
 */
export function createBatchClient(http: HttpClient): BatchClient {
  return new BatchClient(http);
}
