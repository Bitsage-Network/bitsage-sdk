/**
 * Privacy Hooks
 * React hooks for privacy operations (uses PrivacyProvider)
 */

import { useState, useCallback, useEffect } from 'react';
import { usePrivacy } from '../providers/PrivacyProvider';
import { useBitSage } from '../providers/BitSageProvider';
import type {
  PrivacyAsset,
  PrivateAccount,
  EncryptedBalance,
  StealthAddress,
} from '../../modules/privacy';
import type { PrivacyKeyPair } from '../../types/generated/privacy';

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
 * Hook to get private account info
 */
export function usePrivateAccount(): QueryState<PrivateAccount> {
  const { account, privacy } = usePrivacy();
  const { address } = useBitSage();
  const [state, setState] = useState<QueryState<PrivateAccount>>({
    data: account,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!privacy || !address) return;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await privacy.getAccount(address);
      setState((prev) => ({ ...prev, data: response, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to fetch account'),
      }));
    }
  }, [privacy, address]);

  useEffect(() => {
    setState((prev) => ({ ...prev, data: account }));
  }, [account]);

  return { ...state, refetch: fetch };
}

/**
 * Hook to get decrypted private balance
 */
export function usePrivateBalance(
  asset: PrivacyAsset = 'SAGE'
): QueryState<bigint> & { encrypted: EncryptedBalance | null } {
  const { getDecryptedBalance, balances, hasKeys } = usePrivacy();
  const [state, setState] = useState<QueryState<bigint>>({
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  });

  const fetch = useCallback(async () => {
    if (!hasKeys) {
      setState((prev) => ({
        ...prev,
        error: new Error('Privacy keys not loaded'),
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const balance = await getDecryptedBalance(asset);
      setState((prev) => ({ ...prev, data: balance, isLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err : new Error('Failed to decrypt balance'),
      }));
    }
  }, [getDecryptedBalance, hasKeys, asset]);

  useEffect(() => {
    if (hasKeys) fetch();
  }, [hasKeys, fetch]);

  return { ...state, refetch: fetch, encrypted: balances.get(asset) || null };
}

/** Transfer parameters for private transfers */
interface PrivateTransferInput {
  to: string;
  amount: bigint;
  keys: PrivacyKeyPair;
}

/**
 * Hook for private transfers
 */
export function usePrivateTransfer(): MutationState<TxResult> & {
  transfer: (params: PrivateTransferInput) => Promise<TxResult>;
} {
  const { privacy, hasKeys } = usePrivacy();
  const [state, setState] = useState<MutationState<TxResult>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const transfer = useCallback(
    async (params: PrivateTransferInput): Promise<TxResult> => {
      if (!privacy || !hasKeys) {
        throw new Error('Privacy not initialized');
      }

      setState({ data: null, isLoading: true, error: null });
      try {
        const response = await privacy.privateTransfer(params);
        setState({ data: response, isLoading: false, error: null });
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Transfer failed');
        setState({ data: null, isLoading: false, error });
        throw error;
      }
    },
    [privacy, hasKeys]
  );

  return { ...state, transfer };
}

/**
 * Hook to register a private account
 */
export function useRegisterPrivateAccount(): MutationState<TxResult> & {
  register: () => Promise<TxResult>;
} {
  const { privacy, publicKey, hasKeys } = usePrivacy();
  const [state, setState] = useState<MutationState<TxResult>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const register = useCallback(async (): Promise<TxResult> => {
    if (!privacy || !hasKeys || !publicKey) {
      throw new Error('Privacy keys not loaded');
    }

    setState({ data: null, isLoading: true, error: null });
    try {
      const response = await privacy.registerAccount(publicKey);
      setState({ data: response, isLoading: false, error: null });
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Registration failed');
      setState({ data: null, isLoading: false, error });
      throw error;
    }
  }, [privacy, publicKey, hasKeys]);

  return { ...state, register };
}

/**
 * Hook to generate stealth address
 */
export function useStealthAddress(): {
  generate: (recipientPublicKey: { x: bigint; y: bigint }) => Promise<StealthAddress>;
  isLoading: boolean;
  error: Error | null;
} {
  const { privacy, hasKeys } = usePrivacy();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generate = useCallback(
    async (recipientPublicKey: { x: bigint; y: bigint }): Promise<StealthAddress> => {
      if (!privacy || !hasKeys) {
        throw new Error('Privacy not initialized');
      }

      setIsLoading(true);
      setError(null);
      try {
        const address = await privacy.generateStealthAddress(recipientPublicKey);
        setIsLoading(false);
        return address;
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Generation failed');
        setError(e);
        setIsLoading(false);
        throw e;
      }
    },
    [privacy, hasKeys]
  );

  return { generate, isLoading, error };
}

/**
 * Hook to refresh all private balances
 */
export function useRefreshPrivateBalances(): {
  refresh: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
} {
  const { refreshBalances } = usePrivacy();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await refreshBalances();
      setIsLoading(false);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Refresh failed');
      setError(e);
      setIsLoading(false);
    }
  }, [refreshBalances]);

  return { refresh, isLoading, error };
}

/**
 * Hook to get all private balances
 */
export function useAllPrivateBalances(): {
  balances: Map<PrivacyAsset, { encrypted: EncryptedBalance; decrypted: bigint | null }>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const { balances, getDecryptedBalance, hasKeys, refreshBalances } = usePrivacy();
  const [decryptedBalances, setDecryptedBalances] = useState<
    Map<PrivacyAsset, { encrypted: EncryptedBalance; decrypted: bigint | null }>
  >(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadBalances = useCallback(async () => {
    if (!hasKeys) return;

    setIsLoading(true);
    setError(null);

    const newBalances = new Map<
      PrivacyAsset,
      { encrypted: EncryptedBalance; decrypted: bigint | null }
    >();

    const assets: PrivacyAsset[] = ['SAGE', 'USDC', 'STRK', 'WBTC', 'ETH'];

    for (const asset of assets) {
      const encrypted = balances.get(asset);
      if (encrypted) {
        try {
          const decrypted = await getDecryptedBalance(asset);
          newBalances.set(asset, { encrypted, decrypted });
        } catch {
          newBalances.set(asset, { encrypted, decrypted: null });
        }
      }
    }

    setDecryptedBalances(newBalances);
    setIsLoading(false);
  }, [balances, getDecryptedBalance, hasKeys]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const refresh = useCallback(async () => {
    await refreshBalances();
    await loadBalances();
  }, [refreshBalances, loadBalances]);

  return { balances: decryptedBalances, isLoading, error, refresh };
}
