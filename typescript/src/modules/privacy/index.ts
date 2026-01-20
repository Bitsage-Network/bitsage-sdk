/**
 * Obelysk Privacy Module
 * Full privacy system with ElGamal encryption, threshold decryption, and ring signatures
 */

import { HttpClient } from '../../transport/http-client';
import { ContractClient, toFelt } from '../../transport/contract-client';
import type { TransactionReceipt } from '../../transport/contract-client';
import type {
  ECPoint,
  ElGamalCiphertext,
  EncryptedBalance,
  PrivacyKeyPair,
  PrivateAccount,
  PrivateTransferParams,
  PrivateTransferWithAuditParams,
  SteganographicTransaction,
  MixingTransaction,
  MixingOutput,
  RagequitProof,
  DKGShare,
  ThresholdDecryptionRequest,
  MultiAssetBalances,
  PrivateSwapParams,
  TransferProof,
  AEHint,
  StealthAddress,
} from '../../types/generated/privacy';

import { PrivacyKeyManager, getPrivacyDerivationMessage, isValidPublicKey } from './keys';
import { EncryptionHelper, createTransferProof, verifyTransferProof } from './encryption';

// Re-export key management and encryption helpers
export { PrivacyKeyManager, getPrivacyDerivationMessage, isValidPublicKey } from './keys';
export { EncryptionHelper, createTransferProof, verifyTransferProof } from './encryption';

export interface PrivacyClientConfig {
  /** Privacy router contract address */
  privacyRouterAddress: string;
  /** DKG coordinator contract address */
  dkgCoordinatorAddress?: string;
  /** Mixing pool contract address */
  mixingPoolAddress?: string;
}

/** Transaction result */
export interface TransactionResult {
  transaction_hash: string;
  status: 'pending' | 'accepted' | 'rejected';
  receipt?: TransactionReceipt;
}

/** Supported privacy assets */
export type PrivacyAsset = 'SAGE' | 'USDC' | 'STRK' | 'WBTC' | 'ETH';

/**
 * Obelysk Privacy Client
 *
 * Full privacy functionality including:
 * - Account registration and management
 * - Private transfers with zero-knowledge proofs
 * - Auditable transfers (with designated auditor)
 * - Steganographic operations (hidden transaction types)
 * - Ring signatures for transaction mixing
 * - Threshold decryption via DKG
 * - Multi-asset privacy support
 * - Emergency ragequit (privacy exit)
 *
 * @example
 * ```typescript
 * const privacy = new PrivacyClient(httpClient, contractClient, config);
 *
 * // Generate privacy keys
 * const keys = await privacy.generateKeys();
 * // Or derive from wallet
 * const sig = await wallet.signMessage(getPrivacyDerivationMessage(address));
 * const keys = await privacy.deriveKeysFromWallet(sig);
 *
 * // Register private account
 * await privacy.registerAccount(keys.publicKey);
 *
 * // Get encrypted balance
 * const balance = await privacy.getEncryptedBalance(address);
 *
 * // Reveal balance (client-side decryption)
 * const revealed = await privacy.revealBalance(balance, keys.privateKey);
 *
 * // Private transfer
 * await privacy.privateTransfer({
 *   to: recipientAddress,
 *   amount: 100n * 10n**18n,
 *   keys,
 * });
 * ```
 */
export class PrivacyClient {
  private http: HttpClient;
  private contract: ContractClient;
  private config: PrivacyClientConfig;
  private keyManager: typeof PrivacyKeyManager;

  constructor(
    http: HttpClient,
    contract: ContractClient,
    config: PrivacyClientConfig
  ) {
    this.http = http;
    this.contract = contract;
    this.config = config;
    this.keyManager = PrivacyKeyManager;
  }

  // =========================================================================
  // Key Management
  // =========================================================================

  /**
   * Generate fresh privacy keys
   *
   * @returns New privacy keypair
   */
  async generateKeys(): Promise<PrivacyKeyPair> {
    return this.keyManager.generate();
  }

  /**
   * Derive privacy keys from wallet signature
   *
   * @param signature - Wallet signature of derivation message
   * @returns Derived privacy keypair
   */
  async deriveKeysFromWallet(signature: string): Promise<PrivacyKeyPair> {
    return this.keyManager.deriveFromSignature(signature);
  }

  /**
   * Store keys encrypted in local storage
   *
   * @param keys - Keypair to store
   * @param password - Encryption password
   */
  async storeKeys(keys: PrivacyKeyPair, password: string): Promise<void> {
    return this.keyManager.store(keys, password);
  }

  /**
   * Retrieve keys from local storage
   *
   * @param password - Decryption password
   * @returns Keypair or null if not found/wrong password
   */
  async retrieveKeys(password: string): Promise<PrivacyKeyPair | null> {
    return this.keyManager.retrieve(password);
  }

  /**
   * Check if keys are stored
   */
  hasStoredKeys(): boolean {
    return this.keyManager.hasStoredKey();
  }

  /**
   * Clear stored keys
   */
  clearKeys(): void {
    this.keyManager.clear();
  }

  // =========================================================================
  // Account Operations
  // =========================================================================

  /**
   * Register a private account
   *
   * @param publicKey - ElGamal public key
   * @returns Transaction result
   */
  async registerAccount(publicKey: ECPoint): Promise<TransactionResult> {
    if (!isValidPublicKey(publicKey)) {
      throw new Error('Invalid public key');
    }

    return this.contract.invokeAndWait(
      this.config.privacyRouterAddress,
      'register_private_account',
      [toFelt(publicKey.x), toFelt(publicKey.y)]
    );
  }

  /**
   * Get private account info
   *
   * @param address - Account address
   * @returns Private account or null
   */
  async getAccount(address: string): Promise<PrivateAccount | null> {
    try {
      const response = await this.http.get<{
        owner: string;
        public_key: { x: string; y: string };
        balance: {
          ciphertext: { c1: { x: string; y: string }; c2: { x: string; y: string } };
          pending_in: { c1: { x: string; y: string }; c2: { x: string; y: string } };
          pending_out: { c1: { x: string; y: string }; c2: { x: string; y: string } };
          epoch: number;
        };
        hints: { c0: string; c1: string; c2: string };
        created_at: number;
        last_activity: number;
      }>(`/api/privacy/accounts/${address}`);

      return {
        owner: response.owner,
        public_key: {
          x: BigInt(response.public_key.x),
          y: BigInt(response.public_key.y),
        },
        balance: this.parseEncryptedBalance(response.balance),
        hints: {
          c0: BigInt(response.hints.c0),
          c1: BigInt(response.hints.c1),
          c2: BigInt(response.hints.c2),
        },
        created_at: response.created_at,
        last_activity: response.last_activity,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get encrypted balance for an address
   *
   * @param address - Account address
   * @returns Encrypted balance
   */
  async getEncryptedBalance(address: string): Promise<EncryptedBalance> {
    const account = await this.getAccount(address);
    if (!account) {
      throw new Error('Account not found');
    }
    return account.balance;
  }

  /**
   * Reveal balance (client-side decryption)
   *
   * @param balance - Encrypted balance
   * @param privateKey - Private key for decryption
   * @param hint - Optional AE hint for fast decryption
   * @returns Decrypted balance amount
   */
  async revealBalance(
    balance: EncryptedBalance,
    privateKey: Uint8Array,
    hint?: AEHint
  ): Promise<bigint> {
    // Settle pending operations first
    const settled = EncryptionHelper.settleBalance(balance);

    // Decrypt using hint if available, otherwise brute-force ECDLP
    if (hint) {
      return EncryptionHelper.decryptWithHint(settled, hint, privateKey);
    }

    const decrypted = EncryptionHelper.decrypt(settled, privateKey);
    if (decrypted === null) {
      throw new Error('Decryption failed - value may be too large');
    }
    return decrypted;
  }

  // =========================================================================
  // Private Transfers
  // =========================================================================

  /**
   * Execute a private transfer
   *
   * @param params - Transfer parameters
   * @returns Transaction result
   */
  async privateTransfer(params: {
    to: string;
    amount: bigint;
    keys: PrivacyKeyPair;
  }): Promise<TransactionResult> {
    // Get recipient's public key
    const recipientAccount = await this.getAccount(params.to);
    if (!recipientAccount) {
      throw new Error('Recipient account not found');
    }

    // Get sender's current balance
    const senderBalance = await this.getEncryptedBalance(params.keys.publicKey.x.toString(16));

    // Create transfer proof
    const { proof, senderNewBalance, recipientAmount, nullifier } = createTransferProof(
      params.keys.privateKey,
      params.keys.publicKey,
      recipientAccount.public_key,
      params.amount,
      senderBalance
    );

    // Prepare transfer params
    const transferParams: PrivateTransferParams = {
      to: params.to,
      encrypted_amount: recipientAmount,
      sender_new_balance: senderNewBalance,
      receiver_new_balance: EncryptionHelper.homomorphicAdd(
        recipientAccount.balance.ciphertext,
        recipientAmount
      ),
      proof,
    };

    return this.executePrivateTransfer(transferParams);
  }

  /**
   * Execute raw private transfer with pre-computed proof
   *
   * @param params - Pre-computed transfer parameters
   * @returns Transaction result
   */
  async executePrivateTransfer(params: PrivateTransferParams): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.privacyRouterAddress,
      'private_transfer',
      [
        params.to,
        ...this.encodeCiphertext(params.encrypted_amount),
        ...this.encodeCiphertext(params.sender_new_balance),
        ...this.encodeCiphertext(params.receiver_new_balance),
        ...this.encodeTransferProof(params.proof),
      ]
    );
  }

  /**
   * Execute private transfer with audit trail
   *
   * @param params - Transfer parameters with audit info
   * @returns Transaction result
   */
  async privateTransferWithAudit(
    params: PrivateTransferWithAuditParams
  ): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.privacyRouterAddress,
      'private_transfer_with_audit',
      [
        params.to,
        ...this.encodeCiphertext(params.encrypted_amount),
        ...this.encodeCiphertext(params.sender_new_balance),
        ...this.encodeCiphertext(params.receiver_new_balance),
        ...this.encodeTransferProof(params.proof),
        ...this.encodeCiphertext(params.auditor_encrypted),
        ...this.encodeSameEncryptionProof(params.same_encryption_proof),
      ]
    );
  }

  // =========================================================================
  // Stealth Addresses
  // =========================================================================

  /**
   * Generate a stealth address for one-time payments
   *
   * @param recipientPublicKey - Recipient's public key
   * @returns Stealth address
   */
  generateStealthAddress(recipientPublicKey: ECPoint): StealthAddress {
    // Generate ephemeral keypair
    const ephemeralScalar = EncryptionHelper.generateRandomScalar();
    const ephemeral_pubkey = EncryptionHelper.scalarMul(
      { x: 1n, y: BigInt('0x1ce8ed278dc58f31aad4fa1b15f08ad358f1cf4cb08e7127cc11c6ce61d27bf') },
      ephemeralScalar
    );

    // Compute shared secret via ECDH
    const sharedPoint = EncryptionHelper.scalarMul(recipientPublicKey, ephemeralScalar);

    // Derive stealth public key
    const stealthScalar = BigInt('0x' + sharedPoint.x.toString(16).slice(0, 16));
    const stealth_pubkey = EncryptionHelper.scalarMul(recipientPublicKey, stealthScalar);

    // Compute view tag for scanning
    const view_tag = Number(sharedPoint.x & 0xFFn);

    return {
      ephemeral_pubkey,
      stealth_pubkey,
      view_tag,
    };
  }

  /**
   * Scan for stealth payments
   *
   * @param privateKey - Recipient's private key
   * @param startBlock - Block to start scanning from
   * @returns Array of received stealth payments
   */
  async scanStealthPayments(
    privateKey: Uint8Array,
    startBlock?: number
  ): Promise<Array<{
    stealthAddress: StealthAddress;
    amount: bigint;
    blockNumber: number;
  }>> {
    const response = await this.http.get<Array<{
      stealth_address: {
        ephemeral_pubkey: { x: string; y: string };
        stealth_pubkey: { x: string; y: string };
        view_tag: number;
      };
      encrypted_amount: { c1: { x: string; y: string }; c2: { x: string; y: string } };
      block_number: number;
    }>>(`/api/privacy/stealth/scan?start_block=${startBlock || 0}`);

    const results = [];
    for (const payment of response) {
      // Try to decrypt with our key
      const ciphertext = this.parseCiphertext(payment.encrypted_amount);
      const decrypted = EncryptionHelper.decrypt(ciphertext, privateKey);
      if (decrypted !== null) {
        results.push({
          stealthAddress: {
            ephemeral_pubkey: {
              x: BigInt(payment.stealth_address.ephemeral_pubkey.x),
              y: BigInt(payment.stealth_address.ephemeral_pubkey.y),
            },
            stealth_pubkey: {
              x: BigInt(payment.stealth_address.stealth_pubkey.x),
              y: BigInt(payment.stealth_address.stealth_pubkey.y),
            },
            view_tag: payment.stealth_address.view_tag,
          },
          amount: decrypted,
          blockNumber: payment.block_number,
        });
      }
    }

    return results;
  }

  // =========================================================================
  // Steganographic Operations
  // =========================================================================

  /**
   * Execute stealth (steganographic) transfer
   *
   * @param stegTx - Steganographic transaction
   * @returns Transaction result
   */
  async stealthTransfer(stegTx: SteganographicTransaction): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.privacyRouterAddress,
      'stealth_transfer',
      [
        toFelt(stegTx.type_commitment),
        ...this.encodeCiphertext(stegTx.encrypted_amount),
        ...this.encodeCiphertext(stegTx.sender_new_balance),
        ...this.encodeCiphertext(stegTx.receiver_new_balance),
        ...this.encodeTransferProof(stegTx.proof),
        ...stegTx.padding.map(p => toFelt(p)),
      ]
    );
  }

  /**
   * Execute stealth deposit (hide deposit as transfer)
   *
   * @param stegTx - Steganographic transaction
   * @returns Transaction result
   */
  async stealthDeposit(stegTx: SteganographicTransaction): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.privacyRouterAddress,
      'stealth_deposit',
      [
        toFelt(stegTx.type_commitment),
        ...this.encodeCiphertext(stegTx.encrypted_amount),
        ...this.encodeCiphertext(stegTx.sender_new_balance),
        ...this.encodeCiphertext(stegTx.receiver_new_balance),
        ...this.encodeTransferProof(stegTx.proof),
        ...stegTx.padding.map(p => toFelt(p)),
      ]
    );
  }

  /**
   * Execute stealth withdrawal (hide withdrawal as transfer)
   *
   * @param stegTx - Steganographic transaction
   * @returns Transaction result
   */
  async stealthWithdraw(stegTx: SteganographicTransaction): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.privacyRouterAddress,
      'stealth_withdraw',
      [
        toFelt(stegTx.type_commitment),
        ...this.encodeCiphertext(stegTx.encrypted_amount),
        ...this.encodeCiphertext(stegTx.sender_new_balance),
        ...this.encodeCiphertext(stegTx.receiver_new_balance),
        ...this.encodeTransferProof(stegTx.proof),
        ...stegTx.padding.map(p => toFelt(p)),
      ]
    );
  }

  // =========================================================================
  // Ring Signatures (Mixing)
  // =========================================================================

  /**
   * Execute mixed transaction using ring signature
   *
   * @param mixingTx - Mixing transaction with ring signature
   * @returns Transaction result
   */
  async mixTransaction(mixingTx: MixingTransaction): Promise<TransactionResult> {
    if (!this.config.mixingPoolAddress) {
      throw new Error('Mixing pool not configured');
    }

    return this.contract.invokeAndWait(
      this.config.mixingPoolAddress,
      'mix_transaction',
      this.encodeMixingTransaction(mixingTx)
    );
  }

  /**
   * Register a mixing output (add to anonymity set)
   *
   * @param output - Mixing output to register
   * @returns Transaction result
   */
  async registerMixingOutput(output: MixingOutput): Promise<TransactionResult> {
    if (!this.config.mixingPoolAddress) {
      throw new Error('Mixing pool not configured');
    }

    return this.contract.invokeAndWait(
      this.config.mixingPoolAddress,
      'register_output',
      [
        toFelt(output.commitment.x),
        toFelt(output.commitment.y),
        ...this.encodeCiphertext(output.encrypted_amount),
        toFelt(output.claim_key.x),
        toFelt(output.claim_key.y),
      ]
    );
  }

  /**
   * Get available mixing outputs for ring construction
   *
   * @param count - Number of outputs to fetch
   * @returns Array of mixing outputs
   */
  async getMixingOutputs(count: number): Promise<MixingOutput[]> {
    if (!this.config.mixingPoolAddress) {
      throw new Error('Mixing pool not configured');
    }

    const response = await this.http.get<Array<{
      commitment: { x: string; y: string };
      encrypted_amount: { c1: { x: string; y: string }; c2: { x: string; y: string } };
      claim_key: { x: string; y: string };
      created_at: number;
      is_decoy_eligible: boolean;
    }>>(`/api/privacy/mixing/outputs?count=${count}`);

    return response.map(o => ({
      commitment: { x: BigInt(o.commitment.x), y: BigInt(o.commitment.y) },
      encrypted_amount: this.parseCiphertext(o.encrypted_amount),
      claim_key: { x: BigInt(o.claim_key.x), y: BigInt(o.claim_key.y) },
      created_at: o.created_at,
      is_decoy_eligible: o.is_decoy_eligible,
    }));
  }

  // =========================================================================
  // Threshold Decryption (DKG)
  // =========================================================================

  /**
   * Initiate DKG ceremony
   *
   * @param participants - Participant addresses
   * @param threshold - Required threshold (t of n)
   * @returns Transaction result with DKG session ID
   */
  async initiateDKG(
    participants: string[],
    threshold: number
  ): Promise<TransactionResult> {
    if (!this.config.dkgCoordinatorAddress) {
      throw new Error('DKG coordinator not configured');
    }

    if (threshold > participants.length) {
      throw new Error('Threshold cannot exceed participant count');
    }

    return this.contract.invokeAndWait(
      this.config.dkgCoordinatorAddress,
      'initiate_dkg',
      [toFelt(threshold), toFelt(participants.length), ...participants]
    );
  }

  /**
   * Submit DKG share
   *
   * @param share - DKG share with commitments
   * @returns Transaction result
   */
  async submitDKGShare(share: DKGShare): Promise<TransactionResult> {
    if (!this.config.dkgCoordinatorAddress) {
      throw new Error('DKG coordinator not configured');
    }

    return this.contract.invokeAndWait(
      this.config.dkgCoordinatorAddress,
      'submit_share',
      [
        toFelt(share.index),
        toFelt(share.share),
        toFelt(share.commitment.x),
        toFelt(share.commitment.y),
        ...share.verification_shares.flatMap(v => [toFelt(v.x), toFelt(v.y)]),
      ]
    );
  }

  /**
   * Request threshold decryption
   *
   * @param ciphertext - Ciphertext to decrypt
   * @returns Transaction result with request ID
   */
  async requestThresholdDecryption(
    ciphertext: ElGamalCiphertext
  ): Promise<TransactionResult> {
    if (!this.config.dkgCoordinatorAddress) {
      throw new Error('DKG coordinator not configured');
    }

    return this.contract.invokeAndWait(
      this.config.dkgCoordinatorAddress,
      'request_decryption',
      this.encodeCiphertext(ciphertext)
    );
  }

  /**
   * Get threshold decryption request status
   *
   * @param requestId - Request ID
   * @returns Request status
   */
  async getThresholdDecryptionStatus(
    requestId: bigint
  ): Promise<ThresholdDecryptionRequest> {
    const response = await this.http.get<{
      id: string;
      ciphertext: { c1: { x: string; y: string }; c2: { x: string; y: string } };
      requester: string;
      shares_received: number;
      threshold: number;
      status: string;
    }>(`/api/privacy/dkg/requests/${requestId}`);

    return {
      id: BigInt(response.id),
      ciphertext: this.parseCiphertext(response.ciphertext),
      requester: response.requester,
      shares_received: response.shares_received,
      threshold: response.threshold,
      status: response.status as ThresholdDecryptionRequest['status'],
    };
  }

  // =========================================================================
  // Multi-Asset Privacy
  // =========================================================================

  /**
   * Get private balances for all supported assets
   *
   * @param address - Account address
   * @returns Multi-asset encrypted balances
   */
  async getPrivateBalances(address: string): Promise<MultiAssetBalances> {
    const response = await this.http.get<{
      SAGE: any;
      USDC: any;
      STRK: any;
      WBTC: any;
      ETH: any;
    }>(`/api/privacy/accounts/${address}/balances`);

    return {
      SAGE: this.parseEncryptedBalance(response.SAGE),
      USDC: this.parseEncryptedBalance(response.USDC),
      STRK: this.parseEncryptedBalance(response.STRK),
      WBTC: this.parseEncryptedBalance(response.WBTC),
      ETH: this.parseEncryptedBalance(response.ETH),
    };
  }

  /**
   * Execute private swap between assets
   *
   * @param params - Swap parameters
   * @returns Transaction result
   */
  async privateSwap(params: PrivateSwapParams): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.privacyRouterAddress,
      'private_swap',
      [
        params.from_asset,
        params.to_asset,
        ...this.encodeCiphertext(params.encrypted_amount),
        ...this.encodeRangeProof(params.min_output_proof),
        ...this.encodeTransferProof(params.swap_proof),
      ]
    );
  }

  // =========================================================================
  // Emergency Operations
  // =========================================================================

  /**
   * Execute ragequit (emergency withdrawal)
   *
   * Reveals balance and withdraws to public address.
   * Use only in emergencies as it breaks privacy.
   *
   * @param proof - Ragequit proof with ownership and balance
   * @returns Transaction result
   */
  async ragequit(proof: RagequitProof): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.privacyRouterAddress,
      'ragequit',
      [
        ...this.encodeSchnorrProof(proof.ownership_proof),
        toFelt(proof.revealed_amount),
        ...this.encodeRangeProof(proof.balance_proof),
        toFelt(proof.timestamp),
      ]
    );
  }

  /**
   * Create ragequit proof
   *
   * @param privateKey - Private key
   * @param publicKey - Public key
   * @param balance - Current encrypted balance
   * @returns Ragequit proof
   */
  async createRagequitProof(
    privateKey: Uint8Array,
    publicKey: ECPoint,
    balance: EncryptedBalance,
    hint?: AEHint
  ): Promise<RagequitProof> {
    // Reveal the balance
    const revealed_amount = await this.revealBalance(balance, privateKey, hint);

    // Create ownership proof
    const ownership_proof = EncryptionHelper.createSchnorrProof(
      privateKey,
      publicKey,
      `ragequit:${Date.now()}`
    );

    // Create balance proof (placeholder - needs proper range proof)
    const balance_proof = {
      commitment: publicKey,
      proof_hash: BigInt(Date.now()),
      bit_commitments: [],
    };

    return {
      ownership_proof,
      revealed_amount,
      balance_proof,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  // =========================================================================
  // Utilities
  // =========================================================================

  /**
   * Encrypt an amount for a recipient
   *
   * @param amount - Amount to encrypt
   * @param recipientPublicKey - Recipient's public key
   * @returns ElGamal ciphertext
   */
  encrypt(amount: bigint, recipientPublicKey: ECPoint): ElGamalCiphertext {
    return EncryptionHelper.encrypt(amount, recipientPublicKey);
  }

  /**
   * Add two encrypted values
   *
   * @param a - First ciphertext
   * @param b - Second ciphertext
   * @returns Sum ciphertext
   */
  homomorphicAdd(a: ElGamalCiphertext, b: ElGamalCiphertext): ElGamalCiphertext {
    return EncryptionHelper.homomorphicAdd(a, b);
  }

  /**
   * Subtract encrypted values
   *
   * @param a - First ciphertext
   * @param b - Second ciphertext
   * @returns Difference ciphertext
   */
  homomorphicSub(a: ElGamalCiphertext, b: ElGamalCiphertext): ElGamalCiphertext {
    return EncryptionHelper.homomorphicSub(a, b);
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private parseEncryptedBalance(data: any): EncryptedBalance {
    return {
      ciphertext: this.parseCiphertext(data.ciphertext),
      pending_in: this.parseCiphertext(data.pending_in),
      pending_out: this.parseCiphertext(data.pending_out),
      epoch: data.epoch,
    };
  }

  private parseCiphertext(data: { c1: { x: string; y: string }; c2: { x: string; y: string } }): ElGamalCiphertext {
    return {
      c1: { x: BigInt(data.c1.x), y: BigInt(data.c1.y) },
      c2: { x: BigInt(data.c2.x), y: BigInt(data.c2.y) },
    };
  }

  private encodeCiphertext(ct: ElGamalCiphertext): string[] {
    return [
      toFelt(ct.c1.x),
      toFelt(ct.c1.y),
      toFelt(ct.c2.x),
      toFelt(ct.c2.y),
    ];
  }

  private encodeTransferProof(proof: TransferProof): string[] {
    return [
      ...this.encodeSchnorrProof(proof.sender_proof),
      ...this.encodeSchnorrProof(proof.receiver_proof),
      ...this.encodeRangeProof(proof.balance_proof),
      toFelt(proof.nullifier),
    ];
  }

  private encodeSchnorrProof(proof: { commitment: ECPoint; challenge: bigint; response: bigint }): string[] {
    return [
      toFelt(proof.commitment.x),
      toFelt(proof.commitment.y),
      toFelt(proof.challenge),
      toFelt(proof.response),
    ];
  }

  private encodeRangeProof(proof: { commitment: ECPoint; proof_hash: bigint; bit_commitments: ECPoint[] }): string[] {
    return [
      toFelt(proof.commitment.x),
      toFelt(proof.commitment.y),
      toFelt(proof.proof_hash),
      toFelt(proof.bit_commitments.length),
      ...proof.bit_commitments.flatMap(bc => [toFelt(bc.x), toFelt(bc.y)]),
    ];
  }

  private encodeSameEncryptionProof(proof: {
    commitment: ECPoint;
    challenge: bigint;
    response: bigint;
    commitment2: ECPoint;
    response2: bigint;
  }): string[] {
    return [
      toFelt(proof.commitment.x),
      toFelt(proof.commitment.y),
      toFelt(proof.challenge),
      toFelt(proof.response),
      toFelt(proof.commitment2.x),
      toFelt(proof.commitment2.y),
      toFelt(proof.response2),
    ];
  }

  private encodeMixingTransaction(tx: MixingTransaction): string[] {
    return [
      // Key image
      toFelt(tx.signature.key_image.x),
      toFelt(tx.signature.key_image.y),
      // Ring size
      toFelt(tx.signature.ring.length),
      // Ring members
      ...tx.signature.ring.flatMap(m => [
        toFelt(m.public_key.x),
        toFelt(m.public_key.y),
        toFelt(m.commitment.x),
        toFelt(m.commitment.y),
      ]),
      // c values
      ...tx.signature.c_values.map(c => toFelt(c)),
      // r values
      ...tx.signature.r_values.map(r => toFelt(r)),
      // Output
      ...this.encodeCiphertext(tx.output),
      // Recipient stealth address
      toFelt(tx.recipient.ephemeral_pubkey.x),
      toFelt(tx.recipient.ephemeral_pubkey.y),
      toFelt(tx.recipient.stealth_pubkey.x),
      toFelt(tx.recipient.stealth_pubkey.y),
      toFelt(tx.recipient.view_tag),
      // Fee commitment
      toFelt(tx.fee_commitment.x),
      toFelt(tx.fee_commitment.y),
    ];
  }
}

/**
 * Create a PrivacyClient instance
 */
export function createPrivacyClient(
  http: HttpClient,
  contract: ContractClient,
  privacyRouterAddress: string,
  dkgCoordinatorAddress?: string,
  mixingPoolAddress?: string
): PrivacyClient {
  return new PrivacyClient(http, contract, {
    privacyRouterAddress,
    dkgCoordinatorAddress,
    mixingPoolAddress,
  });
}

// Re-export types
export type {
  ECPoint,
  ElGamalCiphertext,
  EncryptedBalance,
  PrivacyKeyPair,
  PrivateAccount,
  PrivateTransferParams,
  PrivateTransferWithAuditParams,
  SteganographicTransaction,
  MixingTransaction,
  MixingOutput,
  RagequitProof,
  DKGShare,
  ThresholdDecryptionRequest,
  MultiAssetBalances,
  PrivateSwapParams,
  TransferProof,
  AEHint,
  StealthAddress,
};
