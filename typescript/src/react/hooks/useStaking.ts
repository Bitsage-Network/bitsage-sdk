/**
 * Staking Hooks
 * React hooks for staking operations
 */

import { useState, useCallback, useEffect } from 'react';
import { useBitSage } from '../providers/BitSageProvider';
import type {
  GpuTier,
  WorkerTier,
  WorkerStake,
  StakingConfig,
  SlashRecord,
  DisputeRecord,
  UnstakeRequest,
  WorkerTierBenefits,
} from '../../modules/staking';
import type { StakeInfo } from '../../types/generated/staking';

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
 * Mutation state for async operations
 */
interface MutationState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Transaction result
 */
interface TxResult {
  transaction_hash: string;
  status: 'pending' | 'accepted' | 'rejected';
}

/**
 * Hook to get stake info for an address
 *
 * @param address - Address to get stake info for
 *
 * @example
 * ```tsx
 * function StakeInfo({ address }: { address: string }) {
 *   const { data, isLoading } = useStakeInfo(address);
 *
 *   return (
 *     <div>
 *       <p>Staked: {data?.amount.toString()} SAGE</p>
 *       <p>GPU Tier: {data?.gpu_tier}</p>
 *       <p>Active: {data?.is_active ? 'Yes' : 'No'}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useStakeInfo(address: string | undefined): QueryState<StakeInfo> {
  const { staking } = useBitSage();
  const [state, setState] = useState<QueryState<StakeInfo>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!address) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await staking.getStakeInfo(address);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch stake info');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [staking, address]);

  useEffect(() => {
    if (address) {
      fetch();
    }
  }, [address, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to stake tokens
 *
 * @example
 * ```tsx
 * function StakeForm() {
 *   const { stake, isLoading, error } = useStake();
 *
 *   const handleStake = async () => {
 *     await stake(1000n * 10n ** 18n, 'DataCenter');
 *   };
 *
 *   return (
 *     <button onClick={handleStake} disabled={isLoading}>
 *       {isLoading ? 'Staking...' : 'Stake 1000 SAGE'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useStake(): MutationState<TxResult> & {
  stake: (amount: bigint, gpuTier: GpuTier) => Promise<TxResult>;
  stakeWithTee: (amount: bigint, gpuTier: GpuTier, hasTee: boolean) => Promise<TxResult>;
} {
  const { staking } = useBitSage();
  const [state, setState] = useState<MutationState<TxResult>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const stake = useCallback(
    async (amount: bigint, gpuTier: GpuTier): Promise<TxResult> => {
      setState({ data: null, isLoading: true, error: null });

      try {
        const response = await staking.stake(amount, gpuTier);
        setState({ data: response, isLoading: false, error: null });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to stake');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [staking]
  );

  const stakeWithTee = useCallback(
    async (amount: bigint, gpuTier: GpuTier, hasTee: boolean): Promise<TxResult> => {
      setState({ data: null, isLoading: true, error: null });

      try {
        const response = await staking.stakeWithTEE(amount, gpuTier, hasTee);
        setState({ data: response, isLoading: false, error: null });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to stake with TEE');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [staking]
  );

  return { ...state, stake, stakeWithTee };
}

/**
 * Hook to unstake tokens
 *
 * @example
 * ```tsx
 * function UnstakeForm() {
 *   const { unstake, isLoading } = useUnstake();
 *
 *   return (
 *     <button onClick={() => unstake(500n * 10n ** 18n)} disabled={isLoading}>
 *       Unstake 500 SAGE
 *     </button>
 *   );
 * }
 * ```
 */
export function useUnstake(): MutationState<TxResult> & {
  unstake: (amount: bigint) => Promise<TxResult>;
} {
  const { staking } = useBitSage();
  const [state, setState] = useState<MutationState<TxResult>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const unstake = useCallback(
    async (amount: bigint): Promise<TxResult> => {
      setState({ data: null, isLoading: true, error: null });

      try {
        const response = await staking.requestUnstake(amount);
        setState({ data: response, isLoading: false, error: null });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to unstake');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [staking]
  );

  return { ...state, unstake };
}

/**
 * Hook to claim staking rewards
 *
 * @example
 * ```tsx
 * function ClaimButton() {
 *   const { claim, isLoading, data } = useClaimRewards();
 *
 *   return (
 *     <div>
 *       <button onClick={claim} disabled={isLoading}>
 *         {isLoading ? 'Claiming...' : 'Claim Rewards'}
 *       </button>
 *       {data && <p>Claimed! TX: {data.transaction_hash}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useClaimRewards(): MutationState<TxResult> & {
  claim: () => Promise<TxResult>;
} {
  const { staking } = useBitSage();
  const [state, setState] = useState<MutationState<TxResult>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const claim = useCallback(async (): Promise<TxResult> => {
    setState({ data: null, isLoading: true, error: null });

    try {
      const response = await staking.claimRewards();
      setState({ data: response, isLoading: false, error: null });
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to claim rewards');
      setState({ data: null, isLoading: false, error });
      throw error;
    }
  }, [staking]);

  return { ...state, claim };
}

/**
 * Hook to get staking configuration
 *
 * @example
 * ```tsx
 * function StakingConfig() {
 *   const { data } = useStakingConfig();
 *
 *   return (
 *     <div>
 *       <p>Min stake (Consumer): {data?.minStake.Consumer.toString()}</p>
 *       <p>Unstake lockup: {data?.unstakeLockupSecs}s</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useStakingConfig(): QueryState<StakingConfig> {
  const { staking } = useBitSage();
  const [state, setState] = useState<QueryState<StakingConfig>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await staking.getStakingConfig();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch config');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [staking]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get worker tier
 *
 * @param workerAddress - Worker address
 *
 * @example
 * ```tsx
 * function WorkerTierDisplay({ address }: { address: string }) {
 *   const { data } = useWorkerTier(address);
 *
 *   return <p>Worker Tier: {data || 'Loading...'}</p>;
 * }
 * ```
 */
export function useWorkerTier(workerAddress: string | undefined): QueryState<WorkerTier> {
  const { staking } = useBitSage();
  const [state, setState] = useState<QueryState<WorkerTier>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!workerAddress) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await staking.getWorkerTier(workerAddress);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch worker tier');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [staking, workerAddress]);

  useEffect(() => {
    if (workerAddress) {
      fetch();
    }
  }, [workerAddress, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get worker tier benefits
 *
 * @param tier - Worker tier
 *
 * @example
 * ```tsx
 * function TierBenefits({ tier }: { tier: WorkerTier }) {
 *   const { data } = useWorkerTierBenefits(tier);
 *
 *   return (
 *     <div>
 *       <p>Fee discount: {data?.feeDiscountBps}bps</p>
 *       <p>Priority boost: {data?.priorityBoost}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useWorkerTierBenefits(
  tier: WorkerTier | undefined
): QueryState<WorkerTierBenefits> {
  const { staking } = useBitSage();
  const [state, setState] = useState<QueryState<WorkerTierBenefits>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!tier) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await staking.getWorkerTierBenefits(tier);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch tier benefits');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [staking, tier]);

  useEffect(() => {
    if (tier) {
      fetch();
    }
  }, [tier, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get minimum stake for a GPU tier
 *
 * @param gpuTier - GPU tier
 * @param hasTee - Whether worker has TEE
 * @param reputation - Worker reputation score
 *
 * @example
 * ```tsx
 * function MinStake() {
 *   const { data } = useMinStake('DataCenter', true, 95);
 *
 *   return <p>Minimum stake: {data?.toString()} SAGE</p>;
 * }
 * ```
 */
export function useMinStake(
  gpuTier: GpuTier | undefined,
  hasTee: boolean = false,
  reputation: number = 50
): QueryState<bigint> {
  const { staking } = useBitSage();
  const [state, setState] = useState<QueryState<bigint>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!gpuTier) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await staking.getMinStake(gpuTier, hasTee, reputation);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch min stake');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [staking, gpuTier, hasTee, reputation]);

  useEffect(() => {
    if (gpuTier) {
      fetch();
    }
  }, [gpuTier, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get pending unstake requests
 *
 * @param address - Address to get requests for
 *
 * @example
 * ```tsx
 * function PendingUnstakes({ address }: { address: string }) {
 *   const { data, isLoading } = usePendingUnstakes(address);
 *
 *   return (
 *     <ul>
 *       {data?.map((req) => (
 *         <li key={req.request_id.toString()}>
 *           {req.amount.toString()} SAGE - unlocks at {new Date(req.unlock_time * 1000).toLocaleString()}
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function usePendingUnstakes(
  address: string | undefined
): QueryState<UnstakeRequest[]> {
  const { staking } = useBitSage();
  const [state, setState] = useState<QueryState<UnstakeRequest[]>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!address) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await staking.getUnstakeRequests(address);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch pending unstakes');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [staking, address]);

  useEffect(() => {
    if (address) {
      fetch();
    }
  }, [address, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to delegate stake to a worker
 *
 * @example
 * ```tsx
 * function DelegateForm() {
 *   const { delegate, isLoading } = useDelegateStake();
 *
 *   return (
 *     <button onClick={() => delegate('0x...worker', 100n * 10n ** 18n)}>
 *       Delegate 100 SAGE
 *     </button>
 *   );
 * }
 * ```
 */
export function useDelegateStake(): MutationState<TxResult> & {
  delegate: (worker: string, amount: bigint) => Promise<TxResult>;
} {
  const { staking } = useBitSage();
  const [state, setState] = useState<MutationState<TxResult>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const delegate = useCallback(
    async (worker: string, amount: bigint): Promise<TxResult> => {
      setState({ data: null, isLoading: true, error: null });

      try {
        const response = await staking.delegateStake(worker, amount);
        setState({ data: response, isLoading: false, error: null });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delegate');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [staking]
  );

  return { ...state, delegate };
}

/**
 * Hook to get total staked amount
 *
 * @example
 * ```tsx
 * function TotalStaked() {
 *   const { data } = useTotalStaked();
 *
 *   return <p>Total staked: {data?.toString()} SAGE</p>;
 * }
 * ```
 */
export function useTotalStaked(): QueryState<bigint> {
  const { staking } = useBitSage();
  const [state, setState] = useState<QueryState<bigint>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await staking.getTotalStaked();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch total staked');
      setState((prev) => ({ ...prev, isLoading: false, error }));
    }
  }, [staking]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Combined hook for current user's staking status
 *
 * @example
 * ```tsx
 * function MyStaking() {
 *   const { address } = useWallet();
 *   const { stakeInfo, tier, pendingUnstakes, isLoading } = useMyStaking();
 *
 *   return (
 *     <div>
 *       <p>Staked: {stakeInfo?.amount.toString()}</p>
 *       <p>Tier: {tier}</p>
 *       <p>Pending unstakes: {pendingUnstakes?.length || 0}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useMyStaking(): {
  stakeInfo: StakeInfo | null;
  tier: WorkerTier | null;
  pendingUnstakes: UnstakeRequest[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const { address } = useBitSage();

  const stake = useStakeInfo(address || undefined);
  const tier = useWorkerTier(address || undefined);
  const pending = usePendingUnstakes(address || undefined);

  const isLoading = stake.isLoading || tier.isLoading || pending.isLoading;
  const error = stake.error || tier.error || pending.error;

  const refetch = useCallback(async () => {
    await Promise.all([stake.refetch(), tier.refetch(), pending.refetch()]);
  }, [stake.refetch, tier.refetch, pending.refetch]);

  return {
    stakeInfo: stake.data,
    tier: tier.data,
    pendingUnstakes: pending.data,
    isLoading,
    error,
    refetch,
  };
}
