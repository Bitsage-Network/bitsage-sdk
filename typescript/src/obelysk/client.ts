/**
 * Main Obelysk Protocol Client
 *
 * Orchestrates all protocol operations: privacy pools, dark pool,
 * stealth payments, confidential transfers, staking, router, and swaps.
 */
import { Account, RpcProvider } from 'starknet';
import { PrivacyPoolClient } from './privacyPool';
import { DarkPoolClient } from './darkPool';
import { StealthClient } from './stealth';
import { ConfidentialTransferClient } from './confidentialTransfer';
import { ProverStakingClient } from './proverStaking';
import { PrivacyRouterClient } from './privacyRouter';
import { ShieldedSwapClient } from './shieldedSwap';
import { VM31VaultClient } from './vm31Vault';
import { VM31BridgeClient } from './vm31Bridge';
import { OTCOrderbookClient } from './otcOrderbook';
import { ObelyskPrivacy } from '../privacy';
import {
  type ObelyskNetwork,
  getContracts,
  getRpcUrl,
  MAINNET_TOKENS,
  MAINNET_PRIVACY_POOLS,
} from './contracts';

export interface ObelyskConfig {
  /** Network to connect to */
  network: ObelyskNetwork;
  /** starknet.js Account (for signing transactions) */
  account?: Account;
  /** Optional custom RPC URL (strongly recommended — default public RPCs have limits) */
  rpcUrl?: string;
  /** Optional privacy key pair (hex private key). If omitted, generated fresh. */
  privacyPrivateKey?: string;
  /** VM31 relayer URL (default: https://relay.bitsage.network:3080) */
  relayerUrl?: string;
  /** VM31 relayer API key */
  relayerApiKey?: string;
}

export class ObelyskClient {
  readonly network: ObelyskNetwork;
  readonly provider: RpcProvider;
  readonly account?: Account;
  readonly privacy: ObelyskPrivacy;
  readonly contracts: Record<string, string>;
  readonly tokens: Record<string, string>;
  readonly privacyPools: Record<string, string>;
  readonly relayerUrl?: string;
  readonly relayerApiKey?: string;

  /** Privacy Pool operations (deposit/withdraw shielded tokens) */
  readonly privacyPool: PrivacyPoolClient;
  /** DarkPool batch auction trading */
  readonly darkPool: DarkPoolClient;
  /** Stealth address payments */
  readonly stealth: StealthClient;
  /** Confidential peer-to-peer transfers */
  readonly confidentialTransfer: ConfidentialTransferClient;
  /** SAGE prover staking (stake/unstake/rewards) */
  readonly staking: ProverStakingClient;
  /** Privacy Router (private balances, nullifiers, auditing) */
  readonly router: PrivacyRouterClient;
  /** Shielded swap router (privacy-preserving AMM swaps) */
  readonly swap: ShieldedSwapClient;
  /** VM31 UTXO privacy vault (deposits/withdrawals/transfers via relayer) */
  readonly vm31: VM31VaultClient;
  /** VM31 confidential bridge (bridge VM31 withdrawals to encrypted balances) */
  readonly bridge: VM31BridgeClient;
  /** OTC orderbook (limit/market orders, trade history) */
  readonly otc: OTCOrderbookClient;

  constructor(config: ObelyskConfig) {
    this.network = config.network;
    this.provider = new RpcProvider({ nodeUrl: config.rpcUrl ?? getRpcUrl(config.network) });
    this.account = config.account;
    this.contracts = getContracts(config.network);
    this.tokens = (this.contracts as any).tokens ?? MAINNET_TOKENS;
    this.privacyPools = config.network === 'mainnet' ? MAINNET_PRIVACY_POOLS : {};
    this.relayerUrl = config.relayerUrl;
    this.relayerApiKey = config.relayerApiKey;

    // Initialize privacy crypto
    this.privacy = new ObelyskPrivacy();
    if (config.privacyPrivateKey) {
      const pk = BigInt(config.privacyPrivateKey);
      this.privacy.setKeyPair(pk);
    }

    // Initialize sub-clients
    this.privacyPool = new PrivacyPoolClient(this);
    this.darkPool = new DarkPoolClient(this);
    this.stealth = new StealthClient(this);
    this.confidentialTransfer = new ConfidentialTransferClient(this);
    this.staking = new ProverStakingClient(this);
    this.router = new PrivacyRouterClient(this);
    this.swap = new ShieldedSwapClient(this);
    this.vm31 = new VM31VaultClient(this);
    this.bridge = new VM31BridgeClient(this);
    this.otc = new OTCOrderbookClient(this);
  }

  /** Get token address by symbol */
  getTokenAddress(symbol: string): string {
    const addr = this.tokens[symbol.toLowerCase()];
    if (!addr) throw new Error(`Unknown token: ${symbol}`);
    return addr;
  }

  /** Get privacy pool address for a token */
  getPrivacyPoolAddress(symbol: string): string {
    const addr = this.privacyPools[symbol.toLowerCase()];
    if (!addr) throw new Error(`No privacy pool for: ${symbol}`);
    return addr;
  }

  /** Require an account is set */
  requireAccount(): Account {
    if (!this.account) throw new Error('ObelyskClient: account required for transactions');
    return this.account;
  }
}
