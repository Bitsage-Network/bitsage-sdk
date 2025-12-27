/**
 * BitSage SDK
 *
 * Official TypeScript SDK for interacting with the BitSage Network.
 *
 * @example
 * ```typescript
 * import { BitSageClient } from '@bitsage/sdk';
 *
 * const client = new BitSageClient();
 *
 * // Submit an AI inference job
 * const response = await client.submitJob({
 *   job_type: { type: 'ai_inference', model_type: 'llama-7b', batch_size: 1 },
 *   input_data: btoa('Hello, BitSage!'),
 *   max_cost_sage: 100n,
 *   max_duration_secs: 3600,
 *   priority: 5,
 *   require_tee: false,
 * });
 *
 * console.log('Job submitted:', response.job_id);
 *
 * // Wait for completion
 * const result = await client.waitForCompletion(response.job_id);
 * console.log('Result:', result);
 * ```
 *
 * @packageDocumentation
 */

export { BitSageClient, DEFAULT_CONFIG, SdkError } from './client';
export type { ClientConfig, Network, WalletConfig } from './client';

export type {
  JobId,
  WorkerId,
  JobType,
  JobStatus,
  GpuTier,
  WorkerStatus,
  ProofVerificationStatus,
  WorkerCapabilities,
  WorkerInfo,
  ProofDetails,
  NetworkStats,
  StakeInfo,
  FaucetStatus,
  SubmitJobRequest,
  SubmitJobResponse,
  JobStatusResponse,
  JobResult,
  ListJobsParams,
  ListJobsResponse,
  FaucetClaimResponse,
} from './types';

export { getMinStake, getGpuTier } from './types';
