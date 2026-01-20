/**
 * Governance Hooks
 * React hooks for governance operations
 */

import { useState, useCallback, useEffect } from 'react';
import { useBitSage } from '../providers/BitSageProvider';
import type {
  GovernanceProposal,
  GovernanceRights,
  GovernanceStats,
  PoolBalances,
  VestingStatus,
  CreateProposalParams,
  VoteDirection,
  DelegationInfo,
  VoterInfo,
} from '../../modules/governance';

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
 * Hook to get a governance proposal
 */
export function useProposal(proposalId: bigint | undefined): QueryState<GovernanceProposal> {
  const { governance } = useBitSage();
  const [state, setState] = useState<QueryState<GovernanceProposal>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (proposalId === undefined) return;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await governance.getProposal(proposalId);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch proposal'),
      }));
    }
  }, [governance, proposalId]);

  useEffect(() => {
    if (proposalId !== undefined) fetch();
  }, [proposalId, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to list all proposals
 */
export function useProposals(): QueryState<GovernanceProposal[]> {
  const { governance } = useBitSage();
  const [state, setState] = useState<QueryState<GovernanceProposal[]>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await governance.listProposals({ status: 'Active' });
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch proposals'),
      }));
    }
  }, [governance]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to create a proposal
 */
export function useCreateProposal(): MutationState<TxResult> & {
  create: (params: CreateProposalParams) => Promise<TxResult>;
} {
  const { governance } = useBitSage();
  const [state, setState] = useState<MutationState<TxResult>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const create = useCallback(
    async (params: CreateProposalParams): Promise<TxResult> => {
      setState({ data: null, isLoading: true, error: null });
      try {
        const response = await governance.createProposal(params);
        setState({ data: response, isLoading: false, error: null });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create proposal');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [governance]
  );

  return { ...state, create };
}

/**
 * Hook to vote on a proposal
 */
export function useVote(): MutationState<TxResult> & {
  vote: (proposalId: bigint, direction: VoteDirection) => Promise<TxResult>;
} {
  const { governance } = useBitSage();
  const [state, setState] = useState<MutationState<TxResult>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const vote = useCallback(
    async (
      proposalId: bigint,
      direction: VoteDirection
    ): Promise<TxResult> => {
      setState({ data: null, isLoading: true, error: null });
      try {
        const response = await governance.vote(proposalId, direction);
        setState({ data: response, isLoading: false, error: null });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to vote');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [governance]
  );

  return { ...state, vote };
}

/**
 * Hook to get voting power
 */
export function useVotingPower(address: string | undefined): QueryState<bigint> {
  const { governance } = useBitSage();
  const [state, setState] = useState<QueryState<bigint>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!address) return;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await governance.getVotingPower(address);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch voting power'),
      }));
    }
  }, [governance, address]);

  useEffect(() => {
    if (address) fetch();
  }, [address, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get governance rights
 */
export function useGovernanceRights(address: string | undefined): QueryState<GovernanceRights> {
  const { governance } = useBitSage();
  const [state, setState] = useState<QueryState<GovernanceRights>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!address) return;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await governance.getGovernanceRights(address);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch governance rights'),
      }));
    }
  }, [governance, address]);

  useEffect(() => {
    if (address) fetch();
  }, [address, fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to delegate voting power
 */
export function useDelegate(): MutationState<TxResult> & {
  delegate: (delegatee: string) => Promise<TxResult>;
} {
  const { governance } = useBitSage();
  const [state, setState] = useState<MutationState<TxResult>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const delegate = useCallback(
    async (delegatee: string): Promise<TxResult> => {
      setState({ data: null, isLoading: true, error: null });
      try {
        const response = await governance.delegate(delegatee);
        setState({ data: response, isLoading: false, error: null });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delegate');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [governance]
  );

  return { ...state, delegate };
}

/**
 * Hook to get governance stats
 */
export function useGovernanceStats(): QueryState<GovernanceStats> {
  const { governance } = useBitSage();
  const [state, setState] = useState<QueryState<GovernanceStats>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await governance.getGovernanceStats();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch stats'),
      }));
    }
  }, [governance]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get pool balances (treasury, rewards, etc.)
 */
export function usePoolBalances(): QueryState<PoolBalances> {
  const { governance } = useBitSage();
  const [state, setState] = useState<QueryState<PoolBalances>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await governance.getPoolBalances();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch pool balances'),
      }));
    }
  }, [governance]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get total burned tokens
 */
export function useTotalBurned(): QueryState<bigint> {
  const { governance } = useBitSage();
  const [state, setState] = useState<QueryState<bigint>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await governance.getTotalBurned();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch total burned'),
      }));
    }
  }, [governance]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get vesting status
 */
export function useVestingStatus(): QueryState<VestingStatus> {
  const { governance } = useBitSage();
  const [state, setState] = useState<QueryState<VestingStatus>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await governance.getVestingStatus();
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch vesting status'),
      }));
    }
  }, [governance]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { ...state, refetch: fetch };
}
