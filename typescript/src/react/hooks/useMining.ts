/**
 * Mining Hooks
 * React hooks for mining and rewards operations
 */

import { useState, useCallback, useEffect } from 'react';
import { useBitSage } from '../providers/BitSageProvider';
import type {
  StakeTier,
  RewardResult,
  WorkerMiningStats,
  MiningPoolStatus,
} from '../../types/generated/mining';
import type { GpuTier } from '../../types/generated/staking';

/**
 * Query state for data fetching
 */
interface QueryState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to get mining reward estimate
 *
 * @param gpuTier - GPU tier to estimate rewards for
 *
 * @example
 * ```tsx
 * function RewardEstimate() {
 *   const { data, isLoading } = useMiningRewardEstimate('DataCenter');
 *
 *   if (isLoading) return <p>Loading...</p>;
 *
 *   return (
 *     <div>
 *       <p>Estimated reward: {data?.amount.toString()} SAGE</p>
 *       {data?.capped && <p>Daily cap reached!</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMiningRewardEstimate(
  gpuTier: GpuTier | undefined
): QueryState<RewardResult> {
  const { mining } = useBitSage();
  const [state, setState] = useState<QueryState<RewardResult>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!gpuTier) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await mining.getMiningRewardEstimate(gpuTier);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to estimate rewards');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [mining, gpuTier]);

  useEffect(() => {
    if (gpuTier) {
      fetch();
    }
  }, [gpuTier, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get worker mining stats
 *
 * @param workerId - Worker ID to get stats for
 *
 * @example
 * ```tsx
 * function WorkerStats({ workerId }: { workerId: string }) {
 *   const { data, isLoading } = useWorkerMiningStats(workerId);
 *
 *   return (
 *     <div>
 *       <p>Total jobs: {data?.total_jobs.toString()}</p>
 *       <p>Total earned: {data?.total_earned.toString()} SAGE</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useWorkerMiningStats(
  workerId: string | undefined
): QueryState<WorkerMiningStats> {
  const { mining } = useBitSage();
  const [state, setState] = useState<QueryState<WorkerMiningStats>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!workerId) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await mining.getWorkerMiningStats(workerId);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch worker stats');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [mining, workerId]);

  useEffect(() => {
    if (workerId) {
      fetch();
    }
  }, [workerId, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get mining pool status
 *
 * @example
 * ```tsx
 * function PoolStatus() {
 *   const { data, isLoading, refetch } = useMiningPoolStatus();
 *
 *   return (
 *     <div>
 *       <p>Total distributed: {data?.totalDistributed.toString()}</p>
 *       <p>Remaining pool: {data?.remainingPool.toString()}</p>
 *       <p>Current base reward: {data?.currentBaseReward.toString()}</p>
 *       <button onClick={refetch}>Refresh</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useMiningPoolStatus(): QueryState<MiningPoolStatus> {
  const { mining } = useBitSage();
  const [state, setState] = useState<QueryState<MiningPoolStatus>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await mining.getMiningPoolStatus();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch pool status');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [mining]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get daily cap for a stake tier
 *
 * @param stakeTier - Stake tier to get cap for
 *
 * @example
 * ```tsx
 * function DailyCap({ tier }: { tier: StakeTier }) {
 *   const { data, isLoading } = useDailyCap(tier);
 *
 *   return <p>Daily cap: {data?.toString() || 'Loading...'}</p>;
 * }
 * ```
 */
export function useDailyCap(stakeTier: StakeTier | undefined): QueryState<bigint> {
  const { mining } = useBitSage();
  const [state, setState] = useState<QueryState<bigint>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!stakeTier) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await mining.getDailyCap(stakeTier);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch daily cap');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [mining, stakeTier]);

  useEffect(() => {
    if (stakeTier) {
      fetch();
    }
  }, [stakeTier, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get current base reward
 *
 * @example
 * ```tsx
 * function BaseReward() {
 *   const { data, isLoading } = useCurrentBaseReward();
 *
 *   return <p>Base reward: {data?.toString() || 'Loading...'} SAGE</p>;
 * }
 * ```
 */
export function useCurrentBaseReward(): QueryState<bigint> {
  const { mining } = useBitSage();
  const [state, setState] = useState<QueryState<bigint>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await mining.getCurrentBaseReward();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch base reward');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [mining]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get GPU multiplier
 *
 * @param gpuTier - GPU tier to get multiplier for
 *
 * @example
 * ```tsx
 * function GpuMultiplier({ tier }: { tier: GpuTier }) {
 *   const { data } = useGpuMultiplier(tier);
 *
 *   return <p>Multiplier: {data?.toFixed(2) || '1.00'}x</p>;
 * }
 * ```
 */
export function useGpuMultiplier(gpuTier: GpuTier | undefined): QueryState<number> {
  const { mining } = useBitSage();
  const [state, setState] = useState<QueryState<number>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!gpuTier) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await mining.getGPUMultiplier(gpuTier);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch GPU multiplier');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [mining, gpuTier]);

  useEffect(() => {
    if (gpuTier) {
      fetch();
    }
  }, [gpuTier, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get remaining daily cap for a worker
 *
 * @param workerAddress - Worker address
 *
 * @example
 * ```tsx
 * function RemainingCap({ address }: { address: string }) {
 *   const { data, isLoading } = useRemainingDailyCap(address);
 *
 *   return <p>Remaining today: {data?.toString() || '...'} SAGE</p>;
 * }
 * ```
 */
export function useRemainingDailyCap(
  workerAddress: string | undefined
): QueryState<bigint> {
  const { mining } = useBitSage();
  const [state, setState] = useState<QueryState<bigint>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!workerAddress) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await mining.getRemainingDailyCap(workerAddress);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch remaining cap');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [mining, workerAddress]);

  useEffect(() => {
    if (workerAddress) {
      fetch();
    }
  }, [workerAddress, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Combined hook for mining overview
 *
 * @param workerId - Optional worker ID for worker-specific stats
 *
 * @example
 * ```tsx
 * function MiningOverview({ workerId }: { workerId?: string }) {
 *   const { poolStatus, workerStats, baseReward, isLoading } = useMiningOverview(workerId);
 *
 *   return (
 *     <div>
 *       <p>Pool remaining: {poolStatus?.remainingPool.toString()}</p>
 *       <p>Base reward: {baseReward?.toString()}</p>
 *       {workerStats && <p>Your earnings: {workerStats.total_earned.toString()}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMiningOverview(workerId?: string): {
  poolStatus: MiningPoolStatus | null;
  workerStats: WorkerMiningStats | null;
  baseReward: bigint | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const pool = useMiningPoolStatus();
  const worker = useWorkerMiningStats(workerId);
  const base = useCurrentBaseReward();

  const isLoading = pool.isLoading || worker.isLoading || base.isLoading;
  const error = pool.error || worker.error || base.error;

  const refetch = useCallback(async () => {
    await Promise.all([pool.refetch(), worker.refetch(), base.refetch()]);
  }, [pool.refetch, worker.refetch, base.refetch]);

  return {
    poolStatus: pool.data,
    workerStats: worker.data,
    baseReward: base.data,
    isLoading,
    error,
    refetch,
  };
}
