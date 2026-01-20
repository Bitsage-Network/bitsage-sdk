/**
 * Privacy Provider
 * Context provider for Obelysk privacy features
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { useBitSage } from './BitSageProvider';
import {
  PrivacyClient,
  PrivacyKeyManager,
  type PrivacyKeyPair,
  type ECPoint,
  type EncryptedBalance,
  type PrivateAccount,
  type PrivacyAsset,
} from '../../modules/privacy';

/**
 * Privacy context value
 */
export interface PrivacyContextValue {
  /** Privacy client instance */
  privacy: PrivacyClient | null;
  /** Whether privacy keys are loaded */
  hasKeys: boolean;
  /** Public key (if loaded) */
  publicKey: ECPoint | null;
  /** Whether privacy is initializing */
  isInitializing: boolean;
  /** Error message if initialization failed */
  error: string | null;

  // Key management
  /** Generate new privacy keys */
  generateKeys: () => Promise<void>;
  /** Derive keys from wallet signature */
  deriveKeysFromWallet: (signature: string) => Promise<void>;
  /** Load keys from encrypted storage */
  loadKeys: (password: string) => Promise<boolean>;
  /** Store keys to encrypted storage */
  storeKeys: (password: string) => Promise<void>;
  /** Clear loaded keys */
  clearKeys: () => void;

  // Balance operations
  /** Get decrypted balance for current account */
  getDecryptedBalance: (asset?: PrivacyAsset) => Promise<bigint | null>;
  /** Refresh balances */
  refreshBalances: () => Promise<void>;

  // Account state
  /** Private account info */
  account: PrivateAccount | null;
  /** Encrypted balances by asset */
  balances: Map<PrivacyAsset, EncryptedBalance>;
}

/**
 * Privacy Provider props
 */
export interface PrivacyProviderProps {
  /** Child components */
  children: ReactNode;
  /** Auto-load keys from storage on mount */
  autoLoad?: boolean;
  /** Storage key prefix */
  storagePrefix?: string;
}

// Create context
const PrivacyContext = createContext<PrivacyContextValue | undefined>(undefined);

/**
 * Privacy Provider Component
 *
 * Provides privacy key management and encrypted balance operations.
 * Must be used within a BitSageProvider.
 *
 * @example
 * ```tsx
 * import { BitSageProvider, PrivacyProvider } from '@bitsage/sdk/react';
 *
 * function App() {
 *   return (
 *     <BitSageProvider network="sepolia">
 *       <PrivacyProvider>
 *         <PrivacyWallet />
 *       </PrivacyProvider>
 *     </BitSageProvider>
 *   );
 * }
 * ```
 */
export function PrivacyProvider({
  children,
  autoLoad = false,
  storagePrefix = 'bitsage_privacy',
}: PrivacyProviderProps): JSX.Element {
  const { http, contract, contracts, address } = useBitSage();

  // State
  const [keyPair, setKeyPair] = useState<PrivacyKeyPair | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<PrivateAccount | null>(null);
  const [balances, setBalances] = useState<Map<PrivacyAsset, EncryptedBalance>>(
    new Map()
  );

  // Create privacy client when keys are available
  const privacy = useMemo(() => {
    if (!keyPair) return null;

    return new PrivacyClient(http, contract, {
      privacyRouterAddress: contracts.privacyRouter,
      mixingPoolAddress: contracts.privacyRouter,
    });
  }, [http, contract, contracts, keyPair]);

  // Generate new keys
  const generateKeys = useCallback(async () => {
    setIsInitializing(true);
    setError(null);

    try {
      const newKeyPair = await PrivacyKeyManager.generate();
      setKeyPair(newKeyPair);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate keys');
      throw err;
    } finally {
      setIsInitializing(false);
    }
  }, []);

  // Derive keys from wallet signature
  const deriveKeysFromWallet = useCallback(async (signature: string) => {
    setIsInitializing(true);
    setError(null);

    try {
      const derivedKeyPair = await PrivacyKeyManager.deriveFromSignature(signature);
      setKeyPair(derivedKeyPair);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to derive keys');
      throw err;
    } finally {
      setIsInitializing(false);
    }
  }, []);

  // Load keys from storage
  const loadKeys = useCallback(
    async (password: string): Promise<boolean> => {
      setIsInitializing(true);
      setError(null);

      try {
        const storageKey = address
          ? `${storagePrefix}_${address}`
          : storagePrefix;
        const loadedKeyPair = await PrivacyKeyManager.retrieve(
          password,
          { prefix: storageKey }
        );

        if (loadedKeyPair) {
          setKeyPair(loadedKeyPair);
          return true;
        }

        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load keys');
        return false;
      } finally {
        setIsInitializing(false);
      }
    },
    [address, storagePrefix]
  );

  // Store keys to storage
  const storeKeys = useCallback(
    async (password: string) => {
      if (!keyPair) {
        throw new Error('No keys to store');
      }

      try {
        const storageKey = address
          ? `${storagePrefix}_${address}`
          : storagePrefix;
        await PrivacyKeyManager.store(keyPair, password, { prefix: storageKey });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to store keys');
        throw err;
      }
    },
    [keyPair, address, storagePrefix]
  );

  // Clear keys
  const clearKeys = useCallback(() => {
    setKeyPair(null);
    setAccount(null);
    setBalances(new Map());
    setError(null);
  }, []);

  // Get decrypted balance
  const getDecryptedBalance = useCallback(
    async (asset: PrivacyAsset = 'SAGE'): Promise<bigint | null> => {
      if (!privacy || !keyPair || !address) return null;

      try {
        // Get all encrypted balances from contract
        const multiBalances = await privacy.getPrivateBalances(address);
        const encryptedBalance = multiBalances[asset];
        if (!encryptedBalance) return null;

        // Decrypt using private key
        const decrypted = await privacy.revealBalance(
          encryptedBalance,
          keyPair.privateKey
        );

        return decrypted;
      } catch (err) {
        console.error('Failed to decrypt balance:', err);
        return null;
      }
    },
    [privacy, keyPair, address]
  );

  // Refresh balances
  const refreshBalances = useCallback(async () => {
    if (!privacy || !address) return;

    try {
      const multiBalances = await privacy.getPrivateBalances(address);
      const newBalances = new Map<PrivacyAsset, EncryptedBalance>();

      const assets: PrivacyAsset[] = ['SAGE', 'USDC', 'STRK', 'WBTC', 'ETH'];
      for (const asset of assets) {
        const balance = multiBalances[asset];
        if (balance) {
          newBalances.set(asset, balance);
        }
      }

      setBalances(newBalances);
    } catch (err) {
      console.error('Failed to refresh balances:', err);
    }
  }, [privacy, address]);

  // Load account info when keys and address are available
  useEffect(() => {
    if (!privacy || !address) {
      setAccount(null);
      return;
    }

    let cancelled = false;

    async function loadAccount() {
      try {
        const accountInfo = await privacy!.getAccount(address!);
        if (!cancelled) {
          setAccount(accountInfo);
        }
      } catch (err) {
        console.error('Failed to load private account:', err);
      }
    }

    loadAccount();

    return () => {
      cancelled = true;
    };
  }, [privacy, address]);

  // Auto-load keys on mount if enabled
  useEffect(() => {
    if (!autoLoad || !address) return;

    // Check if keys exist in storage (without password)
    const storageKey = `${storagePrefix}_${address}`;
    const hasStoredKeys =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(storageKey) !== null;

    if (hasStoredKeys) {
      // Keys exist but need password to decrypt
      // Consumer should call loadKeys() with password
      console.info('Privacy keys found in storage, call loadKeys() to decrypt');
    }
  }, [autoLoad, address, storagePrefix]);

  // Context value
  const value = useMemo<PrivacyContextValue>(
    () => ({
      privacy,
      hasKeys: keyPair !== null,
      publicKey: keyPair?.publicKey || null,
      isInitializing,
      error,
      generateKeys,
      deriveKeysFromWallet,
      loadKeys,
      storeKeys,
      clearKeys,
      getDecryptedBalance,
      refreshBalances,
      account,
      balances,
    }),
    [
      privacy,
      keyPair,
      isInitializing,
      error,
      generateKeys,
      deriveKeysFromWallet,
      loadKeys,
      storeKeys,
      clearKeys,
      getDecryptedBalance,
      refreshBalances,
      account,
      balances,
    ]
  );

  return (
    <PrivacyContext.Provider value={value}>
      {children}
    </PrivacyContext.Provider>
  );
}

/**
 * Hook to access privacy context
 *
 * @throws Error if used outside of PrivacyProvider
 */
export function usePrivacy(): PrivacyContextValue {
  const context = useContext(PrivacyContext);

  if (context === undefined) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }

  return context;
}

/**
 * Hook to check if privacy keys are available
 */
export function usePrivacyKeys(): {
  hasKeys: boolean;
  publicKey: ECPoint | null;
  generateKeys: () => Promise<void>;
  deriveKeysFromWallet: (signature: string) => Promise<void>;
  clearKeys: () => void;
} {
  const {
    hasKeys,
    publicKey,
    generateKeys,
    deriveKeysFromWallet,
    clearKeys,
  } = usePrivacy();

  return {
    hasKeys,
    publicKey,
    generateKeys,
    deriveKeysFromWallet,
    clearKeys,
  };
}

/**
 * Hook to access privacy client (if keys are loaded)
 */
export function usePrivacyClient(): PrivacyClient | null {
  const { privacy } = usePrivacy();
  return privacy;
}

export { PrivacyContext };
