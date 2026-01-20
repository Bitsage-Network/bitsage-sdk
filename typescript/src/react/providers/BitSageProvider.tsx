/**
 * BitSage Provider
 * Main context provider for BitSage SDK in React applications
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { BitSageClient, type ClientConfig, type Network } from '../../client';
import { HttpClient, type HttpConfig } from '../../transport/http-client';
import { ContractClient, type ContractConfig } from '../../transport/contract-client';
import { getContractsForNetwork, type ContractRegistry } from '../../contracts';

// Module clients
import { MiningClient } from '../../modules/mining';
import { DashboardClient } from '../../modules/dashboard';
import { BatchClient } from '../../modules/batch';
import { PaymentsClient } from '../../modules/payments';
import { StakingClient } from '../../modules/staking';
import { WorkersClient } from '../../modules/workers';
import { GovernanceClient } from '../../modules/governance';
import { StwoClient } from '../../modules/stwo';
import { TeeClient } from '../../modules/tee';

/**
 * Wallet configuration for signing transactions
 */
export interface WalletConfig {
  /** Account address */
  address: string;
  /** Private key for signing (or use external signer) */
  privateKey?: string;
}

/**
 * BitSage SDK context value
 */
export interface BitSageContextValue {
  /** Main BitSage client */
  client: BitSageClient;
  /** HTTP client for API calls */
  http: HttpClient;
  /** Contract client for on-chain interactions */
  contract: ContractClient;
  /** Contract addresses for current network */
  contracts: ContractRegistry;
  /** Current network */
  network: Network;
  /** Whether wallet is connected */
  isConnected: boolean;
  /** Connected wallet address */
  address: string | null;
  /** Connect wallet */
  connect: (wallet: WalletConfig) => void;
  /** Disconnect wallet */
  disconnect: () => void;

  // Module clients
  mining: MiningClient;
  dashboard: DashboardClient;
  batch: BatchClient;
  payments: PaymentsClient;
  staking: StakingClient;
  workers: WorkersClient;
  governance: GovernanceClient;
  stwo: StwoClient;
  tee: TeeClient;
}

/**
 * BitSage Provider props
 */
export interface BitSageProviderProps {
  /** Child components */
  children: ReactNode;
  /** Network to connect to */
  network?: Network;
  /** API base URL override */
  apiUrl?: string;
  /** RPC URL override */
  rpcUrl?: string;
  /** Initial wallet configuration */
  wallet?: WalletConfig;
  /** HTTP client config overrides */
  httpConfig?: Partial<HttpConfig>;
  /** Contract client config overrides */
  contractConfig?: Partial<ContractConfig>;
}

// Create context with undefined default
const BitSageContext = createContext<BitSageContextValue | undefined>(undefined);

/**
 * Get default API URL for network
 */
function getDefaultApiUrl(network: Network): string {
  switch (network) {
    case 'mainnet':
      return 'https://api.bitsage.network';
    case 'sepolia':
      return 'https://api.sepolia.bitsage.network';
    case 'local':
      return 'http://localhost:8080';
    default:
      return 'https://api.sepolia.bitsage.network';
  }
}

/**
 * Get default RPC URL for network
 */
function getDefaultRpcUrl(network: Network): string {
  switch (network) {
    case 'mainnet':
      return 'https://starknet-mainnet.public.blastapi.io';
    case 'sepolia':
      return 'https://starknet-sepolia.public.blastapi.io';
    case 'local':
      return 'http://localhost:5050';
    default:
      return 'https://starknet-sepolia.public.blastapi.io';
  }
}

/**
 * BitSage Provider Component
 *
 * Provides SDK context to React application including:
 * - Main BitSage client
 * - Module-specific clients (mining, staking, etc.)
 * - Wallet connection management
 * - Network configuration
 *
 * @example
 * ```tsx
 * import { BitSageProvider } from '@bitsage/sdk/react';
 *
 * function App() {
 *   return (
 *     <BitSageProvider network="sepolia">
 *       <MyComponent />
 *     </BitSageProvider>
 *   );
 * }
 * ```
 */
export function BitSageProvider({
  children,
  network = 'sepolia',
  apiUrl,
  rpcUrl,
  wallet: initialWallet,
  httpConfig,
  contractConfig,
}: BitSageProviderProps): JSX.Element {
  // Wallet state
  const [walletState, setWalletState] = useState<WalletConfig | null>(
    initialWallet || null
  );

  // Resolve URLs
  const resolvedApiUrl = apiUrl || getDefaultApiUrl(network);
  const resolvedRpcUrl = rpcUrl || getDefaultRpcUrl(network);

  // Get contract addresses for network
  const contracts = useMemo(() => getContractsForNetwork(network), [network]);

  // Create HTTP client
  const http = useMemo(
    () =>
      new HttpClient({
        baseUrl: resolvedApiUrl,
        ...httpConfig,
      }),
    [resolvedApiUrl, httpConfig]
  );

  // Create contract client
  const contract = useMemo(() => {
    const config: Partial<ContractConfig> = {
      rpcUrl: resolvedRpcUrl,
      network,
      ...contractConfig,
    };

    if (walletState) {
      config.accountAddress = walletState.address;
      if (walletState.privateKey) {
        config.privateKey = walletState.privateKey;
      }
    }

    return new ContractClient(config);
  }, [resolvedRpcUrl, network, walletState, contractConfig]);

  // Create main BitSage client
  const client = useMemo(() => {
    const config: ClientConfig = {
      apiUrl: resolvedApiUrl,
      starknetRpcUrl: resolvedRpcUrl,
      timeout: 30000,
      network,
    };

    return new BitSageClient(config);
  }, [resolvedApiUrl, resolvedRpcUrl, network]);

  // Create module clients
  const mining = useMemo(
    () =>
      new MiningClient(http, contract, {
        contractAddress: contracts.miningRewards,
      }),
    [http, contract, contracts]
  );

  const dashboard = useMemo(
    () => new DashboardClient(http),
    [http]
  );

  const batch = useMemo(
    () => new BatchClient(http),
    [http]
  );

  const payments = useMemo(
    () =>
      new PaymentsClient(http, contract, {
        paymentRouterAddress: contracts.paymentRouter,
        proofGatedPaymentAddress: contracts.proofGatedPayment,
      }),
    [http, contract, contracts]
  );

  const staking = useMemo(
    () =>
      new StakingClient(http, contract, {
        proverStakingAddress: contracts.proverStaking,
        cdcPoolAddress: contracts.cdcPool,
      }),
    [http, contract, contracts]
  );

  const workers = useMemo(
    () =>
      new WorkersClient(http, contract, {
        cdcPoolAddress: contracts.cdcPool,
        reputationManagerAddress: contracts.reputationManager,
      }),
    [http, contract, contracts]
  );

  const governance = useMemo(
    () =>
      new GovernanceClient(http, contract, {
        sageTokenAddress: contracts.sageToken,
        governanceAddress: contracts.sageToken, // Governance is part of token contract
      }),
    [http, contract, contracts]
  );

  const stwo = useMemo(
    () =>
      new StwoClient(http, contract, {
        stwoVerifierAddress: contracts.stwoVerifier,
        optimisticTeeAddress: contracts.optimisticTee,
      }),
    [http, contract, contracts]
  );

  const tee = useMemo(
    () =>
      new TeeClient(http, contract, {
        optimisticTeeAddress: contracts.optimisticTee,
      }),
    [http, contract, contracts]
  );

  // Wallet connection handlers
  const connect = useCallback((wallet: WalletConfig) => {
    setWalletState(wallet);
  }, []);

  const disconnect = useCallback(() => {
    setWalletState(null);
  }, []);

  // Context value
  const value = useMemo<BitSageContextValue>(
    () => ({
      client,
      http,
      contract,
      contracts,
      network,
      isConnected: walletState !== null,
      address: walletState?.address || null,
      connect,
      disconnect,
      mining,
      dashboard,
      batch,
      payments,
      staking,
      workers,
      governance,
      stwo,
      tee,
    }),
    [
      client,
      http,
      contract,
      contracts,
      network,
      walletState,
      connect,
      disconnect,
      mining,
      dashboard,
      batch,
      payments,
      staking,
      workers,
      governance,
      stwo,
      tee,
    ]
  );

  return (
    <BitSageContext.Provider value={value}>
      {children}
    </BitSageContext.Provider>
  );
}

/**
 * Hook to access BitSage SDK context
 *
 * @throws Error if used outside of BitSageProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { client, isConnected, connect } = useBitSage();
 *
 *   if (!isConnected) {
 *     return <button onClick={() => connect({ address: '0x...' })}>Connect</button>;
 *   }
 *
 *   return <div>Connected!</div>;
 * }
 * ```
 */
export function useBitSage(): BitSageContextValue {
  const context = useContext(BitSageContext);

  if (context === undefined) {
    throw new Error('useBitSage must be used within a BitSageProvider');
  }

  return context;
}

/**
 * Hook to access the main BitSage client
 */
export function useBitSageClient(): BitSageClient {
  const { client } = useBitSage();
  return client;
}

/**
 * Hook to access wallet connection state
 */
export function useWallet(): {
  isConnected: boolean;
  address: string | null;
  connect: (wallet: WalletConfig) => void;
  disconnect: () => void;
} {
  const { isConnected, address, connect, disconnect } = useBitSage();
  return { isConnected, address, connect, disconnect };
}

/**
 * Hook to access current network
 */
export function useNetwork(): Network {
  const { network } = useBitSage();
  return network;
}

/**
 * Hook to access contract addresses
 */
export function useContracts(): ContractRegistry {
  const { contracts } = useBitSage();
  return contracts;
}

export { BitSageContext };
