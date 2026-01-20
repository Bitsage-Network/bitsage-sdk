import { getConfig, getNetwork, type Network } from './config.js';

// Re-export contract addresses from SDK
import {
  SEPOLIA_CONTRACTS,
  MAINNET_CONTRACTS,
  LOCAL_CONTRACTS,
  getContractsForNetwork as sdkGetContracts,
} from '@bitsage/sdk';

export { SEPOLIA_CONTRACTS, MAINNET_CONTRACTS, LOCAL_CONTRACTS };

export function getContractsForNetwork(network?: Network) {
  const net = network || getNetwork();
  return sdkGetContracts(net);
}

// Minimal ABIs for CLI operations
export const FAUCET_ABI = [
  {
    name: 'claim',
    type: 'function',
    inputs: [],
    outputs: [{ name: 'amount', type: 'felt' }],
    state_mutability: 'external',
  },
  {
    name: 'get_claim_cooldown',
    type: 'function',
    inputs: [{ name: 'address', type: 'felt' }],
    outputs: [{ name: 'remaining_seconds', type: 'felt' }],
    state_mutability: 'view',
  },
  {
    name: 'get_claim_amount',
    type: 'function',
    inputs: [],
    outputs: [{ name: 'amount', type: 'felt' }],
    state_mutability: 'view',
  },
];

export const STAKING_ABI = [
  {
    name: 'stake',
    type: 'function',
    inputs: [{ name: 'amount', type: 'Uint256' }],
    outputs: [],
    state_mutability: 'external',
  },
  {
    name: 'unstake',
    type: 'function',
    inputs: [{ name: 'amount', type: 'Uint256' }],
    outputs: [],
    state_mutability: 'external',
  },
  {
    name: 'claim_rewards',
    type: 'function',
    inputs: [],
    outputs: [{ name: 'amount', type: 'Uint256' }],
    state_mutability: 'external',
  },
  {
    name: 'get_stake',
    type: 'function',
    inputs: [{ name: 'address', type: 'felt' }],
    outputs: [{ name: 'amount', type: 'Uint256' }],
    state_mutability: 'view',
  },
  {
    name: 'get_pending_rewards',
    type: 'function',
    inputs: [{ name: 'address', type: 'felt' }],
    outputs: [{ name: 'amount', type: 'Uint256' }],
    state_mutability: 'view',
  },
];

export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'felt' }],
    outputs: [{ name: 'balance', type: 'Uint256' }],
    state_mutability: 'view',
  },
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'felt' },
      { name: 'amount', type: 'Uint256' },
    ],
    outputs: [{ name: 'success', type: 'felt' }],
    state_mutability: 'external',
  },
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'recipient', type: 'felt' },
      { name: 'amount', type: 'Uint256' },
    ],
    outputs: [{ name: 'success', type: 'felt' }],
    state_mutability: 'external',
  },
];

export const WORKER_REGISTRY_ABI = [
  {
    name: 'register_worker',
    type: 'function',
    inputs: [
      { name: 'worker_id', type: 'felt' },
      { name: 'capabilities', type: 'WorkerCapabilities' },
    ],
    outputs: [],
    state_mutability: 'external',
  },
  {
    name: 'get_worker',
    type: 'function',
    inputs: [{ name: 'worker_id', type: 'felt' }],
    outputs: [{ name: 'worker', type: 'WorkerInfo' }],
    state_mutability: 'view',
  },
];

export function getContractAddress(name: keyof typeof SEPOLIA_CONTRACTS): string {
  const config = getConfig();
  const contracts = config.contracts as Record<string, string>;

  // Map CLI contract names to SDK contract names
  const contractMap: Record<string, string> = {
    job_manager: 'jobManager',
    staking: 'staking',
    faucet: 'faucet',
    sage_token: 'sageToken',
  };

  const sdkName = contractMap[name] || name;

  // Check local config first
  if (contracts[name] && contracts[name] !== '0x0') {
    return contracts[name];
  }

  // Fall back to SDK contracts
  const sdkContracts = getContractsForNetwork();
  return (sdkContracts as Record<string, string>)[sdkName] || '0x0';
}
