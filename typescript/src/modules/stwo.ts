/**
 * STWO Verifier Module
 * STWO proof verification, GPU-TEE proofs, and batch verification
 */

import { HttpClient } from '../transport/http-client';
import { ContractClient, toFelt } from '../transport/contract-client';
import type { TransactionReceipt } from '../transport/contract-client';
import type {
  VerificationStatus,
  ProofSource,
  TeeType,
  TeeAttestation,
  ProofMetadata,
  GpuTeeProofParams,
  BatchStatus,
  ProofJobSpec,
  ProofType,
  ProofPriority,
  ProofSubmission,
  ProverMetrics,
  CompressionStats,
  CompressedProof,
  EnclaveInfo,
} from '../types/generated/proofs';

import { VERIFICATION_CONFIG } from '../types/generated/proofs';

export interface StwoClientConfig {
  /** STWO verifier contract address */
  stwoVerifierAddress: string;
  /** Optimistic TEE contract address */
  optimisticTeeAddress?: string;
  /** Batch verifier contract address */
  batchVerifierAddress?: string;
}

/** Transaction result */
export interface TransactionResult {
  transaction_hash: string;
  status: 'pending' | 'accepted' | 'rejected';
  receipt?: TransactionReceipt;
}

/** Challenge submission parameters */
export interface ChallengeParams {
  /** Proof hash to challenge */
  proof_hash: bigint;
  /** Challenge stake (wei) */
  stake: bigint;
  /** Fraud proof data */
  fraud_proof: string[];
  /** Challenge reason */
  reason: string;
}

/** Challenge status */
export interface ChallengeStatus {
  /** Challenge ID */
  challenge_id: bigint;
  /** Challenged proof hash */
  proof_hash: bigint;
  /** Challenger address */
  challenger: string;
  /** Challenge stake */
  stake: bigint;
  /** Status */
  status: 'Pending' | 'Resolved' | 'Rejected' | 'Slashed';
  /** Submitted at */
  submitted_at: number;
  /** Resolution timestamp */
  resolved_at?: number;
  /** Challenge upheld */
  upheld?: boolean;
}

/**
 * STWO Verifier Client
 *
 * Full STWO proof verification including:
 * - Standard proof submission and verification
 * - GPU-TEE optimistic proofs with challenge window
 * - Batch verification for multiple proofs
 * - Proof compression (zstd, lz4, snappy)
 * - Enclave whitelist management
 * - Prover metrics and statistics
 *
 * @example
 * ```typescript
 * const stwo = new StwoClient(httpClient, contractClient, config);
 *
 * // Submit a standard proof
 * const proofHash = await stwo.submitProof(proofData, publicInputHash);
 *
 * // Verify the proof
 * const isValid = await stwo.verifyProof(proofHash);
 *
 * // Submit GPU-TEE proof (optimistic)
 * await stwo.submitGpuTeeProof({
 *   proof_data: proofData,
 *   public_input_hash: publicInputHash,
 *   tee_type: 3, // NvidiaCC
 *   enclave_measurement: measurement,
 *   quote_hash: quoteHash,
 *   attestation_timestamp: Date.now(),
 * });
 *
 * // Check if proof is finalized
 * const metadata = await stwo.getProofMetadata(proofHash);
 * if (metadata.status === 'Verified') {
 *   console.log('Proof verified!');
 * }
 * ```
 */
export class StwoClient {
  private http: HttpClient;
  private contract: ContractClient;
  private config: StwoClientConfig;

  constructor(
    http: HttpClient,
    contract: ContractClient,
    config: StwoClientConfig
  ) {
    this.http = http;
    this.contract = contract;
    this.config = config;
  }

  // =========================================================================
  // Standard Proof Operations
  // =========================================================================

  /**
   * Submit a proof for verification
   *
   * @param proofData - Serialized proof data
   * @param publicInputHash - Hash of public inputs
   * @returns Proof hash
   */
  async submitProof(proofData: string[], publicInputHash: bigint): Promise<string> {
    const result = await this.contract.invokeAndWait(
      this.config.stwoVerifierAddress,
      'submit_proof',
      [toFelt(publicInputHash), toFelt(proofData.length), ...proofData]
    );

    // Return transaction hash as proof identifier
    return result.transaction_hash;
  }

  /**
   * Verify a submitted proof
   *
   * @param proofHash - Hash of the proof
   * @returns Whether proof is valid
   */
  async verifyProof(proofHash: string): Promise<boolean> {
    const response = await this.http.post<{ verified: boolean }>(
      '/api/proofs/verify',
      { proof_hash: proofHash }
    );
    return response.verified;
  }

  /**
   * Submit and verify proof in one operation
   *
   * @param proofData - Serialized proof data
   * @param publicInputHash - Hash of public inputs
   * @param jobId - Associated job ID
   * @returns Whether proof was verified
   */
  async submitAndVerifyProof(
    proofData: string[],
    publicInputHash: bigint,
    jobId: bigint
  ): Promise<boolean> {
    const result = await this.contract.invokeAndWait(
      this.config.stwoVerifierAddress,
      'submit_and_verify',
      [toFelt(jobId), toFelt(publicInputHash), toFelt(proofData.length), ...proofData]
    );

    // Check if transaction succeeded
    return result.status === 'accepted';
  }

  /**
   * Get proof metadata
   *
   * @param proofHash - Hash of the proof
   * @returns Proof metadata
   */
  async getProofMetadata(proofHash: string): Promise<ProofMetadata> {
    const response = await this.http.get<{
      proof_hash: string;
      public_input_hash: string;
      security_bits: number;
      submitted_at: number;
      submitter: string;
      status: string;
      source: string;
      tee_attestation?: {
        tee_type: string;
        enclave_measurement: string;
        quote_hash: string;
        attestation_timestamp: number;
        is_whitelisted: boolean;
      };
      verified_at?: number;
      gas_used?: string;
      challenge_window_end?: number;
    }>(`/api/proofs/${proofHash}`);

    return {
      proof_hash: BigInt(response.proof_hash),
      public_input_hash: BigInt(response.public_input_hash),
      security_bits: response.security_bits,
      submitted_at: response.submitted_at,
      submitter: response.submitter,
      status: response.status as VerificationStatus,
      source: response.source as ProofSource,
      tee_attestation: response.tee_attestation
        ? {
            tee_type: response.tee_attestation.tee_type as TeeType,
            enclave_measurement: BigInt(response.tee_attestation.enclave_measurement),
            quote_hash: BigInt(response.tee_attestation.quote_hash),
            attestation_timestamp: response.tee_attestation.attestation_timestamp,
            is_whitelisted: response.tee_attestation.is_whitelisted,
          }
        : undefined,
      verified_at: response.verified_at,
      gas_used: response.gas_used ? BigInt(response.gas_used) : undefined,
      challenge_window_end: response.challenge_window_end,
    };
  }

  /**
   * Check if proof is verified
   *
   * @param proofHash - Hash of the proof
   * @returns Whether proof is verified
   */
  async isProofVerified(proofHash: string): Promise<boolean> {
    const metadata = await this.getProofMetadata(proofHash);
    return metadata.status === 'Verified';
  }

  // =========================================================================
  // GPU-TEE Proofs
  // =========================================================================

  /**
   * Submit a GPU-TEE proof (optimistic verification)
   *
   * @param params - GPU-TEE proof parameters
   * @returns Proof hash
   */
  async submitGpuTeeProof(params: GpuTeeProofParams): Promise<string> {
    if (!this.config.optimisticTeeAddress) {
      throw new Error('Optimistic TEE contract not configured');
    }

    const result = await this.contract.invokeAndWait(
      this.config.optimisticTeeAddress,
      'submit_gpu_tee_proof',
      [
        toFelt(params.public_input_hash),
        toFelt(params.tee_type),
        toFelt(params.enclave_measurement),
        toFelt(params.quote_hash),
        toFelt(params.attestation_timestamp),
        toFelt(params.proof_data.length),
        ...params.proof_data,
      ]
    );

    return result.transaction_hash;
  }

  /**
   * Finalize a GPU-TEE proof after challenge window
   *
   * @param proofHash - Hash of the proof
   * @returns Whether finalization succeeded
   */
  async finalizeGpuTeeProof(proofHash: string): Promise<boolean> {
    if (!this.config.optimisticTeeAddress) {
      throw new Error('Optimistic TEE contract not configured');
    }

    const result = await this.contract.invokeAndWait(
      this.config.optimisticTeeAddress,
      'finalize_proof',
      [proofHash]
    );

    return result.status === 'accepted';
  }

  /**
   * Challenge a GPU-TEE proof with fraud proof
   *
   * @param params - Challenge parameters
   * @returns Transaction result with challenge ID
   */
  async challengeGpuTeeProof(params: ChallengeParams): Promise<TransactionResult> {
    if (!this.config.optimisticTeeAddress) {
      throw new Error('Optimistic TEE contract not configured');
    }

    if (params.stake < VERIFICATION_CONFIG.MIN_CHALLENGE_STAKE) {
      throw new Error(
        `Minimum challenge stake is ${VERIFICATION_CONFIG.MIN_CHALLENGE_STAKE / 10n ** 18n} SAGE`
      );
    }

    return this.contract.invokeAndWait(
      this.config.optimisticTeeAddress,
      'challenge_proof',
      [
        toFelt(params.proof_hash),
        toFelt(params.stake),
        params.reason,
        toFelt(params.fraud_proof.length),
        ...params.fraud_proof,
      ]
    );
  }

  /**
   * Get challenge status
   *
   * @param challengeId - Challenge ID
   * @returns Challenge status
   */
  async getChallengeStatus(challengeId: bigint): Promise<ChallengeStatus> {
    const response = await this.http.get<{
      challenge_id: string;
      proof_hash: string;
      challenger: string;
      stake: string;
      status: string;
      submitted_at: number;
      resolved_at?: number;
      upheld?: boolean;
    }>(`/api/proofs/challenges/${challengeId}`);

    return {
      challenge_id: BigInt(response.challenge_id),
      proof_hash: BigInt(response.proof_hash),
      challenger: response.challenger,
      stake: BigInt(response.stake),
      status: response.status as ChallengeStatus['status'],
      submitted_at: response.submitted_at,
      resolved_at: response.resolved_at,
      upheld: response.upheld,
    };
  }

  /**
   * Check if proof can be finalized
   *
   * @param proofHash - Hash of the proof
   * @returns Finalization status
   */
  async canFinalizeProof(proofHash: string): Promise<{
    can_finalize: boolean;
    reason?: string;
    time_remaining_secs?: number;
  }> {
    const metadata = await this.getProofMetadata(proofHash);

    if (metadata.status !== 'OptimisticPending') {
      return {
        can_finalize: false,
        reason: `Proof status is ${metadata.status}`,
      };
    }

    if (!metadata.challenge_window_end) {
      return {
        can_finalize: false,
        reason: 'No challenge window set',
      };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now < metadata.challenge_window_end) {
      return {
        can_finalize: false,
        reason: 'Challenge window not ended',
        time_remaining_secs: metadata.challenge_window_end - now,
      };
    }

    return { can_finalize: true };
  }

  // =========================================================================
  // Batch Operations
  // =========================================================================

  /**
   * Verify multiple proofs in batch
   *
   * @param batchHash - Hash identifying the batch
   * @param proofs - Array of proof data arrays
   * @returns Whether batch verification succeeded
   */
  async verifyBatch(batchHash: string, proofs: string[][]): Promise<boolean> {
    if (!this.config.batchVerifierAddress) {
      throw new Error('Batch verifier contract not configured');
    }

    const result = await this.contract.invokeAndWait(
      this.config.batchVerifierAddress,
      'verify_batch',
      [
        batchHash,
        toFelt(proofs.length),
        ...proofs.flatMap(p => [toFelt(p.length), ...p]),
      ]
    );

    return result.status === 'accepted';
  }

  /**
   * Get batch status
   *
   * @param batchId - Batch ID
   * @returns Batch status
   */
  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const response = await this.http.get<{
      batch_id: string;
      batch_hash: string;
      proof_count: number;
      verified_count: number;
      failed_count: number;
      status: string;
      submitted_at: number;
      completed_at?: number;
      total_gas_used?: string;
    }>(`/api/proofs/batches/${batchId}`);

    return {
      batch_id: response.batch_id,
      batch_hash: BigInt(response.batch_hash),
      proof_count: response.proof_count,
      verified_count: response.verified_count,
      failed_count: response.failed_count,
      status: response.status as BatchStatus['status'],
      submitted_at: response.submitted_at,
      completed_at: response.completed_at,
      total_gas_used: response.total_gas_used
        ? BigInt(response.total_gas_used)
        : undefined,
    };
  }

  /**
   * Submit proofs for batch verification
   *
   * @param proofs - Array of proof submissions
   * @returns Batch ID
   */
  async submitBatch(proofs: ProofSubmission[]): Promise<string> {
    const response = await this.http.post<{ batch_id: string }>(
      '/api/proofs/batches/submit',
      { proofs }
    );
    return response.batch_id;
  }

  // =========================================================================
  // Enclave Management
  // =========================================================================

  /**
   * Check if enclave is whitelisted
   *
   * @param measurement - Enclave measurement hash
   * @returns Whether enclave is whitelisted
   */
  async isEnclaveWhitelisted(measurement: string): Promise<boolean> {
    const response = await this.http.get<{ whitelisted: boolean }>(
      `/api/proofs/enclaves/${measurement}/whitelisted`
    );
    return response.whitelisted;
  }

  /**
   * Get whitelisted enclaves
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
    }>>('/api/proofs/enclaves/whitelisted');

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
   * Get TEE attestation for a proof
   *
   * @param proofHash - Hash of the proof
   * @returns TEE attestation if available
   */
  async getTeeAttestation(proofHash: string): Promise<TeeAttestation | null> {
    const metadata = await this.getProofMetadata(proofHash);
    return metadata.tee_attestation || null;
  }

  // =========================================================================
  // Compression
  // =========================================================================

  /**
   * Compress proof data
   *
   * @param proof - Raw proof data
   * @param algorithm - Compression algorithm
   * @returns Compressed proof
   */
  async compressProof(
    proof: Uint8Array,
    algorithm: 'zstd' | 'lz4' | 'snappy' = 'zstd'
  ): Promise<CompressedProof> {
    const response = await this.http.post<{
      data: string; // base64
      original_size: number;
      compressed_size: number;
      integrity_hash: string;
    }>('/api/proofs/compress', {
      proof: Buffer.from(proof).toString('base64'),
      algorithm,
    });

    return {
      algorithm,
      data: Uint8Array.from(atob(response.data), c => c.charCodeAt(0)),
      original_size: response.original_size,
      integrity_hash: BigInt(response.integrity_hash),
    };
  }

  /**
   * Decompress proof data
   *
   * @param compressed - Compressed proof
   * @returns Decompressed proof data
   */
  async decompressProof(compressed: CompressedProof): Promise<Uint8Array> {
    const response = await this.http.post<{ data: string }>('/api/proofs/decompress', {
      data: Buffer.from(compressed.data).toString('base64'),
      algorithm: compressed.algorithm,
      original_size: compressed.original_size,
    });

    return Uint8Array.from(atob(response.data), c => c.charCodeAt(0));
  }

  /**
   * Get compression stats for a proof
   *
   * @param proofHash - Hash of the proof
   * @returns Compression statistics
   */
  async getCompressionStats(proofHash: string): Promise<CompressionStats | null> {
    try {
      return await this.http.get<CompressionStats>(
        `/api/proofs/${proofHash}/compression`
      );
    } catch {
      return null;
    }
  }

  // =========================================================================
  // Prover Metrics
  // =========================================================================

  /**
   * Get prover metrics for a worker
   *
   * @param workerId - Worker ID
   * @returns Prover metrics
   */
  async getProverMetrics(workerId: string): Promise<ProverMetrics> {
    const response = await this.http.get<{
      worker_id: string;
      total_proofs: string;
      verified_proofs: string;
      failed_proofs: string;
      avg_verification_time_ms: number;
      reputation_score: number;
      total_rewards: string;
    }>(`/api/proofs/metrics/${workerId}`);

    return {
      worker_id: response.worker_id,
      total_proofs: BigInt(response.total_proofs),
      verified_proofs: BigInt(response.verified_proofs),
      failed_proofs: BigInt(response.failed_proofs),
      avg_verification_time_ms: response.avg_verification_time_ms,
      reputation_score: response.reputation_score,
      total_rewards: BigInt(response.total_rewards),
    };
  }

  /**
   * Get proof leaderboard
   *
   * @param limit - Number of entries
   * @returns Leaderboard entries
   */
  async getProofLeaderboard(limit: number = 100): Promise<Array<{
    rank: number;
    worker_id: string;
    verified_proofs: bigint;
    success_rate_bps: number;
    total_rewards: bigint;
  }>> {
    const response = await this.http.get<Array<{
      rank: number;
      worker_id: string;
      verified_proofs: string;
      success_rate_bps: number;
      total_rewards: string;
    }>>(`/api/proofs/leaderboard?limit=${limit}`);

    return response.map(e => ({
      rank: e.rank,
      worker_id: e.worker_id,
      verified_proofs: BigInt(e.verified_proofs),
      success_rate_bps: e.success_rate_bps,
      total_rewards: BigInt(e.total_rewards),
    }));
  }

  // =========================================================================
  // Statistics
  // =========================================================================

  /**
   * Get global proof verification statistics
   *
   * @returns Verification statistics
   */
  async getVerificationStats(): Promise<{
    total_proofs: bigint;
    verified_proofs: bigint;
    failed_proofs: bigint;
    pending_proofs: bigint;
    total_gas_used: bigint;
    avg_verification_time_ms: number;
    standard_proofs: bigint;
    gpu_tee_proofs: bigint;
    challenges_submitted: bigint;
    challenges_upheld: bigint;
  }> {
    const response = await this.http.get<{
      total_proofs: string;
      verified_proofs: string;
      failed_proofs: string;
      pending_proofs: string;
      total_gas_used: string;
      avg_verification_time_ms: number;
      standard_proofs: string;
      gpu_tee_proofs: string;
      challenges_submitted: string;
      challenges_upheld: string;
    }>('/api/proofs/stats');

    return {
      total_proofs: BigInt(response.total_proofs),
      verified_proofs: BigInt(response.verified_proofs),
      failed_proofs: BigInt(response.failed_proofs),
      pending_proofs: BigInt(response.pending_proofs),
      total_gas_used: BigInt(response.total_gas_used),
      avg_verification_time_ms: response.avg_verification_time_ms,
      standard_proofs: BigInt(response.standard_proofs),
      gpu_tee_proofs: BigInt(response.gpu_tee_proofs),
      challenges_submitted: BigInt(response.challenges_submitted),
      challenges_upheld: BigInt(response.challenges_upheld),
    };
  }

  /**
   * Get proof history for a job
   *
   * @param jobId - Job ID
   * @returns Array of proof metadata
   */
  async getJobProofHistory(jobId: bigint): Promise<ProofMetadata[]> {
    const response = await this.http.get<Array<{
      proof_hash: string;
      public_input_hash: string;
      security_bits: number;
      submitted_at: number;
      submitter: string;
      status: string;
      source: string;
      verified_at?: number;
      gas_used?: string;
    }>>(`/api/proofs/jobs/${jobId}/history`);

    return response.map(p => ({
      proof_hash: BigInt(p.proof_hash),
      public_input_hash: BigInt(p.public_input_hash),
      security_bits: p.security_bits,
      submitted_at: p.submitted_at,
      submitter: p.submitter,
      status: p.status as VerificationStatus,
      source: p.source as ProofSource,
      verified_at: p.verified_at,
      gas_used: p.gas_used ? BigInt(p.gas_used) : undefined,
    }));
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Estimate gas for proof verification
   *
   * @param proofSize - Size of proof in bytes
   * @param isGpuTee - Whether it's a GPU-TEE proof
   * @returns Estimated gas
   */
  estimateVerificationGas(proofSize: number, isGpuTee: boolean = false): bigint {
    if (isGpuTee) {
      return VERIFICATION_CONFIG.GPU_TEE_GAS;
    }

    // Standard verification: base gas + gas per byte
    const baseGas = VERIFICATION_CONFIG.STANDARD_GAS;
    const gasPerByte = 100n;
    return baseGas + BigInt(proofSize) * gasPerByte;
  }

  /**
   * Validate proof data before submission
   *
   * @param proofData - Proof data to validate
   * @returns Validation result
   */
  validateProofData(proofData: string[]): {
    valid: boolean;
    error?: string;
  } {
    // Calculate total size
    const totalSize = proofData.reduce((sum, d) => sum + d.length / 2, 0);

    if (totalSize > VERIFICATION_CONFIG.MAX_PROOF_SIZE) {
      return {
        valid: false,
        error: `Proof size ${totalSize} exceeds maximum ${VERIFICATION_CONFIG.MAX_PROOF_SIZE}`,
      };
    }

    // Validate hex format
    for (const data of proofData) {
      if (!/^(0x)?[0-9a-fA-F]*$/.test(data)) {
        return {
          valid: false,
          error: 'Invalid hex format in proof data',
        };
      }
    }

    return { valid: true };
  }

  // =========================================================================
  // ZKML On-Chain Verification
  // =========================================================================

  private zkmlVerifierAddress?: string;

  /**
   * Set the ZKML verifier contract address.
   * Must be called before any ZKML on-chain operations.
   */
  setZkmlVerifier(address: string): void {
    this.zkmlVerifierAddress = address;
  }

  private requireZkmlVerifier(): string {
    if (!this.zkmlVerifierAddress) {
      throw new Error('ZKML verifier not configured — call setZkmlVerifier() first');
    }
    return this.zkmlVerifierAddress;
  }

  /**
   * Register a model on-chain (register_model on the unified verifier).
   */
  async registerZkmlModel(
    modelId: string,
    weightCommitment: string
  ): Promise<TransactionResult> {
    const addr = this.requireZkmlVerifier();
    return this.contract.invokeAndWait(addr, 'register_model', [
      modelId,
      weightCommitment,
    ]);
  }

  /**
   * Submit proof calldata for on-chain verification (verify_model).
   */
  async verifyZkmlModel(
    modelId: string,
    calldata: string[]
  ): Promise<TransactionResult> {
    const addr = this.requireZkmlVerifier();
    return this.contract.invokeAndWait(addr, 'verify_model', [
      modelId,
      toFelt(calldata.length),
      ...calldata,
    ]);
  }

  /**
   * Upload a proof chunk for large proofs that exceed single-tx limits.
   */
  async uploadProofChunk(
    sessionId: string,
    chunkIndex: number,
    data: string[]
  ): Promise<TransactionResult> {
    const addr = this.requireZkmlVerifier();
    return this.contract.invokeAndWait(addr, 'upload_proof_chunk', [
      sessionId,
      toFelt(chunkIndex),
      toFelt(data.length),
      ...data,
    ]);
  }

  /**
   * Read the weight commitment for a registered model.
   */
  async getZkmlModelCommitment(modelId: string): Promise<string | null> {
    const addr = this.requireZkmlVerifier();
    try {
      const result = await this.contract.call(addr, 'get_model_commitment', [modelId]);
      return result?.[0] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get the verification count for a model.
   */
  async getZkmlVerificationCount(modelId: string): Promise<number> {
    const addr = this.requireZkmlVerifier();
    try {
      const result = await this.contract.call(addr, 'get_verification_count', [modelId]);
      return Number(result?.[0] ?? '0');
    } catch {
      return 0;
    }
  }

  /**
   * Check if a specific proof hash has been verified on-chain.
   */
  async isZkmlProofVerified(proofHash: string): Promise<boolean> {
    const addr = this.requireZkmlVerifier();
    try {
      const result = await this.contract.call(addr, 'is_proof_verified', [proofHash]);
      return result?.[0] === '0x1' || result?.[0] === '1';
    } catch {
      return false;
    }
  }

  /**
   * End-to-end: prove via API, then submit on-chain.
   */
  async proveAndVerifyOnChain(
    proverClient: { proveZkml: (req: any, opts?: any) => Promise<any> },
    req: { modelId: string; input?: number[]; gpu?: boolean; security?: string },
    opts?: { pollIntervalMs?: number; timeoutMs?: number }
  ): Promise<TransactionResult> {
    const proof = await proverClient.proveZkml(req, opts);
    return this.verifyZkmlModel(req.modelId, proof.calldata);
  }
}

/**
 * Create a StwoClient instance with individual parameters
 */
export function createStwoClient(
  http: HttpClient,
  contract: ContractClient,
  stwoVerifierAddress: string,
  optimisticTeeAddress?: string,
  batchVerifierAddress?: string
): StwoClient {
  return new StwoClient(http, contract, {
    stwoVerifierAddress,
    optimisticTeeAddress,
    batchVerifierAddress,
  });
}

/** Config for simplified factory function */
export interface StwoClientSimpleConfig {
  baseUrl: string;
  contractAddress: string;
  starknetRpcUrl: string;
  optimisticTeeAddress?: string;
  batchVerifierAddress?: string;
  privateKey?: string;
  accountAddress?: string;
}

/**
 * Create a StwoClient instance with simplified config (auto-creates HTTP and Contract clients)
 */
export function createStwoClientSimple(config: StwoClientSimpleConfig): {
  client: StwoClient;
  http: HttpClient;
  contract: ContractClient;
} {
  const http = new HttpClient({ baseUrl: config.baseUrl });
  const contract = new ContractClient({
    rpcUrl: config.starknetRpcUrl,
    privateKey: config.privateKey,
    accountAddress: config.accountAddress,
  });

  const client = new StwoClient(http, contract, {
    stwoVerifierAddress: config.contractAddress,
    optimisticTeeAddress: config.optimisticTeeAddress,
    batchVerifierAddress: config.batchVerifierAddress,
  });

  return { client, http, contract };
}

// Re-export types and constants
export type {
  VerificationStatus,
  ProofSource,
  TeeType,
  TeeAttestation,
  ProofMetadata,
  GpuTeeProofParams,
  BatchStatus,
  ProofJobSpec,
  ProofType,
  ProofPriority,
  ProofSubmission,
  ProverMetrics,
  CompressionStats,
  CompressedProof,
  EnclaveInfo,
};

export { VERIFICATION_CONFIG };
