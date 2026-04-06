/**
 * VM31 UTXO Privacy Vault Client
 *
 * Wraps both on-chain VM31Pool contract reads and the VM31 relayer HTTP API
 * for transaction submission. The VM31 system uses Poseidon2-M31 hashing
 * with a UTXO model for confidential token transfers.
 *
 * On-chain reads go through `callContract()` to the VM31Pool.
 * Transaction submissions (deposit/withdraw/transfer) go through the
 * VM31 relayer HTTP API, which batches and proves transactions.
 */
import type { ObelyskClient } from './client';
import { eciesEncrypt, type ECIESEnvelope } from './ecies';
import { validateDenomination } from './denominations';

// ============================================================================
// Types
// ============================================================================

export interface PackedDigest {
  lo: string;
  hi: string;
}

export type VM31AssetId = number; // 0=wBTC, 1=SAGE, 2=ETH, 3=STRK, 4=USDC

export type BatchStatus = 'queued' | 'proving' | 'confirmed' | 'finalized' | 'error';

export interface VaultNote {
  owner_pubkey: [number, number, number, number];
  asset_id: number;
  amount_lo: number;
  amount_hi: number;
  blinding: [number, number, number, number];
}

export interface VaultMerklePath {
  siblings: number[][];
  index: number;
}

export interface VaultDepositParams {
  amount: bigint;
  assetId: number;
  recipientPubkey: [number, number, number, number];
  recipientViewingKey: [number, number, number, number];
}

export interface VaultWithdrawParams {
  amount: bigint;
  assetId: number;
  note: VaultNote;
  spendingKey: [number, number, number, number];
  merklePath: VaultMerklePath;
  merkleRoot: number[];
  withdrawalBinding: number[];
  bindingSalt?: number[];
}

export interface VaultTransferParams {
  amount: bigint;
  assetId: number;
  recipientPubkey: [number, number, number, number];
  recipientViewingKey: [number, number, number, number];
  senderViewingKey: [number, number, number, number];
  inputNotes: Array<{
    note: VaultNote;
    spendingKey: [number, number, number, number];
    merklePath: VaultMerklePath;
  }>;
  merkleRoot: number[];
}

export interface VaultSubmitResult {
  status: 'queued' | 'batch_triggered' | 'duplicate';
  batchId?: string;
  queuePosition?: number;
  idempotencyKey?: string;
}

export interface VaultBatchInfo {
  id: string;
  status: BatchStatus;
  txCount: number;
  proofHash?: string;
  batchIdOnchain?: string;
  txHash?: string;
  createdAt?: string;
  error?: string;
}

export interface RelayerInfo {
  pendingTransactions: number;
  batchMaxSize: number;
  batchTimeoutSecs: number;
}

// ============================================================================
// VM31 Vault Client
// ============================================================================

export class VM31VaultClient {
  constructor(private readonly obelysk: ObelyskClient) {}

  private get contractAddress(): string {
    return this.obelysk.contracts.vm31_pool;
  }

  private get relayerUrl(): string {
    return (this.obelysk as any).relayerUrl ?? 'https://relay.bitsage.network:3080';
  }

  private get relayerApiKey(): string | undefined {
    return (this.obelysk as any).relayerApiKey;
  }

  /** Cached relayer X25519 public key (fetched on first encrypted submit) */
  private _relayerPubkey: string | null = null;

  private async relayerFetch(path: string, init?: RequestInit): Promise<any> {
    const url = `${this.relayerUrl}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.relayerApiKey) headers['x-api-key'] = this.relayerApiKey;
    const res = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`VM31 relayer ${res.status}: ${body}`);
    }
    return res.json();
  }

  /**
   * Submit a payload to the relayer, encrypted with ECIES.
   * Falls back to plaintext if `encrypt: false` is passed.
   */
  private async relayerSubmit(payload: unknown, encrypt = true): Promise<VaultSubmitResult> {
    if (!encrypt) {
      return this.relayerFetch('/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    // Fetch + cache the relayer's X25519 public key
    if (!this._relayerPubkey) {
      const keyInfo = await this.getRelayerPublicKey();
      this._relayerPubkey = keyInfo.publicKey;
    }

    const envelope = await eciesEncrypt(payload, this._relayerPubkey);
    return this.relayerFetch('/submit', {
      method: 'POST',
      body: JSON.stringify(envelope),
    });
  }

  // --------------------------------------------------------------------------
  // On-chain reads (callContract to vm31_pool)
  // --------------------------------------------------------------------------

  /** Get the current Merkle root of the VM31 commitment tree */
  async getMerkleRoot(): Promise<PackedDigest> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_merkle_root',
      calldata: [],
    });
    return { lo: result[0], hi: result[1] };
  }

  /** Get the number of leaves in the commitment tree */
  async getTreeSize(): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_tree_size',
      calldata: [],
    });
    return Number(BigInt(result[0]));
  }

  /** Check if a nullifier has been spent */
  async isNullifierSpent(nullifier: PackedDigest): Promise<boolean> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'is_nullifier_spent',
      calldata: [nullifier.lo, nullifier.hi],
    });
    return BigInt(result[0]) !== 0n;
  }

  /** Check if a Merkle root is known (valid historical root) */
  async isKnownRoot(root: PackedDigest): Promise<boolean> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'is_known_root',
      calldata: [root.lo, root.hi],
    });
    return BigInt(result[0]) !== 0n;
  }

  /** Get the total balance of an asset held in the pool */
  async getAssetBalance(assetId: number): Promise<bigint> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_asset_balance',
      calldata: [assetId.toString()],
    });
    return BigInt(result[0]);
  }

  /** Get on-chain batch status (0=NONE, 1=SUBMITTED, 2=FINALIZED, 3=CANCELLED) */
  async getBatchStatus(batchId: string): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_batch_status',
      calldata: [batchId],
    });
    return Number(BigInt(result[0]));
  }

  /** Get the currently active batch ID */
  async getActiveBatchId(): Promise<string> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_active_batch_id',
      calldata: [],
    });
    return result[0];
  }

  /** Get total transaction count in a batch */
  async getBatchTotalTxs(batchId: string): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_batch_total_txs',
      calldata: [batchId],
    });
    return Number(BigInt(result[0]));
  }

  /** Get number of processed transactions in a batch */
  async getBatchProcessedCount(batchId: string): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_batch_processed_count',
      calldata: [batchId],
    });
    return Number(BigInt(result[0]));
  }

  /** Get the ERC-20 token address for a VM31 asset ID */
  async getAssetToken(assetId: number): Promise<string> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_asset_token',
      calldata: [assetId.toString()],
    });
    return result[0];
  }

  /** Get the VM31 asset ID for a given ERC-20 token address */
  async getTokenAsset(tokenAddress: string): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_token_asset',
      calldata: [tokenAddress],
    });
    return Number(BigInt(result[0]));
  }

  /** Check if the VM31Pool contract is paused */
  async isPaused(): Promise<boolean> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'is_paused',
      calldata: [],
    });
    return BigInt(result[0]) !== 0n;
  }

  /** Get the contract owner address */
  async getOwner(): Promise<string> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_owner',
      calldata: [],
    });
    return result[0];
  }

  /** Get the authorized relayer address */
  async getRelayer(): Promise<string> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_relayer',
      calldata: [],
    });
    return result[0];
  }

  /** Get batch timeout in blocks */
  async getBatchTimeoutBlocks(): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_batch_timeout_blocks',
      calldata: [],
    });
    return Number(BigInt(result[0]));
  }

  // --------------------------------------------------------------------------
  // Relayer HTTP calls
  // --------------------------------------------------------------------------

  /** Check relayer health (no auth required) */
  async getRelayerHealth(): Promise<{ status: string; version: string; service: string }> {
    return this.relayerFetch('/health');
  }

  /** Get relayer queue status */
  async getRelayerStatus(): Promise<RelayerInfo> {
    const data = await this.relayerFetch('/status');
    return {
      pendingTransactions: data.pending_transactions,
      batchMaxSize: data.batch_max_size,
      batchTimeoutSecs: data.batch_timeout_secs,
    };
  }

  /** Get the relayer's public encryption key */
  async getRelayerPublicKey(): Promise<{ publicKey: string; version: number; algorithm: string }> {
    const data = await this.relayerFetch('/public-key');
    return {
      publicKey: data.public_key,
      version: data.version,
      algorithm: data.algorithm,
    };
  }

  /**
   * Submit a deposit transaction to the relayer.
   * Validates denomination (privacy gap #7) and encrypts with ECIES by default.
   * @param encrypt - Set to false for legacy plaintext mode (default: true)
   */
  async submitDeposit(params: VaultDepositParams, encrypt = true): Promise<VaultSubmitResult> {
    // Client-side denomination validation (deposits only)
    validateDenomination(params.amount, params.assetId);
    return this.relayerSubmit({
      type: 'deposit',
      amount: Number(params.amount),
      asset_id: params.assetId,
      recipient_pubkey: params.recipientPubkey,
      recipient_viewing_key: params.recipientViewingKey,
    }, encrypt);
  }

  /**
   * Submit a withdrawal transaction to the relayer.
   * Withdrawals are not denomination-restricted.
   * @param encrypt - Set to false for legacy plaintext mode (default: true)
   */
  async submitWithdraw(params: VaultWithdrawParams, encrypt = true): Promise<VaultSubmitResult> {
    return this.relayerSubmit({
      type: 'withdraw',
      amount: Number(params.amount),
      asset_id: params.assetId,
      note: {
        owner_pubkey: params.note.owner_pubkey,
        asset_id: params.note.asset_id,
        amount_lo: params.note.amount_lo,
        amount_hi: params.note.amount_hi,
        blinding: params.note.blinding,
      },
      spending_key: params.spendingKey,
      merkle_path: params.merklePath,
      merkle_root: params.merkleRoot,
      withdrawal_binding: params.withdrawalBinding,
      binding_salt: params.bindingSalt,
    }, encrypt);
  }

  /**
   * Submit a private transfer transaction to the relayer.
   * Transfers are not denomination-restricted.
   * @param encrypt - Set to false for legacy plaintext mode (default: true)
   */
  async submitTransfer(params: VaultTransferParams, encrypt = true): Promise<VaultSubmitResult> {
    return this.relayerSubmit({
      type: 'transfer',
      amount: Number(params.amount),
      asset_id: params.assetId,
      recipient_pubkey: params.recipientPubkey,
      recipient_viewing_key: params.recipientViewingKey,
      sender_viewing_key: params.senderViewingKey,
      input_notes: params.inputNotes.map((n) => ({
        note: n.note,
        spending_key: n.spendingKey,
        merkle_path: n.merklePath,
      })),
      merkle_root: params.merkleRoot,
    }, encrypt);
  }

  /** Query batch info from the relayer */
  async queryBatch(batchId: string): Promise<VaultBatchInfo> {
    const data = await this.relayerFetch(`/batch/${batchId}`);
    return {
      id: data.id,
      status: data.status,
      txCount: data.tx_count,
      proofHash: data.proof_hash,
      batchIdOnchain: data.batch_id_onchain,
      txHash: data.tx_hash,
      createdAt: data.created_at,
      error: data.error,
    };
  }

  /** Fetch Merkle path for a commitment from the relayer */
  async fetchMerklePath(commitment: string): Promise<{
    commitment: string;
    merklePath: VaultMerklePath | null;
    merkleRoot: number[] | null;
    batchId: string | null;
    createdAt?: string;
    status?: string;
  }> {
    const data = await this.relayerFetch(`/merkle-path/${commitment}`);
    return {
      commitment: data.commitment,
      merklePath: data.merkle_path ?? null,
      merkleRoot: data.merkle_root ?? null,
      batchId: data.batch_id ?? null,
      createdAt: data.created_at,
      status: data.status,
    };
  }

  /** Force the relayer to prove the current batch immediately */
  async forceProve(): Promise<{ status: string; batchId?: string }> {
    const data = await this.relayerFetch('/prove', { method: 'POST' });
    return {
      status: data.status,
      batchId: data.batch_id,
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /** Encode a bigint amount into M31 lo/hi pair (31-bit limbs) */
  static encodeAmountM31(amount: bigint): { lo: number; hi: number } {
    const lo = Number(amount & 0x7FFFFFFFn);
    const hi = Number(amount >> 31n);
    return { lo, hi };
  }

  /** Decode an M31 lo/hi pair back into a bigint amount */
  static decodeAmountM31(lo: number, hi: number): bigint {
    return BigInt(lo) + BigInt(hi) * (1n << 31n);
  }
}
