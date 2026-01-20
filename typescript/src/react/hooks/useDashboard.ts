/**
 * Dashboard Hooks
 * React hooks for dashboard and metrics
 */

import { useState, useCallback, useEffect } from 'react';
import { useBitSage } from '../providers/BitSageProvider';
import type {
  ValidatorStatusResponse,
  GpuMetricsResponse,
  RewardsInfo,
  RewardHistoryEntry,
  HistoryPeriod,
  JobAnalytics,
  RecentJob,
  NetworkStats,
  WorkerSummary,
} from '../../modules/dashboard';

interface QueryState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to get validator status
 */
export function useValidatorStatus(options?: {
  pollingInterval?: number;
}): QueryState<ValidatorStatusResponse> {
  const { dashboard } = useBitSage();
  const [state, setState] = useState<QueryState<ValidatorStatusResponse>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await dashboard.getValidatorStatus();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch validator status'),
      }));
    }
  }, [dashboard]);

  useEffect(() => {
    fetch();
    if (options?.pollingInterval) {
      const interval = setInterval(fetch, options.pollingInterval);
      return () => clearInterval(interval);
    }
  }, [fetch, options?.pollingInterval]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get GPU metrics
 */
export function useGpuMetrics(options?: {
  pollingInterval?: number;
}): QueryState<GpuMetricsResponse> {
  const { dashboard } = useBitSage();
  const [state, setState] = useState<QueryState<GpuMetricsResponse>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await dashboard.getGPUMetrics();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch GPU metrics'),
      }));
    }
  }, [dashboard]);

  useEffect(() => {
    fetch();
    if (options?.pollingInterval) {
      const interval = setInterval(fetch, options.pollingInterval);
      return () => clearInterval(interval);
    }
  }, [fetch, options?.pollingInterval]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get rewards info
 */
export function useRewardsInfo(): QueryState<RewardsInfo> {
  const { dashboard } = useBitSage();
  const [state, setState] = useState<QueryState<RewardsInfo>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await dashboard.getRewardsInfo();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch rewards info'),
      }));
    }
  }, [dashboard]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get rewards history
 */
export function useRewardsHistory(period: HistoryPeriod = 'week'): QueryState<RewardHistoryEntry[]> {
  const { dashboard } = useBitSage();
  const [state, setState] = useState<QueryState<RewardHistoryEntry[]>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await dashboard.getRewardsHistory(period);
      setState((prev) => ({ ...prev, data: response.entries, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch rewards history'),
      }));
    }
  }, [dashboard, period]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get job analytics
 */
export function useJobAnalytics(): QueryState<JobAnalytics> {
  const { dashboard } = useBitSage();
  const [state, setState] = useState<QueryState<JobAnalytics>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await dashboard.getJobAnalytics();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch job analytics'),
      }));
    }
  }, [dashboard]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get recent jobs
 */
export function useRecentJobs(limit: number = 10): QueryState<RecentJob[]> {
  const { dashboard } = useBitSage();
  const [state, setState] = useState<QueryState<RecentJob[]>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await dashboard.getRecentJobs(limit);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch recent jobs'),
      }));
    }
  }, [dashboard, limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get network stats
 */
export function useNetworkStats(options?: {
  pollingInterval?: number;
}): QueryState<NetworkStats> {
  const { dashboard } = useBitSage();
  const [state, setState] = useState<QueryState<NetworkStats>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await dashboard.getNetworkStats();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch network stats'),
      }));
    }
  }, [dashboard]);

  useEffect(() => {
    fetch();
    if (options?.pollingInterval) {
      const interval = setInterval(fetch, options.pollingInterval);
      return () => clearInterval(interval);
    }
  }, [fetch, options?.pollingInterval]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get network workers
 */
export function useNetworkWorkers(): QueryState<WorkerSummary[]> {
  const { dashboard } = useBitSage();
  const [state, setState] = useState<QueryState<WorkerSummary[]>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await dashboard.getNetworkWorkers();
      setState((prev) => ({ ...prev, data: response.workers, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch network workers'),
      }));
    }
  }, [dashboard]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Combined dashboard hook for validator overview
 */
export function useValidatorOverview(options?: { pollingInterval?: number }): {
  status: ValidatorStatusResponse | null;
  gpuMetrics: GpuMetricsResponse | null;
  rewards: RewardsInfo | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const status = useValidatorStatus(options);
  const gpu = useGpuMetrics(options);
  const rewards = useRewardsInfo();

  const isLoading = status.isLoading || gpu.isLoading || rewards.isLoading;
  const error = status.error || gpu.error || rewards.error;

  const refetch = useCallback(async () => {
    await Promise.all([status.refetch(), gpu.refetch(), rewards.refetch()]);
  }, [status.refetch, gpu.refetch, rewards.refetch]);

  return {
    status: status.data,
    gpuMetrics: gpu.data,
    rewards: rewards.data,
    isLoading,
    error,
    refetch,
  };
}
