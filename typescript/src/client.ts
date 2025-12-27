/**
 * BitSage SDK Client
 */

import type {
  JobId,
  WorkerId,
  JobType,
  GpuTier,
  SubmitJobRequest,
  SubmitJobResponse,
  JobStatusResponse,
  JobResult,
  ListJobsParams,
  ListJobsResponse,
  WorkerInfo,
  ProofDetails,
  NetworkStats,
  StakeInfo,
  FaucetStatus,
  FaucetClaimResponse,
} from './types';

/** Network selection */
export type Network = 'mainnet' | 'sepolia' | 'local';

/** Client configuration */
export interface ClientConfig {
  /** Base URL for BitSage API */
  apiUrl: string;
  /** Starknet RPC URL */
  starknetRpcUrl: string;
  /** Request timeout in ms */
  timeout: number;
  /** Network */
  network: Network;
}

/** Wallet configuration */
export interface WalletConfig {
  privateKey: string;
  accountAddress: string;
}

/** Default configuration for Sepolia testnet */
export const DEFAULT_CONFIG: ClientConfig = {
  apiUrl: 'https://api.bitsage.network',
  starknetRpcUrl: 'https://starknet-sepolia.public.blastapi.io',
  timeout: 30000,
  network: 'sepolia',
};

/** SDK Error */
export class SdkError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'SdkError';
  }
}

/**
 * BitSage SDK Client
 *
 * @example
 * ```typescript
 * const client = new BitSageClient();
 *
 * // Submit a job
 * const response = await client.submitJob({
 *   job_type: { type: 'ai_inference', model_type: 'llama-7b', batch_size: 1 },
 *   input_data: 'base64_data',
 *   max_cost_sage: 100n,
 *   max_duration_secs: 3600,
 *   priority: 5,
 *   require_tee: false,
 * });
 *
 * // Wait for completion
 * const result = await client.waitForCompletion(response.job_id);
 * ```
 */
export class BitSageClient {
  private config: ClientConfig;
  private wallet?: WalletConfig;

  constructor(config: Partial<ClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Set wallet for signing transactions */
  withWallet(wallet: WalletConfig): this {
    this.wallet = wallet;
    return this;
  }

  // =========================================================================
  // Job Operations
  // =========================================================================

  /** Submit a new job */
  async submitJob(request: SubmitJobRequest): Promise<SubmitJobResponse> {
    const response = await this.fetch('/api/jobs/submit', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return response as SubmitJobResponse;
  }

  /** Get job status */
  async getJobStatus(jobId: JobId): Promise<JobStatusResponse> {
    return this.fetch(`/api/jobs/${jobId}`) as Promise<JobStatusResponse>;
  }

  /** Get job result */
  async getJobResult(jobId: JobId): Promise<JobResult> {
    return this.fetch(`/api/jobs/${jobId}/result`) as Promise<JobResult>;
  }

  /** Cancel a job */
  async cancelJob(jobId: JobId): Promise<void> {
    await this.fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
  }

  /** List jobs */
  async listJobs(params: ListJobsParams = {}): Promise<ListJobsResponse> {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.offset) query.set('offset', params.offset.toString());
    if (params.status) query.set('status', params.status);

    const queryStr = query.toString();
    const url = queryStr ? `/api/jobs?${queryStr}` : '/api/jobs';
    return this.fetch(url) as Promise<ListJobsResponse>;
  }

  /** Wait for job completion with polling */
  async waitForCompletion(
    jobId: JobId,
    pollIntervalMs = 1000,
    timeoutSecs = 3600
  ): Promise<JobResult> {
    const start = Date.now();
    const timeoutMs = timeoutSecs * 1000;

    while (Date.now() - start < timeoutMs) {
      const status = await this.getJobStatus(jobId);

      switch (status.status) {
        case 'completed':
          return this.getJobResult(jobId);
        case 'failed':
          throw new SdkError(
            status.error_message || 'Job failed',
            'JOB_FAILED'
          );
        case 'cancelled':
          throw new SdkError('Job was cancelled', 'JOB_CANCELLED');
        case 'timeout':
          throw new SdkError('Job timed out', 'JOB_TIMEOUT');
        default:
          await this.sleep(pollIntervalMs);
      }
    }

    throw new SdkError('Timeout waiting for job completion', 'TIMEOUT');
  }

  /** Stream job status updates (async iterator) */
  async *streamJobStatus(
    jobId: JobId,
    pollIntervalMs = 1000
  ): AsyncIterable<JobStatusResponse> {
    let lastStatus: string | undefined;

    while (true) {
      const status = await this.getJobStatus(jobId);

      if (status.status !== lastStatus) {
        lastStatus = status.status;
        yield status;
      }

      if (['completed', 'failed', 'cancelled', 'timeout'].includes(status.status)) {
        break;
      }

      await this.sleep(pollIntervalMs);
    }
  }

  // =========================================================================
  // Worker Operations
  // =========================================================================

  /** List available workers */
  async listWorkers(): Promise<WorkerInfo[]> {
    return this.fetch('/api/workers') as Promise<WorkerInfo[]>;
  }

  /** Get worker details */
  async getWorker(workerId: WorkerId): Promise<WorkerInfo> {
    return this.fetch(`/api/workers/${workerId}`) as Promise<WorkerInfo>;
  }

  // =========================================================================
  // Proof Operations
  // =========================================================================

  /** Get proof details */
  async getProof(proofHash: string): Promise<ProofDetails> {
    return this.fetch(`/api/proofs/${proofHash}`) as Promise<ProofDetails>;
  }

  /** Verify a proof */
  async verifyProof(proofHash: string): Promise<boolean> {
    const response = await this.fetch(`/api/proofs/${proofHash}/verify`, {
      method: 'POST',
    });
    return (response as { valid: boolean }).valid;
  }

  // =========================================================================
  // Staking Operations
  // =========================================================================

  /** Stake SAGE tokens */
  async stake(amount: bigint, gpuTier: GpuTier): Promise<string> {
    this.requireWallet();
    const response = await this.fetch('/api/staking/stake', {
      method: 'POST',
      body: JSON.stringify({
        address: this.wallet!.accountAddress,
        amount: amount.toString(),
        gpu_tier: gpuTier,
      }),
    });
    return (response as { transaction_hash: string }).transaction_hash;
  }

  /** Unstake SAGE tokens */
  async unstake(amount: bigint): Promise<string> {
    this.requireWallet();
    const response = await this.fetch('/api/staking/unstake', {
      method: 'POST',
      body: JSON.stringify({
        address: this.wallet!.accountAddress,
        amount: amount.toString(),
      }),
    });
    return (response as { transaction_hash: string }).transaction_hash;
  }

  /** Claim staking rewards */
  async claimRewards(): Promise<bigint> {
    this.requireWallet();
    const response = await this.fetch('/api/staking/claim', {
      method: 'POST',
      body: JSON.stringify({
        address: this.wallet!.accountAddress,
      }),
    });
    return BigInt((response as { amount_claimed: string }).amount_claimed);
  }

  /** Get stake information */
  async getStakeInfo(): Promise<StakeInfo> {
    this.requireWallet();
    return this.fetch(
      `/api/staking/info/${this.wallet!.accountAddress}`
    ) as Promise<StakeInfo>;
  }

  // =========================================================================
  // Network Operations
  // =========================================================================

  /** Get network statistics */
  async getNetworkStats(): Promise<NetworkStats> {
    return this.fetch('/api/network/stats') as Promise<NetworkStats>;
  }

  // =========================================================================
  // Faucet Operations (Testnet only)
  // =========================================================================

  /** Claim tokens from faucet */
  async faucetClaim(address: string): Promise<FaucetClaimResponse> {
    if (this.config.network === 'mainnet') {
      throw new SdkError('Faucet is only available on testnet', 'INVALID_NETWORK');
    }

    return this.fetch('/api/faucet/claim', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }) as Promise<FaucetClaimResponse>;
  }

  /** Get faucet status */
  async faucetStatus(address: string): Promise<FaucetStatus> {
    return this.fetch(`/api/faucet/status/${address}`) as Promise<FaucetStatus>;
  }

  // =========================================================================
  // Internal Helpers
  // =========================================================================

  private requireWallet(): void {
    if (!this.wallet) {
      throw new SdkError('Wallet not configured', 'WALLET_REQUIRED');
    }
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<unknown> {
    const url = `${this.config.apiUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new SdkError(
          `API error: ${errorText}`,
          'API_ERROR',
          response.status
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof SdkError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new SdkError('Request timeout', 'TIMEOUT');
      }
      throw new SdkError((error as Error).message, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
