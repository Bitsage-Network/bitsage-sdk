/**
 * Obelysk Protocol SDK
 *
 * Privacy-first DeFi operations on Starknet:
 * - Privacy Pool deposits/withdrawals (shielded tokens)
 * - DarkPool batch auction trading (commit-reveal)
 * - Stealth payments (ephemeral address payments)
 * - Confidential transfers (ElGamal encrypted amounts)
 * - Prover staking (SAGE-backed GPU prover network)
 * - Privacy Router (private balances + auditing)
 * - Shielded Swap Router (privacy-preserving AMM)
 *
 * @example
 * ```typescript
 * import { ObelyskClient } from '@bitsagecli/sdk/obelysk';
 *
 * const obelysk = new ObelyskClient({
 *   network: 'mainnet',
 *   rpcUrl: 'https://your-rpc-endpoint.com',
 *   account, // starknet.js Account (optional, for transactions)
 * });
 *
 * // Read-only: query protocol state
 * const epoch = await obelysk.darkPool.getEpochInfo();
 * const stats = await obelysk.privacyPool.getPoolStats('eth');
 * const staked = await obelysk.staking.getTotalStaked();
 *
 * // Write: deposit into privacy pool (requires account)
 * const note = await obelysk.privacyPool.deposit({ token: 'eth', amount: '1.0' });
 *
 * // Write: DarkPool order
 * await obelysk.darkPool.deposit({ token: 'sage', amount: '10000' });
 * const order = await obelysk.darkPool.commitOrder({
 *   pair: 'SAGE/STRK', side: 'sell', price: '0.011', amount: '5000'
 * });
 *
 * // Write: stealth payment
 * await obelysk.stealth.send({ to: '0x...', token: 'sage', amount: '1000' });
 * ```
 */

// Core client
export { ObelyskClient } from './client';
export type { ObelyskConfig } from './client';

// Privacy Pools
export { PrivacyPoolClient } from './privacyPool';
export type { DepositParams, DepositResult, WithdrawParams, WithdrawResult, PrivacyNote } from './privacyPool';

// DarkPool Auction
export { DarkPoolClient } from './darkPool';
export type { DarkPoolDepositParams, CommitOrderParams, RevealOrderParams, DarkPoolOrderData, EpochInfo, ClaimFillParams } from './darkPool';

// Stealth Payments
export { StealthClient } from './stealth';
export type { StealthSendParams, StealthMetaAddress, StealthSpendingProof, StealthAnnouncement, ClaimParams } from './stealth';

// Confidential Transfers
export { ConfidentialTransferClient } from './confidentialTransfer';
export type { TransferParams, FundParams, WithdrawCTParams } from './confidentialTransfer';

// Prover Staking
export { ProverStakingClient } from './proverStaking';
export type { GpuTier, WorkerStake, StakingConfig } from './proverStaking';

// Privacy Router
export { PrivacyRouterClient } from './privacyRouter';
export type { PrivateAccount } from './privacyRouter';

// Shielded Swap
export { ShieldedSwapClient } from './shieldedSwap';
export type { ShieldedSwapParams } from './shieldedSwap';

// VM31 UTXO Privacy Vault
export { VM31VaultClient } from './vm31Vault';
export type {
  PackedDigest, VM31AssetId, BatchStatus, VaultNote, VaultMerklePath,
  VaultDepositParams, VaultWithdrawParams, VaultTransferParams,
  VaultSubmitResult, VaultBatchInfo, RelayerInfo,
} from './vm31Vault';

// VM31 Confidential Bridge
export { VM31BridgeClient } from './vm31Bridge';
export type { AssetPair, BridgeConfig } from './vm31Bridge';

// OTC Orderbook
export { OTCOrderbookClient } from './otcOrderbook';
export {
  OrderSide, OrderType, OrderStatus,
} from './otcOrderbook';
export type {
  TradingPair, OTCOrder, OTCTrade, OrderbookConfig,
  PlaceLimitOrderParams, PlaceMarketOrderParams,
  OrderbookDepthLevel, OrderbookDepth, Stats24h,
} from './otcOrderbook';

// Contract addresses and utilities
export {
  getContracts,
  getRpcUrl,
  MAINNET_TOKENS,
  MAINNET_PRIVACY_POOLS,
  TOKEN_DECIMALS,
  DARKPOOL_ASSET_IDS,
  VM31_ASSET_IDS,
  parseAmount,
  formatAmount,
} from './contracts';
export type { ObelyskNetwork } from './contracts';

// Shared crypto primitives
export {
  mod, ecAdd, ecMul, randomScalar, modInverse,
  pedersenCommit, elgamalEncrypt, createEncryptionProof, createAEHint,
  commitmentToHash, deriveNullifier,
} from './crypto';

// ECIES encryption (for VM31 relayer)
export { eciesEncrypt } from './ecies';
export type { ECIESEnvelope } from './ecies';

// VM31 denomination validation
export {
  validateDenomination,
  splitIntoDenominations,
  getDenominations,
  WBTC_DENOMINATIONS,
  SAGE_DENOMINATIONS,
  ETH_DENOMINATIONS,
  STRK_DENOMINATIONS,
  USDC_DENOMINATIONS,
  VM31_DENOMINATIONS,
  DENOMINATION_BY_SYMBOL,
} from './denominations';

// Re-export crypto from parent privacy module
export {
  ObelyskPrivacy,
  FIELD_PRIME,
  CURVE_ORDER,
  GENERATOR_G,
  GENERATOR_H,
  type ECPoint,
  type ElGamalKeyPair,
  type ElGamalCiphertext,
} from '../privacy';
