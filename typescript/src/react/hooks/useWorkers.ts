/**
 * Worker Hooks
 * React hooks for worker operations
 */

import { useState, useCallback, useEffect } from 'react';
import { useBitSage } from '../providers/BitSageProvider';
import type {
  WorkerInfo,
  WorkerProfile,
  LeaderboardEntry,
  LeaderboardMetric,
  RegisterWorkerParams,
  PerformanceData,
  WorkerCapabilities,
} from '../../modules/workers';

interface QueryState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface MutationState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

interface TxResult {
  transaction_hash: string;
  status: 'pending' | 'accepted' | 'rejected';
}

/**
 * Hook to list all workers
 */
export function useWorkers(options?: {
  pollingInterval?: number;
}): QueryState<WorkerInfo[]> {
  const { workers } = useBitSage();
  const [state, setState] = useState<QueryState<WorkerInfo[]>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await workers.listWorkers();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch workers'),
      }));
    }
  }, [workers]);

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
 * Hook to get worker by ID
 */
export function useWorker(workerId: string | undefined): QueryState<WorkerInfo> {
  const { workers } = useBitSage();
  const [state, setState] = useState<QueryState<WorkerInfo>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!workerId) return;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await workers.getWorker(workerId);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch worker'),
      }));
    }
  }, [workers, workerId]);

  useEffect(() => {
    if (workerId) fetch();
  }, [workerId, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get worker profile
 */
export function useWorkerProfile(workerId: string | undefined): QueryState<WorkerProfile> {
  const { workers } = useBitSage();
  const [state, setState] = useState<QueryState<WorkerProfile>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!workerId) return;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await workers.getWorkerProfile(workerId);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch profile'),
      }));
    }
  }, [workers, workerId]);

  useEffect(() => {
    if (workerId) fetch();
  }, [workerId, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get worker leaderboard
 */
export function useLeaderboard(
  metric: LeaderboardMetric = 'reputation',
  limit: number = 100
): QueryState<LeaderboardEntry[]> {
  const { workers } = useBitSage();
  const [state, setState] = useState<QueryState<LeaderboardEntry[]>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await workers.getLeaderboard(metric, limit);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch leaderboard'),
      }));
    }
  }, [workers, metric, limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to register as a worker
 */
export function useRegisterWorker(): MutationState<TxResult> & {
  register: (params: RegisterWorkerParams) => Promise<TxResult>;
} {
  const { workers } = useBitSage();
  const [state, setState] = useState<MutationState<TxResult>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const register = useCallback(
    async (params: RegisterWorkerParams): Promise<TxResult> => {
      setState({ data: null, isLoading: true, error: null });
      try {
        const response = await workers.registerWorker(params);
        setState({ data: response, isLoading: false, error: null });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to register');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [workers]
  );

  return { ...state, register };
}

/**
 * Hook to submit worker heartbeat
 */
export function useHeartbeat(): MutationState<TxResult> & {
  submitHeartbeat: (data: PerformanceData) => Promise<TxResult>;
} {
  const { workers } = useBitSage();
  const [state, setState] = useState<MutationState<TxResult>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const submitHeartbeat = useCallback(
    async (data: PerformanceData): Promise<TxResult> => {
      setState({ data: null, isLoading: true, error: null });
      try {
        const response = await workers.submitHeartbeat(data);
        setState({ data: response, isLoading: false, error: null });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to submit heartbeat');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [workers]
  );

  return { ...state, submitHeartbeat };
}

/**
 * Hook to get workers by capability
 */
export function useWorkersByCapability(
  flags: number,
  minReputation: number = 0
): QueryState<string[]> {
  const { workers } = useBitSage();
  const [state, setState] = useState<QueryState<string[]>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await workers.getWorkersByCapability(flags, minReputation);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch workers'),
      }));
    }
  }, [workers, flags, minReputation]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}
