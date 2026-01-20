import { getCoordinatorUrl, BOOTSTRAP_COORDINATORS, getNetwork } from './config.js';
import { logger } from '../utils/logger.js';

export interface CoordinatorHealth {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime_seconds: number;
  workers_online: number;
  jobs_pending: number;
}

export interface WorkerRegistrationRequest {
  worker_id: string;
  wallet_address: string;
  capabilities: {
    gpu_count: number;
    gpu_memory_gb: number;
    gpu_model: string;
    gpu_tier: string;
    tee_type: string;
    cpu_cores: number;
    ram_gb: number;
    max_concurrent_jobs: number;
  };
  public_endpoint?: string;
  p2p_peer_id?: string;
}

export interface WorkerRegistrationResponse {
  success: boolean;
  worker_id: string;
  assigned_jobs: number;
  message?: string;
}

export interface WorkerStatus {
  worker_id: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  jobs_completed: number;
  jobs_in_progress: number;
  total_earnings_sage: string;
  last_heartbeat: string;
  uptime_seconds: number;
}

export interface NetworkStats {
  total_workers: number;
  online_workers: number;
  total_jobs: number;
  pending_jobs: number;
  completed_jobs: number;
  total_proofs_generated: number;
  average_proof_time_ms: number;
}

export interface JobInfo {
  job_id: string;
  status: 'pending' | 'assigned' | 'processing' | 'completed' | 'failed';
  worker_id?: string;
  submitted_at: string;
  completed_at?: string;
  reward_sage?: string;
  proof_hash?: string;
}

let healthyCoordinatorCache: string | null = null;

export async function findHealthyCoordinator(): Promise<string> {
  // Check cached coordinator first
  if (healthyCoordinatorCache) {
    try {
      const health = await checkHealth(healthyCoordinatorCache);
      if (health.status === 'ok') {
        return healthyCoordinatorCache;
      }
    } catch {
      healthyCoordinatorCache = null;
    }
  }

  // Try configured coordinator
  const configuredUrl = getCoordinatorUrl();
  if (configuredUrl) {
    try {
      const health = await checkHealth(configuredUrl);
      if (health.status === 'ok') {
        healthyCoordinatorCache = configuredUrl;
        return configuredUrl;
      }
    } catch {
      logger.debug(`Configured coordinator ${configuredUrl} not healthy`);
    }
  }

  // Try bootstrap coordinators
  const network = getNetwork();
  const bootstrapUrls = BOOTSTRAP_COORDINATORS[network];

  for (const url of bootstrapUrls) {
    try {
      const health = await checkHealth(url);
      if (health.status === 'ok') {
        healthyCoordinatorCache = url;
        logger.debug(`Found healthy coordinator: ${url}`);
        return url;
      }
    } catch {
      logger.debug(`Bootstrap coordinator ${url} not healthy`);
    }
  }

  throw new Error('No healthy coordinator found. Please check your network connection.');
}

export async function checkHealth(coordinatorUrl?: string): Promise<CoordinatorHealth> {
  const url = coordinatorUrl || (await findHealthyCoordinator());

  const response = await fetch(`${url}/health`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<CoordinatorHealth>;
}

export async function registerWorker(
  request: WorkerRegistrationRequest
): Promise<WorkerRegistrationResponse> {
  const url = await findHealthyCoordinator();

  const response = await fetch(`${url}/api/v1/workers/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Worker registration failed: ${response.status} - ${error}`);
  }

  return response.json() as Promise<WorkerRegistrationResponse>;
}

export async function getWorkerStatus(workerId: string): Promise<WorkerStatus> {
  const url = await findHealthyCoordinator();

  const response = await fetch(`${url}/api/v1/workers/${workerId}/status`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get worker status: ${response.status}`);
  }

  return response.json() as Promise<WorkerStatus>;
}

export async function getNetworkStats(): Promise<NetworkStats> {
  const url = await findHealthyCoordinator();

  const response = await fetch(`${url}/api/v1/network/stats`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get network stats: ${response.status}`);
  }

  return response.json() as Promise<NetworkStats>;
}

export async function getJobs(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<JobInfo[]> {
  const url = await findHealthyCoordinator();
  const queryParams = new URLSearchParams();

  if (params?.status) queryParams.set('status', params.status);
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());

  const queryString = queryParams.toString();
  const fullUrl = queryString ? `${url}/api/v1/jobs?${queryString}` : `${url}/api/v1/jobs`;

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get jobs: ${response.status}`);
  }

  return response.json() as Promise<JobInfo[]>;
}

export async function getWorkerEarnings(
  workerId: string,
  walletAddress: string
): Promise<{
  total_earned_sage: string;
  pending_sage: string;
  claimed_sage: string;
  jobs_completed: number;
  average_reward_sage: string;
}> {
  const url = await findHealthyCoordinator();

  const response = await fetch(
    `${url}/api/v1/workers/${workerId}/earnings?wallet=${walletAddress}`,
    {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get earnings: ${response.status}`);
  }

  return response.json();
}

export function clearCoordinatorCache(): void {
  healthyCoordinatorCache = null;
}
