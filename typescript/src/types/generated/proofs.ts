/**
 * STWO Verifier and Proof Types
 * Generated from BitSage-Cairo-Smart-Contracts/src/obelysk/stwo_verifier.cairo
 */

/** Proof verification status */
export type VerificationStatus =
  | 'NotSubmitted'
  | 'Pending'
  | 'Verified'
  | 'Failed'
  | 'Rejected'
  | 'OptimisticPending'
  | 'Challenged';

/** Proof source type */
export type ProofSource =
  | 'StandardSTWO'
  | 'GpuTeeSTWO'
  | 'Unknown';

/** TEE type for GPU attestation */
export type TeeType =
  | 'IntelTDX'      // 1
  | 'AMDSEVSNP'     // 2
  | 'NvidiaCC';     // 3

/** TEE attestation data */
export interface TeeAttestation {
  /** TEE type */
  tee_type: TeeType;
  /** Enclave measurement hash */
  enclave_measurement: bigint;
  /** Quote hash */
  quote_hash: bigint;
  /** Attestation timestamp */
  attestation_timestamp: number;
  /** Whether enclave is whitelisted */
  is_whitelisted: boolean;
}

/** Proof metadata */
export interface ProofMetadata {
  /** Proof hash */
  proof_hash: bigint;
  /** Public input hash */
  public_input_hash: bigint;
  /** Security bits */
  security_bits: number;
  /** Submission timestamp */
  submitted_at: number;
  /** Submitter address */
  submitter: string;
  /** Verification status */
  status: VerificationStatus;
  /** Proof source */
  source: ProofSource;
  /** TEE attestation (if GPU-TEE proof) */
  tee_attestation?: TeeAttestation;
  /** Verification timestamp */
  verified_at?: number;
  /** Gas used for verification */
  gas_used?: bigint;
  /** Challenge window end (for optimistic proofs) */
  challenge_window_end?: number;
}

/** GPU-TEE proof submission parameters */
export interface GpuTeeProofParams {
  /** Proof data (serialized) */
  proof_data: string[];
  /** Public input hash */
  public_input_hash: bigint;
  /** TEE type (1=Intel TDX, 2=AMD SEV-SNP, 3=NVIDIA CC) */
  tee_type: number;
  /** Enclave measurement */
  enclave_measurement: bigint;
  /** Quote hash */
  quote_hash: bigint;
  /** Attestation timestamp */
  attestation_timestamp: number;
}

/** Batch verification status */
export interface BatchStatus {
  /** Batch ID */
  batch_id: string;
  /** Batch hash */
  batch_hash: bigint;
  /** Number of proofs in batch */
  proof_count: number;
  /** Number verified */
  verified_count: number;
  /** Number failed */
  failed_count: number;
  /** Overall status */
  status: 'Pending' | 'InProgress' | 'Completed' | 'PartialFailure' | 'Failed';
  /** Submitted at */
  submitted_at: number;
  /** Completed at */
  completed_at?: number;
  /** Total gas used */
  total_gas_used?: bigint;
}

/** Proof job specification */
export interface ProofJobSpec {
  /** Proof type */
  proof_type: ProofType;
  /** Batch hash (what we're proving) */
  batch_hash: bigint;
  /** Public input hash */
  public_input_hash: bigint;
  /** Priority level */
  priority: ProofPriority;
  /** Base reward in USDC (6 decimals) */
  reward_usdc: bigint;
  /** Bonus in SAGE (wei) */
  bonus_sage: bigint;
  /** Deadline timestamp */
  deadline_timestamp: number;
  /** Required TEE attestations */
  required_attestations: number;
  /** Minimum stake requirement */
  min_stake_requirement: bigint;
}

/** Proof type */
export type ProofType =
  | 'StarknetBatch'
  | 'RecursiveProof'
  | 'ZKMLInference'
  | 'CrossChainBridge'
  | 'ApplicationSpecific';

/** Proof priority level */
export type ProofPriority =
  | 'Standard'
  | 'High'
  | 'Critical'
  | 'Emergency';

/** Proof submission for verification */
export interface ProofSubmission {
  /** Job ID being proven */
  job_id: bigint;
  /** Proof data (serialized) */
  proof_data: string[];
  /** Public inputs */
  public_inputs: bigint[];
  /** Worker address */
  worker: string;
  /** TEE attestation (if using GPU-TEE) */
  tee_attestation?: TeeAttestation;
  /** Computation proof hash */
  computation_proof_hash: bigint;
}

/** Prover metrics */
export interface ProverMetrics {
  /** Worker ID */
  worker_id: string;
  /** Total proofs submitted */
  total_proofs: bigint;
  /** Total verified */
  verified_proofs: bigint;
  /** Total failed */
  failed_proofs: bigint;
  /** Average verification time (ms) */
  avg_verification_time_ms: number;
  /** Current reputation score */
  reputation_score: number;
  /** Total rewards earned (wei) */
  total_rewards: bigint;
}

/** Compression statistics */
export interface CompressionStats {
  /** Original proof size (bytes) */
  original_size: number;
  /** Compressed size (bytes) */
  compressed_size: number;
  /** Compression ratio (0.0-1.0) */
  compression_ratio: number;
  /** Algorithm used */
  algorithm: 'zstd' | 'lz4' | 'snappy';
  /** Compression time (ms) */
  compression_time_ms: number;
}

/** Compressed proof envelope */
export interface CompressedProof {
  /** Algorithm used */
  algorithm: 'zstd' | 'lz4' | 'snappy';
  /** Compressed data */
  data: Uint8Array;
  /** Original size for validation */
  original_size: number;
  /** Integrity hash */
  integrity_hash: bigint;
}

/** TEE result submission */
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

/** TEE quote for attestation */
export interface TeeQuote {
  /** Quote data (raw) */
  quote_data: Uint8Array;
  /** Enclave measurement */
  enclave_measurement: bigint;
  /** Timestamp */
  timestamp: number;
  /** Additional claims */
  claims: Record<string, bigint>;
}

/** Execution metrics from TEE */
export interface ExecutionMetrics {
  /** CPU cycles */
  cpu_cycles: bigint;
  /** Memory peak (bytes) */
  memory_peak: bigint;
  /** Execution time (ms) */
  execution_time_ms: number;
  /** GPU utilization (if applicable) */
  gpu_utilization?: number;
}

/** Enclave information */
export interface EnclaveInfo {
  /** Enclave measurement */
  measurement: bigint;
  /** TEE type */
  tee_type: TeeType;
  /** Whitelisted at */
  whitelisted_at: number;
  /** Whitelisted by */
  whitelisted_by: string;
  /** Is currently valid */
  is_valid: boolean;
  /** Revoked at (if revoked) */
  revoked_at?: number;
}

/** Verification constants */
export const VERIFICATION_CONFIG = {
  /** Standard verification gas estimate */
  STANDARD_GAS: 500_000n,
  /** GPU-TEE verification gas estimate */
  GPU_TEE_GAS: 100_000n,
  /** Challenge period (24 hours) */
  CHALLENGE_PERIOD_SECS: 24 * 60 * 60,
  /** Minimum challenge stake */
  MIN_CHALLENGE_STAKE: 1_000n * 10n ** 18n,
  /** Maximum proof size (256KB) */
  MAX_PROOF_SIZE: 256 * 1024,
  /** Security bits required */
  REQUIRED_SECURITY_BITS: 128
} as const;
