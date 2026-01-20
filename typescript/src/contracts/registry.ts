/**
 * Contract Address Registry
 * Maintains deployed contract addresses for all networks
 */

/** Contract registry interface */
export interface ContractRegistry {
  /** SAGE ERC20 token */
  sageToken: string;
  /** Prover staking contract */
  proverStaking: string;
  /** Mining rewards contract */
  miningRewards: string;
  /** Job manager contract */
  jobManager: string;
  /** CDC Pool (worker registry) */
  cdcPool: string;
  /** Reputation manager */
  reputationManager: string;
  /** Payment router */
  paymentRouter: string;
  /** Proof-gated payment */
  proofGatedPayment: string;
  /** STWO verifier */
  stwoVerifier: string;
  /** Privacy router (Obelysk) */
  privacyRouter: string;
  /** Optimistic TEE verifier */
  optimisticTee: string;
  /** Faucet (testnet only) */
  faucet?: string;
}

/** Sepolia testnet contract addresses */
export const SEPOLIA_CONTRACTS: ContractRegistry = {
  sageToken: '0x072349097c8a802e7f66dc96b95aca84e4d78ddad22014904076c76293a99850',
  proverStaking: '0x3287a0af5ab2d74fbf968204ce2291adde008d645d42bc363cb741ebfa941b',
  miningRewards: '0x52e086edb779dbe2a9bb2989be63e8847a791cb1628ad5b81e73d6c6f448016',
  jobManager: '0x355b8c5e9dd3310a3c361559b53cfcfdc20b2bf7d5bd87a84a83389b8cbb8d3',
  cdcPool: '0x1f978cad424f87a6cea8aa27cbcbba10b9a50d41e296ae07e1c635392a2339',
  reputationManager: '0x4ef80990256fb016381f57c340a306e37376c1de70fa11147a4f1fc57a834de',
  paymentRouter: '0x6a0639e673febf90b6a6e7d3743c81f96b39a3037b60429d479c62c5d20d41',
  proofGatedPayment: '0x7e74d191b1cca7cac00adc03bc64eaa6236b81001f50c61d1d70ec4bfde8af0',
  stwoVerifier: '0x52963fe2f1d2d2545cbe18b8230b739c8861ae726dc7b6f0202cc17a369bd7d',
  privacyRouter: '0x7d1a6c242a4f0573696e117790f431fd60518a000b85fe5ee507456049ffc53',
  optimisticTee: '0x4238502196d7dab552e2af5d15219c8227c9f4dc69f0df1fa2ca9f8cb29eb33',
  faucet: '0x62d3231450645503345e2e022b60a96aceff73898d26668f3389547a61471d3',
};

/** Mainnet contract addresses (to be updated at launch) */
export const MAINNET_CONTRACTS: ContractRegistry = {
  sageToken: '0x0000000000000000000000000000000000000000000000000000000000000000',
  proverStaking: '0x0000000000000000000000000000000000000000000000000000000000000000',
  miningRewards: '0x0000000000000000000000000000000000000000000000000000000000000000',
  jobManager: '0x0000000000000000000000000000000000000000000000000000000000000000',
  cdcPool: '0x0000000000000000000000000000000000000000000000000000000000000000',
  reputationManager: '0x0000000000000000000000000000000000000000000000000000000000000000',
  paymentRouter: '0x0000000000000000000000000000000000000000000000000000000000000000',
  proofGatedPayment: '0x0000000000000000000000000000000000000000000000000000000000000000',
  stwoVerifier: '0x0000000000000000000000000000000000000000000000000000000000000000',
  privacyRouter: '0x0000000000000000000000000000000000000000000000000000000000000000',
  optimisticTee: '0x0000000000000000000000000000000000000000000000000000000000000000',
  // No faucet on mainnet
};

/** Local development contract addresses */
export const LOCAL_CONTRACTS: ContractRegistry = {
  sageToken: '0x0000000000000000000000000000000000000000000000000000000000000001',
  proverStaking: '0x0000000000000000000000000000000000000000000000000000000000000002',
  miningRewards: '0x0000000000000000000000000000000000000000000000000000000000000003',
  jobManager: '0x0000000000000000000000000000000000000000000000000000000000000004',
  cdcPool: '0x0000000000000000000000000000000000000000000000000000000000000005',
  reputationManager: '0x0000000000000000000000000000000000000000000000000000000000000006',
  paymentRouter: '0x0000000000000000000000000000000000000000000000000000000000000007',
  proofGatedPayment: '0x0000000000000000000000000000000000000000000000000000000000000008',
  stwoVerifier: '0x0000000000000000000000000000000000000000000000000000000000000009',
  privacyRouter: '0x000000000000000000000000000000000000000000000000000000000000000a',
  optimisticTee: '0x000000000000000000000000000000000000000000000000000000000000000b',
  faucet: '0x000000000000000000000000000000000000000000000000000000000000000c',
};

/** Network type */
export type Network = 'mainnet' | 'sepolia' | 'local';

/**
 * Get contract addresses for a network
 */
export function getContractsForNetwork(network: Network): ContractRegistry {
  switch (network) {
    case 'mainnet':
      return MAINNET_CONTRACTS;
    case 'sepolia':
      return SEPOLIA_CONTRACTS;
    case 'local':
      return LOCAL_CONTRACTS;
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}

/**
 * Check if a contract address is configured (not zero)
 */
export function isContractConfigured(address: string): boolean {
  const zeroAddress = '0x0000000000000000000000000000000000000000000000000000000000000000';
  return address !== zeroAddress && address.length > 0;
}

/**
 * External token addresses (not BitSage contracts)
 */
export interface ExternalTokens {
  /** USDC stablecoin */
  usdc: string;
  /** Starknet token (STRK) */
  strk: string;
  /** Wrapped Bitcoin */
  wbtc: string;
  /** Wrapped Ethereum */
  weth: string;
}

/** Sepolia external tokens */
export const SEPOLIA_TOKENS: ExternalTokens = {
  usdc: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
  strk: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  wbtc: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
  weth: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
};

/** Mainnet external tokens */
export const MAINNET_TOKENS: ExternalTokens = {
  usdc: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
  strk: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  wbtc: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
  weth: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
};

/**
 * Get external tokens for a network
 */
export function getTokensForNetwork(network: Network): ExternalTokens {
  switch (network) {
    case 'mainnet':
      return MAINNET_TOKENS;
    case 'sepolia':
      return SEPOLIA_TOKENS;
    case 'local':
      return SEPOLIA_TOKENS; // Use sepolia tokens for local dev
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}

/**
 * Pragma Oracle addresses
 */
export const PRAGMA_ORACLE = {
  sepolia: '0x036031daa264c24520b11d93af622c848b2499b66b41d611bac95e13cfca131a',
  mainnet: '0x2a85bd616f912537c50a49a4076db02c00b29b2cdc8a197ce92ed1837fa875b',
} as const;
