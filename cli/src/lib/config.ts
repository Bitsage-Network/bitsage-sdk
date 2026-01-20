import Conf from 'conf';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export type Network = 'mainnet' | 'sepolia' | 'local';

export interface BitsageConfig {
  network: {
    name: Network;
    coordinator_url: string;
    starknet_rpc: string;
  };
  wallet: {
    address: string;
    keystore_path: string;
  };
  worker: {
    id: string;
    enabled: boolean;
    gpu_enabled: boolean;
    listen_port: number;
  };
  contracts: {
    job_manager: string;
    staking: string;
    faucet: string;
    sage_token: string;
  };
}

// Default RPC URLs
export const DEFAULT_RPC_URLS: Record<Network, string> = {
  mainnet: 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_7',
  sepolia: 'https://rpc.starknet-testnet.lava.build',
  local: 'http://localhost:5050',
};

// Bootstrap coordinators
export const BOOTSTRAP_COORDINATORS: Record<Network, string[]> = {
  mainnet: [
    'https://coordinator.bitsage.network',
    'https://coordinator-us.bitsage.network',
    'https://coordinator-eu.bitsage.network',
  ],
  sepolia: [
    'https://coordinator-sepolia.bitsage.network',
    'http://localhost:8080',
  ],
  local: ['http://localhost:8080'],
};

// Contract addresses per network
export const CONTRACT_ADDRESSES: Record<Network, BitsageConfig['contracts']> = {
  sepolia: {
    job_manager: '0x00bf025663b8a7c7e43393f082b10afe66bd9ddb06fb5e521e3adbcf693094bd',
    staking: '0x28caa5962266f2bf9320607da6466145489fed9dae8e346473ba1e847437613',
    faucet: '0x0',
    sage_token: '0x0',
  },
  mainnet: {
    job_manager: '0x0',
    staking: '0x0',
    faucet: '0x0',
    sage_token: '0x0',
  },
  local: {
    job_manager: '0x0',
    staking: '0x0',
    faucet: '0x0',
    sage_token: '0x0',
  },
};

const CONFIG_DIR = join(homedir(), '.bitsage');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const KEYSTORE_DIR = join(CONFIG_DIR, 'keystores');

// Local config store using Conf
const store = new Conf<BitsageConfig>({
  projectName: 'bitsage',
  cwd: CONFIG_DIR,
  defaults: {
    network: {
      name: 'sepolia',
      coordinator_url: BOOTSTRAP_COORDINATORS.sepolia[0],
      starknet_rpc: DEFAULT_RPC_URLS.sepolia,
    },
    wallet: {
      address: '',
      keystore_path: '',
    },
    worker: {
      id: '',
      enabled: false,
      gpu_enabled: false,
      listen_port: 8081,
    },
    contracts: CONTRACT_ADDRESSES.sepolia,
  },
});

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(KEYSTORE_DIR)) {
    mkdirSync(KEYSTORE_DIR, { recursive: true });
  }
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getKeystoreDir(): string {
  return KEYSTORE_DIR;
}

export function getConfig(): BitsageConfig {
  return store.store;
}

export function setConfig(config: Partial<BitsageConfig>): void {
  if (config.network) {
    store.set('network', { ...store.get('network'), ...config.network });
  }
  if (config.wallet) {
    store.set('wallet', { ...store.get('wallet'), ...config.wallet });
  }
  if (config.worker) {
    store.set('worker', { ...store.get('worker'), ...config.worker });
  }
  if (config.contracts) {
    store.set('contracts', { ...store.get('contracts'), ...config.contracts });
  }
}

export function getNetwork(): Network {
  return store.get('network.name') as Network;
}

export function setNetwork(network: Network): void {
  store.set('network.name', network);
  store.set('network.starknet_rpc', DEFAULT_RPC_URLS[network]);
  store.set('network.coordinator_url', BOOTSTRAP_COORDINATORS[network][0]);
  store.set('contracts', CONTRACT_ADDRESSES[network]);
}

export function getWalletAddress(): string {
  return store.get('wallet.address');
}

export function setWalletAddress(address: string): void {
  store.set('wallet.address', address);
}

export function getKeystorePath(): string {
  return store.get('wallet.keystore_path');
}

export function setKeystorePath(path: string): void {
  store.set('wallet.keystore_path', path);
}

export function getCoordinatorUrl(): string {
  return store.get('network.coordinator_url');
}

export function setCoordinatorUrl(url: string): void {
  store.set('network.coordinator_url', url);
}

export function getStarknetRpcUrl(): string {
  return store.get('network.starknet_rpc');
}

export function setStarknetRpcUrl(url: string): void {
  store.set('network.starknet_rpc', url);
}

export function getWorkerId(): string {
  return store.get('worker.id');
}

export function setWorkerId(id: string): void {
  store.set('worker.id', id);
}

export function isConfigured(): boolean {
  const config = getConfig();
  return !!(config.wallet.address && config.network.coordinator_url);
}

export function isWalletConfigured(): boolean {
  return !!getWalletAddress();
}

export function clearConfig(): void {
  store.clear();
}

// Export for testing
export { store, CONFIG_DIR, CONFIG_FILE };
