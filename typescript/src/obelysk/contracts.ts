/**
 * Obelysk Protocol Contract Addresses & Token Registry
 *
 * All addresses inlined for npm consumers — no external JSON dependency.
 */

export type ObelyskNetwork = 'sepolia' | 'mainnet';

export const MAINNET_RPC = 'https://starknet-mainnet.public.blastapi.io/rpc/v0_7'; // Override with rpcUrl config
export const SEPOLIA_RPC = 'https://starknet-sepolia.public.blastapi.io/rpc/v0_7'; // Override with rpcUrl config

export function getRpcUrl(network: ObelyskNetwork): string {
  return network === 'mainnet' ? MAINNET_RPC : SEPOLIA_RPC;
}

// ============================================================================
// Mainnet contract addresses (deployed 2026-02-26 → 2026-03-08)
// ============================================================================

const MAINNET_CONTRACTS: Record<string, any> = {
  sage_token: '0x0098d563900789f934e610b67482ae58793a2efc373ba3a45af94cdbf931c799',
  confidential_transfer: '0x0673685bdb01fbf57c390ec2c0d893e7c77316cdea315b0fbfbc85b9a9a979d2',
  privacy_router: '0x00f3fd871ba1b5b176270a7eb9e222c964c50fa8a31234394ea00ce70bfbdfbd',
  prover_staking: '0x07d2ecff4a4d7ca6c75df367d8dbc7cc12ea583f88813f7020832a7cf7f293e3',
  dark_pool: '0x0230b5822556f0d9afca7b02f01e37cb9cf2a7e8d590a9020e9bbca183ea7727',
  shielded_swap: '0x05a7f8a6ab74ee6ab41169118ca2ea21070dc6594bae5a39f5bb9ac50629725b',
  stealth_registry: '0x077ee4c38201b4e45b643f4af56ff6daf780260e9c8a281f3536fb711afcaea8',
  otc_orderbook: '0x04165f8fe590e94d7f12e77af72577123b24cbd01101a62b53c3e119fb8bb119',
  sumcheck_verifier: '0x05071a9428cba9a7e4cbcbf3cee2d16caaaf2b6b9d270a8fb6089a4a97d330e8',
  vm31_pool: '0x0230eb355e54a98b4511d86585d45d6a5b9075d0ec254877485047b6d651400d',
  vm31_bridge: '0x048f481c4ada306f5b62d7d223ddd0cf8055a423ffa2b278b3ff767ca9c0356c',
  privacy_pool_wbtc: '0x030fcfd4ae4f022e720e52f54359258a02517e11701c153ae46ab2cf10d5e5e2',
  privacy_pool_sage: '0x0224977344d123eb5c20fd088f15b62d0541f8282f4a23dd87bdf9839aac724f',
  privacy_pool_eth: '0x06d0b41c96809796faa02a5eac2f74e090effd09ccab7274054b90aa671e82b5',
  privacy_pool_strk: '0x02c348e89b355691ba5e4ece681fd6b497f8ab2ba670fa5842208b251a3c9cf1',
  privacy_pool_usdc: '0x05d36d7fd19d094ee0fd454e461061d68eb9f4fd0b241e2d1c94320b46d4d59b',
  tokens: {
    eth: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    strk: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    usdc: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
    wbtc: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
    sage: '0x0098d563900789f934e610b67482ae58793a2efc373ba3a45af94cdbf931c799',
  },
};

const SEPOLIA_CONTRACTS: Record<string, any> = {
  sage_token: '0x072349097c8a802e7f66dc96b95aca84e4d78ddad22014904076c76293a99850',
  prover_staking: '0x3287a0af5ab2d74fbf968204ce2291adde008d645d42bc363cb741ebfa941b',
  privacy_router: '0x7d1a6c242a4f0573696e117790f431fd60518a000b85fe5ee507456049ffc53',
  tokens: {
    eth: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    strk: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  },
};

export function getContracts(network: ObelyskNetwork): Record<string, any> {
  return network === 'mainnet' ? MAINNET_CONTRACTS : SEPOLIA_CONTRACTS;
}

// ============================================================================
// Token addresses & pools
// ============================================================================

export const MAINNET_TOKENS: Record<string, string> = {
  eth: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
  strk: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  usdc: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
  wbtc: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
  sage: '0x0098d563900789f934e610b67482ae58793a2efc373ba3a45af94cdbf931c799',
};

export const MAINNET_PRIVACY_POOLS: Record<string, string> = {
  eth: '0x06d0b41c96809796faa02a5eac2f74e090effd09ccab7274054b90aa671e82b5',
  strk: '0x02c348e89b355691ba5e4ece681fd6b497f8ab2ba670fa5842208b251a3c9cf1',
  usdc: '0x05d36d7fd19d094ee0fd454e461061d68eb9f4fd0b241e2d1c94320b46d4d59b',
  wbtc: '0x030fcfd4ae4f022e720e52f54359258a02517e11701c153ae46ab2cf10d5e5e2',
  sage: '0x0224977344d123eb5c20fd088f15b62d0541f8282f4a23dd87bdf9839aac724f',
};

/** Token decimals */
export const TOKEN_DECIMALS: Record<string, number> = {
  eth: 18, strk: 18, usdc: 6, wbtc: 8, sage: 18,
};

/** DarkPool asset IDs (felt252) */
export const DARKPOOL_ASSET_IDS: Record<string, string> = {
  eth: '0x2', strk: '0x3', usdc: '0x4', wbtc: '0x0', sage: '0x1',
};

/** VM31 asset IDs */
export const VM31_ASSET_IDS: Record<string, number> = {
  wbtc: 0, sage: 1, eth: 2, strk: 3, usdc: 4,
};

/** Parse token amount to bigint */
export function parseAmount(amount: string | number, token: string): bigint {
  const decimals = TOKEN_DECIMALS[token.toLowerCase()] ?? 18;
  const parts = String(amount).split('.');
  const whole = BigInt(parts[0] || '0');
  const frac = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
  return whole * 10n ** BigInt(decimals) + BigInt(frac);
}

/** Format bigint to human-readable string */
export function formatAmount(amount: bigint, token: string): string {
  const decimals = TOKEN_DECIMALS[token.toLowerCase()] ?? 18;
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = (amount % divisor).toString().padStart(decimals, '0');
  const trimmed = frac.replace(/0+$/, '') || '0';
  return trimmed === '0' ? whole.toString() : `${whole}.${trimmed}`;
}
