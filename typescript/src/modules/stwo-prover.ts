/**
 * STWO GPU Prover Client
 *
 * Enables GPU-accelerated proof generation for:
 * - Batch payment aggregation
 * - AI/ML inference verification
 * - Cross-chain bridge proofs
 * - Complex DeFi calculations
 * - Gaming state verification
 * - And more...
 *
 * @example
 * ```typescript
 * import { createStwoProverClient } from '@bitsage/sdk';
 *
 * const prover = createStwoProverClient({
 *   baseUrl: 'https://prover.bitsage.network',
 *   apiKey: 'your-api-key',
 * });
 *
 * // Submit a proof generation job
 * const job = await prover.submitProofJob({
 *   proofType: 'batch_payments',
 *   inputs: paymentData,
 *   priority: 'high',
 * });
 *
 * // Wait for completion
 * const result = await prover.waitForProof(job.jobId);
 * console.log('Proof generated:', result.proofHash);
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export type GpuTier = 'H100' | 'H200' | 'B200' | 'A100' | '4090' | 'auto';

export type ProofJobPriority = 'standard' | 'high' | 'critical' | 'emergency';

export type ProofJobStatus =
  | 'queued'
  | 'assigned'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export type ProofType =
  | 'batch_payments'
  | 'ai_inference'
  | 'cross_chain_bridge'
  | 'defi_calculation'
  | 'game_state'
  | 'vrf_randomness'
  | 'kyc_verification'
  | 'supply_chain'
  | 'recursive_aggregation'
  | 'custom';

export interface StwoProverConfig {
  /** Base URL of the STWO prover service */
  baseUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Default GPU tier preference */
  defaultGpuTier?: GpuTier;
  /** Default priority for jobs */
  defaultPriority?: ProofJobPriority;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable TEE for privacy */
  requireTee?: boolean;
}

export interface ProofJobRequest {
  /** Type of proof to generate */
  proofType: ProofType;
  /** Public inputs for the circuit */
  publicInputs: bigint[];
  /** Private inputs (only sent if TEE enabled) */
  privateInputs?: bigint[];
  /** Custom circuit ID (for custom proof types) */
  circuitId?: string;
  /** Priority level */
  priority?: ProofJobPriority;
  /** GPU tier requirement */
  gpuTier?: GpuTier;
  /** Deadline timestamp (unix seconds) */
  deadline?: number;
  /** Require TEE for privacy */
  requireTee?: boolean;
  /** Maximum cost in USDC (will reject if exceeds) */
  maxCostUsdc?: number;
  /** Callback URL for completion notification */
  callbackUrl?: string;
  /** Metadata for tracking */
  metadata?: Record<string, string>;
}

export interface ProofJobResponse {
  /** Unique job identifier */
  jobId: string;
  /** Current status */
  status: ProofJobStatus;
  /** Estimated cost in USDC */
  estimatedCostUsdc: number;
  /** Estimated time to completion in seconds */
  estimatedTimeSecs: number;
  /** Position in queue (if queued) */
  queuePosition?: number;
  /** Assigned GPU info */
  assignedGpu?: {
    tier: GpuTier;
    workerId: string;
    teeEnabled: boolean;
  };
  /** Timestamp when job was created */
  createdAt: number;
}

export interface ProofGenerationStatus {
  /** Job identifier */
  jobId: string;
  /** Current status */
  status: ProofJobStatus;
  /** Progress in basis points (0-10000 = 0-100%) */
  progressBps: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemainingSecs: number;
  /** Current phase description */
  currentPhase: string;
  /** GPU utilization percentage */
  gpuUtilization?: number;
  /** Memory used in MB */
  memoryUsedMb?: number;
  /** Error message if failed */
  errorMessage?: string;
  /** Retry count */
  retryCount: number;
}

export interface ProofResult {
  /** Job identifier */
  jobId: string;
  /** Proof hash */
  proofHash: string;
  /** Serialized proof data (hex encoded) */
  proofData: string;
  /** Public input hash */
  publicInputHash: string;
  /** Proof size in bytes */
  proofSizeBytes: number;
  /** Generation time in milliseconds */
  generationTimeMs: number;
  /** Actual cost in USDC */
  costUsdc: number;
  /** GPU that generated the proof */
  gpuTier: GpuTier;
  /** TEE attestation if applicable */
  teeAttestation?: {
    teeType: 'IntelTDX' | 'AMDSEVSNP' | 'NvidiaCC';
    enclaveMeasurement: string;
    quoteHash: string;
  };
  /** Verification status on-chain */
  verificationStatus: 'pending' | 'verified' | 'failed';
  /** Transaction hash if submitted on-chain */
  txHash?: string;
}

export interface BatchProofRequest {
  /** Array of individual proof requests */
  proofs: ProofJobRequest[];
  /** Aggregate into single recursive proof */
  aggregate?: boolean;
  /** Priority for the batch */
  priority?: ProofJobPriority;
  /** Maximum total cost in USDC */
  maxTotalCostUsdc?: number;
}

export interface BatchProofResponse {
  /** Batch identifier */
  batchId: string;
  /** Individual job IDs */
  jobIds: string[];
  /** Total estimated cost */
  estimatedTotalCostUsdc: number;
  /** Estimated time for entire batch */
  estimatedTimeSecs: number;
  /** Status of the batch */
  status: 'queued' | 'processing' | 'completed' | 'partial_failure' | 'failed';
}

export interface ProverMetrics {
  /** Available GPU capacity */
  availableGpus: {
    tier: GpuTier;
    count: number;
    teeEnabled: number;
  }[];
  /** Current queue depth */
  queueDepth: number;
  /** Average wait time in seconds */
  avgWaitTimeSecs: number;
  /** Proofs generated in last hour */
  proofsLastHour: number;
  /** Network-wide utilization percentage */
  networkUtilization: number;
  /** Current pricing per proof type */
  pricing: {
    proofType: ProofType;
    baseCostUsdc: number;
    perConstraintUsdc: number;
  }[];
}

export interface ProofCostEstimate {
  /** Estimated cost in USDC */
  costUsdc: number;
  /** Estimated time in seconds */
  timeSecs: number;
  /** Recommended GPU tier */
  recommendedGpuTier: GpuTier;
  /** Cost breakdown */
  breakdown: {
    baseCost: number;
    constraintCost: number;
    prioritySurcharge: number;
    teeSurcharge: number;
  };
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

export const DEFAULT_PROVER_CONFIG: Partial<StwoProverConfig> = {
  baseUrl: 'https://prover.bitsage.network',
  defaultGpuTier: 'auto',
  defaultPriority: 'standard',
  timeout: 30000,
  requireTee: false,
};

// =============================================================================
// STWO PROVER CLIENT
// =============================================================================

export class StwoProverClient {
  private config: StwoProverConfig;

  constructor(config: StwoProverConfig) {
    this.config = { ...DEFAULT_PROVER_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Core API Methods
  // ---------------------------------------------------------------------------

  /**
   * Submit a proof generation job to the GPU network
   */
  async submitProofJob(request: ProofJobRequest): Promise<ProofJobResponse> {
    const body = {
      proof_type: request.proofType,
      public_inputs: request.publicInputs.map((i) => i.toString()),
      private_inputs: request.privateInputs?.map((i) => i.toString()),
      circuit_id: request.circuitId,
      priority: request.priority ?? this.config.defaultPriority,
      gpu_tier: request.gpuTier ?? this.config.defaultGpuTier,
      deadline: request.deadline,
      require_tee: request.requireTee ?? this.config.requireTee,
      max_cost_usdc: request.maxCostUsdc,
      callback_url: request.callbackUrl,
      metadata: request.metadata,
    };

    const response = await this.fetch('/api/v1/proofs/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      jobId: response.job_id,
      status: response.status,
      estimatedCostUsdc: response.estimated_cost_usdc,
      estimatedTimeSecs: response.estimated_time_secs,
      queuePosition: response.queue_position,
      assignedGpu: response.assigned_gpu
        ? {
            tier: response.assigned_gpu.tier,
            workerId: response.assigned_gpu.worker_id,
            teeEnabled: response.assigned_gpu.tee_enabled,
          }
        : undefined,
      createdAt: response.created_at,
    };
  }

  /**
   * Get the current status of a proof generation job
   */
  async getJobStatus(jobId: string): Promise<ProofGenerationStatus> {
    const response = await this.fetch(`/api/v1/proofs/${jobId}/status`);

    return {
      jobId: response.job_id,
      status: response.status,
      progressBps: response.progress_bps,
      estimatedTimeRemainingSecs: response.estimated_time_remaining_secs,
      currentPhase: response.current_phase,
      gpuUtilization: response.gpu_utilization,
      memoryUsedMb: response.memory_used_mb,
      errorMessage: response.error_message,
      retryCount: response.retry_count,
    };
  }

  /**
   * Get the completed proof result
   */
  async getProofResult(jobId: string): Promise<ProofResult> {
    const response = await this.fetch(`/api/v1/proofs/${jobId}/result`);

    return {
      jobId: response.job_id,
      proofHash: response.proof_hash,
      proofData: response.proof_data,
      publicInputHash: response.public_input_hash,
      proofSizeBytes: response.proof_size_bytes,
      generationTimeMs: response.generation_time_ms,
      costUsdc: response.cost_usdc,
      gpuTier: response.gpu_tier,
      teeAttestation: response.tee_attestation
        ? {
            teeType: response.tee_attestation.tee_type,
            enclaveMeasurement: response.tee_attestation.enclave_measurement,
            quoteHash: response.tee_attestation.quote_hash,
          }
        : undefined,
      verificationStatus: response.verification_status,
      txHash: response.tx_hash,
    };
  }

  /**
   * Cancel a pending proof job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const response = await this.fetch(`/api/v1/proofs/${jobId}`, {
      method: 'DELETE',
    });
    return response.cancelled === true;
  }

  /**
   * Wait for a proof to complete (polling)
   */
  async waitForProof(
    jobId: string,
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      onProgress?: (status: ProofGenerationStatus) => void;
    }
  ): Promise<ProofResult> {
    const pollInterval = options?.pollIntervalMs ?? 2000;
    const timeout = options?.timeoutMs ?? 300000; // 5 minutes default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getJobStatus(jobId);

      if (options?.onProgress) {
        options.onProgress(status);
      }

      if (status.status === 'completed') {
        return this.getProofResult(jobId);
      }

      if (status.status === 'failed' || status.status === 'cancelled') {
        throw new Error(
          `Proof generation ${status.status}: ${status.errorMessage ?? 'Unknown error'}`
        );
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`Proof generation timed out after ${timeout}ms`);
  }

  // ---------------------------------------------------------------------------
  // Batch Operations
  // ---------------------------------------------------------------------------

  /**
   * Submit multiple proofs as a batch (with optional aggregation)
   */
  async submitBatch(request: BatchProofRequest): Promise<BatchProofResponse> {
    const body = {
      proofs: request.proofs.map((p) => ({
        proof_type: p.proofType,
        public_inputs: p.publicInputs.map((i) => i.toString()),
        private_inputs: p.privateInputs?.map((i) => i.toString()),
        circuit_id: p.circuitId,
        require_tee: p.requireTee,
      })),
      aggregate: request.aggregate ?? false,
      priority: request.priority ?? this.config.defaultPriority,
      max_total_cost_usdc: request.maxTotalCostUsdc,
    };

    const response = await this.fetch('/api/v1/proofs/batch', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      batchId: response.batch_id,
      jobIds: response.job_ids,
      estimatedTotalCostUsdc: response.estimated_total_cost_usdc,
      estimatedTimeSecs: response.estimated_time_secs,
      status: response.status,
    };
  }

  /**
   * Get batch status
   */
  async getBatchStatus(batchId: string): Promise<BatchProofResponse> {
    const response = await this.fetch(`/api/v1/proofs/batch/${batchId}/status`);

    return {
      batchId: response.batch_id,
      jobIds: response.job_ids,
      estimatedTotalCostUsdc: response.estimated_total_cost_usdc,
      estimatedTimeSecs: response.estimated_time_secs,
      status: response.status,
    };
  }

  /**
   * Wait for entire batch to complete
   */
  async waitForBatch(
    batchId: string,
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      onProgress?: (completed: number, total: number) => void;
    }
  ): Promise<ProofResult[]> {
    const pollInterval = options?.pollIntervalMs ?? 5000;
    const timeout = options?.timeoutMs ?? 600000; // 10 minutes default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getBatchStatus(batchId);

      if (options?.onProgress) {
        // Count completed jobs
        let completed = 0;
        for (const jobId of status.jobIds) {
          const jobStatus = await this.getJobStatus(jobId);
          if (jobStatus.status === 'completed') completed++;
        }
        options.onProgress(completed, status.jobIds.length);
      }

      if (status.status === 'completed') {
        // Fetch all results
        const results: ProofResult[] = [];
        for (const jobId of status.jobIds) {
          results.push(await this.getProofResult(jobId));
        }
        return results;
      }

      if (status.status === 'failed') {
        throw new Error('Batch proof generation failed');
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`Batch proof generation timed out after ${timeout}ms`);
  }

  // ---------------------------------------------------------------------------
  // Cost Estimation
  // ---------------------------------------------------------------------------

  /**
   * Estimate cost before submitting a job
   */
  async estimateCost(request: ProofJobRequest): Promise<ProofCostEstimate> {
    const body = {
      proof_type: request.proofType,
      public_inputs_count: request.publicInputs.length,
      private_inputs_count: request.privateInputs?.length ?? 0,
      circuit_id: request.circuitId,
      priority: request.priority ?? this.config.defaultPriority,
      gpu_tier: request.gpuTier ?? this.config.defaultGpuTier,
      require_tee: request.requireTee ?? this.config.requireTee,
    };

    const response = await this.fetch('/api/v1/proofs/estimate', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      costUsdc: response.cost_usdc,
      timeSecs: response.time_secs,
      recommendedGpuTier: response.recommended_gpu_tier,
      breakdown: {
        baseCost: response.breakdown.base_cost,
        constraintCost: response.breakdown.constraint_cost,
        prioritySurcharge: response.breakdown.priority_surcharge,
        teeSurcharge: response.breakdown.tee_surcharge,
      },
    };
  }

  /**
   * Estimate batch cost
   */
  async estimateBatchCost(request: BatchProofRequest): Promise<{
    totalCostUsdc: number;
    individualCosts: ProofCostEstimate[];
    aggregationSavings: number;
  }> {
    const body = {
      proofs: request.proofs.map((p) => ({
        proof_type: p.proofType,
        public_inputs_count: p.publicInputs.length,
        private_inputs_count: p.privateInputs?.length ?? 0,
      })),
      aggregate: request.aggregate ?? false,
      priority: request.priority ?? this.config.defaultPriority,
    };

    const response = await this.fetch('/api/v1/proofs/batch/estimate', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      totalCostUsdc: response.total_cost_usdc,
      individualCosts: response.individual_costs.map((c: any) => ({
        costUsdc: c.cost_usdc,
        timeSecs: c.time_secs,
        recommendedGpuTier: c.recommended_gpu_tier,
        breakdown: c.breakdown,
      })),
      aggregationSavings: response.aggregation_savings,
    };
  }

  // ---------------------------------------------------------------------------
  // Network Metrics
  // ---------------------------------------------------------------------------

  /**
   * Get current network metrics and pricing
   */
  async getMetrics(): Promise<ProverMetrics> {
    const response = await this.fetch('/api/v1/proofs/metrics');

    return {
      availableGpus: response.available_gpus.map((g: any) => ({
        tier: g.tier,
        count: g.count,
        teeEnabled: g.tee_enabled,
      })),
      queueDepth: response.queue_depth,
      avgWaitTimeSecs: response.avg_wait_time_secs,
      proofsLastHour: response.proofs_last_hour,
      networkUtilization: response.network_utilization,
      pricing: response.pricing.map((p: any) => ({
        proofType: p.proof_type,
        baseCostUsdc: p.base_cost_usdc,
        perConstraintUsdc: p.per_constraint_usdc,
      })),
    };
  }

  /**
   * Get queue depth for planning
   */
  async getQueueDepth(): Promise<{
    total: number;
    byPriority: Record<ProofJobPriority, number>;
    estimatedClearTimeSecs: number;
  }> {
    const response = await this.fetch('/api/v1/proofs/queue');

    return {
      total: response.total,
      byPriority: response.by_priority,
      estimatedClearTimeSecs: response.estimated_clear_time_secs,
    };
  }

  // ---------------------------------------------------------------------------
  // Specialized Proof Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate proof for batch payments (optimized)
   */
  async proveBatchPayments(
    payments: Array<{
      sender: string;
      recipient: string;
      amount: bigint;
      asset: string;
    }>,
    options?: {
      priority?: ProofJobPriority;
      requireTee?: boolean;
    }
  ): Promise<ProofResult> {
    // Encode payments as public inputs
    const publicInputs: bigint[] = [];
    for (const p of payments) {
      publicInputs.push(BigInt(p.sender));
      publicInputs.push(BigInt(p.recipient));
      publicInputs.push(p.amount);
      publicInputs.push(BigInt(p.asset));
    }

    const job = await this.submitProofJob({
      proofType: 'batch_payments',
      publicInputs,
      priority: options?.priority ?? 'high',
      requireTee: options?.requireTee,
      metadata: {
        payment_count: payments.length.toString(),
      },
    });

    return this.waitForProof(job.jobId);
  }

  /**
   * Generate proof for AI/ML inference
   */
  async proveInference(
    modelId: string,
    inputs: bigint[],
    outputs: bigint[],
    options?: {
      priority?: ProofJobPriority;
      requireTee?: boolean;
    }
  ): Promise<ProofResult> {
    const job = await this.submitProofJob({
      proofType: 'ai_inference',
      publicInputs: [...inputs, ...outputs],
      circuitId: modelId,
      priority: options?.priority ?? 'standard',
      requireTee: options?.requireTee ?? true, // TEE recommended for ML
      metadata: {
        model_id: modelId,
        input_count: inputs.length.toString(),
        output_count: outputs.length.toString(),
      },
    });

    return this.waitForProof(job.jobId);
  }

  /**
   * Generate VRF randomness proof
   */
  async proveRandomness(
    seed: bigint,
    count: number,
    options?: {
      priority?: ProofJobPriority;
    }
  ): Promise<{
    proof: ProofResult;
    randomValues: bigint[];
  }> {
    const job = await this.submitProofJob({
      proofType: 'vrf_randomness',
      publicInputs: [seed, BigInt(count)],
      priority: options?.priority ?? 'high',
      metadata: {
        random_count: count.toString(),
      },
    });

    const proof = await this.waitForProof(job.jobId);

    // Parse random values from proof data
    // The proof contains the VRF outputs
    const randomValues: bigint[] = [];
    // Implementation would parse proof.proofData for random outputs

    return { proof, randomValues };
  }

  /**
   * Generate cross-chain bridge proof
   */
  async proveBridge(
    sourceChain: string,
    txHash: string,
    blockHeaders: string[],
    options?: {
      priority?: ProofJobPriority;
    }
  ): Promise<ProofResult> {
    const publicInputs = [
      BigInt(sourceChain),
      BigInt(txHash),
      ...blockHeaders.map((h) => BigInt(h)),
    ];

    const job = await this.submitProofJob({
      proofType: 'cross_chain_bridge',
      publicInputs,
      priority: options?.priority ?? 'critical',
      metadata: {
        source_chain: sourceChain,
        tx_hash: txHash,
      },
    });

    return this.waitForProof(job.jobId);
  }

  /**
   * Aggregate multiple proofs into one (recursive proving)
   */
  async aggregateProofs(
    proofHashes: string[],
    options?: {
      priority?: ProofJobPriority;
    }
  ): Promise<ProofResult> {
    const publicInputs = proofHashes.map((h) => BigInt(h));

    const job = await this.submitProofJob({
      proofType: 'recursive_aggregation',
      publicInputs,
      priority: options?.priority ?? 'high',
      metadata: {
        proof_count: proofHashes.length.toString(),
      },
    });

    return this.waitForProof(job.jobId);
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  private async fetch(path: string, init?: RequestInit): Promise<any> {
    const url = `${this.config.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      ...init,
      headers: { ...headers, ...init?.headers },
      signal: AbortSignal.timeout(this.config.timeout ?? 30000),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.message ?? `HTTP ${response.status}: ${response.statusText}`
      );
    }

    return response.json();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new STWO Prover Client
 */
export function createStwoProverClient(
  config: StwoProverConfig
): StwoProverClient {
  return new StwoProverClient(config);
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

export const PROOF_TYPES = {
  BATCH_PAYMENTS: 'batch_payments' as ProofType,
  AI_INFERENCE: 'ai_inference' as ProofType,
  CROSS_CHAIN_BRIDGE: 'cross_chain_bridge' as ProofType,
  DEFI_CALCULATION: 'defi_calculation' as ProofType,
  GAME_STATE: 'game_state' as ProofType,
  VRF_RANDOMNESS: 'vrf_randomness' as ProofType,
  KYC_VERIFICATION: 'kyc_verification' as ProofType,
  SUPPLY_CHAIN: 'supply_chain' as ProofType,
  RECURSIVE_AGGREGATION: 'recursive_aggregation' as ProofType,
  CUSTOM: 'custom' as ProofType,
};

export const GPU_TIERS = {
  H100: 'H100' as GpuTier,
  H200: 'H200' as GpuTier,
  B200: 'B200' as GpuTier,
  A100: 'A100' as GpuTier,
  RTX_4090: '4090' as GpuTier,
  AUTO: 'auto' as GpuTier,
};
