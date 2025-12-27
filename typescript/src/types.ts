/**
 * BitSage SDK Types
 */

/** Job identifier */
export type JobId = string;

/** Worker identifier */
export type WorkerId = string;

/** Job types supported by BitSage network */
export type JobType =
  | { type: 'ai_inference'; model_type: string; batch_size: number }
  | { type: 'zk_proof'; circuit_type: string; proof_system: string }
  | { type: 'computer_vision'; model_name: string; input_format: string }
  | { type: 'data_pipeline'; pipeline_type: string; tee_required: boolean }
  | { type: 'render_3d'; resolution: string; frames: number }
  | { type: 'video_processing'; codec: string; operation: string }
  | { type: 'custom'; name: string; parallelizable: boolean };

/** Job status */
export type JobStatus =
  | 'pending'
  | 'assigned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

/** GPU tier classification */
export type GpuTier =
  | 'consumer'
  | 'workstation'
  | 'data_center'
  | 'enterprise'
  | 'frontier';

/** Worker status */
export type WorkerStatus = 'available' | 'busy' | 'offline' | 'suspended';

/** Proof verification status */
export type ProofVerificationStatus = 'pending' | 'verified' | 'failed';

/** Worker capabilities */
export interface WorkerCapabilities {
  gpu_model: string;
  gpu_memory_gb: number;
  cpu_cores: number;
  ram_gb: number;
  has_tee: boolean;
  tee_type?: string;
  supported_job_types: string[];
}

/** Worker information */
export interface WorkerInfo {
  id: WorkerId;
  address: string;
  capabilities: WorkerCapabilities;
  status: WorkerStatus;
  reputation: number;
  stake_amount: bigint;
  gpu_tier: GpuTier;
  registered_at: Date;
}

/** Proof details */
export interface ProofDetails {
  proof_hash: string;
  job_id: JobId;
  proof_type: string;
  verification_status: ProofVerificationStatus;
  created_at: Date;
  verified_at?: Date;
  gas_cost?: bigint;
}

/** Network statistics */
export interface NetworkStats {
  total_workers: number;
  active_workers: number;
  total_jobs_completed: bigint;
  jobs_in_progress: number;
  total_compute_hours: number;
  average_job_duration_secs: number;
  network_utilization: number;
}

/** Staking information */
export interface StakeInfo {
  staked_amount: bigint;
  locked_until?: Date;
  pending_rewards: bigint;
  total_rewards_claimed: bigint;
  gpu_tier: GpuTier;
  is_slashable: boolean;
}

/** Faucet status */
export interface FaucetStatus {
  can_claim: boolean;
  time_until_next_claim_secs: number;
  last_claim_at?: Date;
  total_claimed: bigint;
  claim_amount: bigint;
}

/** Submit job request */
export interface SubmitJobRequest {
  job_type: JobType;
  input_data: string;
  max_cost_sage: bigint;
  max_duration_secs: number;
  priority: number;
  require_tee: boolean;
  deadline?: Date;
  callback_url?: string;
}

/** Submit job response */
export interface SubmitJobResponse {
  job_id: JobId;
  status: JobStatus;
  estimated_cost_sage: bigint;
  estimated_completion_secs?: number;
  queue_position?: number;
}

/** Job status response */
export interface JobStatusResponse {
  job_id: JobId;
  status: JobStatus;
  worker_id?: WorkerId;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
  result_hash?: string;
}

/** Job result */
export interface JobResult {
  job_id: JobId;
  output_data?: string;
  output_files: string[];
  execution_time_secs: number;
  actual_cost_sage: bigint;
  proof_hash?: string;
  worker_id: WorkerId;
  error?: string;
}

/** List jobs parameters */
export interface ListJobsParams {
  limit?: number;
  offset?: number;
  status?: JobStatus;
}

/** List jobs response */
export interface ListJobsResponse {
  jobs: JobStatusResponse[];
  total: bigint;
  has_more: boolean;
}

/** Faucet claim response */
export interface FaucetClaimResponse {
  success: boolean;
  amount: bigint;
  transaction_hash: string;
}

/** Get minimum stake for GPU tier */
export function getMinStake(tier: GpuTier): bigint {
  switch (tier) {
    case 'consumer':
      return 1000n;
    case 'workstation':
      return 2500n;
    case 'data_center':
      return 5000n;
    case 'enterprise':
      return 10000n;
    case 'frontier':
      return 25000n;
  }
}

/** Get GPU tier from model name */
export function getGpuTier(model: string): GpuTier {
  const lower = model.toLowerCase();
  if (lower.includes('b200')) return 'frontier';
  if (lower.includes('h100') || lower.includes('h200')) return 'enterprise';
  if (lower.includes('a100')) return 'data_center';
  if (lower.includes('a6000') || lower.includes('l40')) return 'workstation';
  return 'consumer';
}
