/**
 * DarkPool Client
 *
 * Commit-reveal batch auction trading with encrypted balances.
 *
 * Flow:
 *   1. deposit(token, amount) → fund your DarkPool balance
 *   2. commitOrder(pair, side, price, amount) → submit H(order)
 *   3. revealOrder(orderId) → open commitment in reveal phase
 *   4. settle/claim after matching
 */
import { CallData, hash, type Call } from 'starknet';
import type { ObelyskClient } from './client';
import { parseAmount, DARKPOOL_ASSET_IDS } from './contracts';
import {
  mod, randomScalar, pedersenCommit, elgamalEncrypt, createAEHint,
  FIELD_PRIME, CURVE_ORDER,
} from './crypto';

// ============================================================================
// Types
// ============================================================================

export interface DarkPoolDepositParams {
  token: string;
  amount: string;
}

export interface CommitOrderParams {
  /** Trading pair e.g. "SAGE/STRK" */
  pair: string;
  /** Order side */
  side: 'buy' | 'sell';
  /** Price in 18-decimal fixed point (human-readable string) */
  price: string;
  /** Amount in token decimals (human-readable string) */
  amount: string;
}

export interface RevealOrderParams {
  /** Order data from commitOrder result */
  orderData: DarkPoolOrderData;
}

export interface DarkPoolOrderData {
  orderId: string;
  pair: string;
  side: 'buy' | 'sell';
  price: string;
  amount: string;
  salt: string;
  amountBlinding: string;
  commitHash: string;
  epoch: number;
}

export interface EpochInfo {
  epoch: number;
  phase: 'Commit' | 'Reveal' | 'Settle' | 'Closed';
  blocksRemaining: number;
}

export interface ClaimFillParams {
  orderId: bigint;
  receiveCipher: { c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint } };
  receiveHint: bigint;
  receiveProof: { commitment: bigint; challenge: bigint; response: bigint };
  spendCipher: { c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint } };
  spendHint: bigint;
  spendProof: { commitment: bigint; challenge: bigint; response: bigint };
}

// ============================================================================
// Helpers
// ============================================================================

/** Order hash for commit phase: Poseidon(price, amount, side, giveAsset, wantAsset, salt) */
function hashOrder(price: bigint, amount: bigint, side: number, giveAsset: string, wantAsset: string, salt: bigint): string {
  return hash.computePoseidonHashOnElements([
    '0x' + price.toString(16),
    '0x' + amount.toString(16),
    side.toString(),
    giveAsset,
    wantAsset,
    '0x' + salt.toString(16),
  ]);
}

// ============================================================================
// DarkPool Client
// ============================================================================

export class DarkPoolClient {
  constructor(private readonly obelysk: ObelyskClient) {}

  private get darkPoolAddress(): string {
    const addr = this.obelysk.contracts.dark_pool;
    if (!addr) throw new Error('DarkPool contract not configured for this network');
    return addr;
  }

  /**
   * Deposit tokens into the DarkPool for trading.
   *
   * Encrypts the amount using ElGamal and generates an AE hint
   * for O(1) balance decryption.
   */
  async deposit(params: DarkPoolDepositParams): Promise<{ txHash: string }> {
    const account = this.obelysk.requireAccount();
    const tokenAddress = this.obelysk.getTokenAddress(params.token);
    const assetId = DARKPOOL_ASSET_IDS[params.token.toLowerCase()];
    if (!assetId) throw new Error(`Unknown DarkPool asset: ${params.token}`);

    const amountWei = parseAmount(params.amount, params.token);
    const amountLow = amountWei & ((1n << 128n) - 1n);
    const amountHigh = amountWei >> 128n;

    const keyPair = this.obelysk.privacy.generateKeyPair();
    const encrypted = this.obelysk.privacy.encrypt(amountWei, keyPair.publicKey);

    const nonce = randomScalar();
    const sharedSecret = BigInt(hash.computePoseidonHash(
      keyPair.privateKey.toString(),
      nonce.toString()
    ));
    const { encryptedAmount, mac } = createAEHint(amountWei, sharedSecret);

    const calls: Call[] = [
      {
        contractAddress: tokenAddress,
        entrypoint: 'approve',
        calldata: CallData.compile({
          spender: this.darkPoolAddress,
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
        }),
      },
      {
        contractAddress: this.darkPoolAddress,
        entrypoint: 'deposit',
        calldata: CallData.compile({
          asset: assetId,
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
          encrypted_amount: {
            c1_x: encrypted.c1.x.toString(),
            c1_y: encrypted.c1.y.toString(),
            c2_x: encrypted.c2.x.toString(),
            c2_y: encrypted.c2.y.toString(),
          },
          ae_hint: {
            encrypted_amount: encryptedAmount.toString(),
            nonce: nonce.toString(),
            mac: mac.toString(),
          },
        }),
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);
    return { txHash: result.transaction_hash };
  }

  /**
   * Commit an order in the current commit phase.
   *
   * Returns order data that must be saved for the reveal phase.
   */
  async commitOrder(params: CommitOrderParams): Promise<DarkPoolOrderData> {
    const account = this.obelysk.requireAccount();
    const [giveSymbol, wantSymbol] = params.pair.split('/');
    const giveAsset = DARKPOOL_ASSET_IDS[giveSymbol.toLowerCase()];
    const wantAsset = DARKPOOL_ASSET_IDS[wantSymbol.toLowerCase()];
    if (!giveAsset || !wantAsset) throw new Error(`Unknown pair: ${params.pair}`);

    const price = parseAmount(params.price, 'eth'); // 18-decimal fixed point
    const amount = parseAmount(params.amount, giveSymbol.toLowerCase());
    const salt = randomScalar();
    const side = params.side === 'sell' ? 1 : 0;

    const commitHash = hashOrder(price, amount, side, giveAsset, wantAsset, salt);

    const amountBlinding = randomScalar();
    const amountCommitment = pedersenCommit(amount, amountBlinding);

    const epochInfo = await this.getEpochInfo();

    const calls: Call[] = [
      {
        contractAddress: this.darkPoolAddress,
        entrypoint: 'commit_order',
        calldata: CallData.compile({
          order_hash: commitHash,
          amount_commitment_x: amountCommitment.x.toString(),
          amount_commitment_y: amountCommitment.y.toString(),
        }),
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);

    let orderId = '0';

    return {
      orderId,
      pair: params.pair,
      side: params.side,
      price: price.toString(),
      amount: amount.toString(),
      salt: salt.toString(),
      amountBlinding: amountBlinding.toString(),
      commitHash,
      epoch: epochInfo.epoch,
    };
  }

  /**
   * Reveal a previously committed order in the reveal phase.
   */
  async revealOrder(params: RevealOrderParams): Promise<{ txHash: string }> {
    const account = this.obelysk.requireAccount();
    const { orderData } = params;
    const [giveSymbol, wantSymbol] = orderData.pair.split('/');

    const calls: Call[] = [
      {
        contractAddress: this.darkPoolAddress,
        entrypoint: 'reveal_order',
        calldata: CallData.compile({
          order_id: orderData.orderId,
          price: orderData.price,
          amount: orderData.amount,
          side: orderData.side === 'sell' ? 1 : 0,
          give_asset: DARKPOOL_ASSET_IDS[giveSymbol.toLowerCase()],
          want_asset: DARKPOOL_ASSET_IDS[wantSymbol.toLowerCase()],
          salt: orderData.salt,
          amount_blinding: orderData.amountBlinding,
        }),
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);
    return { txHash: result.transaction_hash };
  }

  /**
   * Get current epoch info from the contract.
   */
  async getEpochInfo(): Promise<EpochInfo> {
    const [epochResult, phaseResult] = await Promise.all([
      this.obelysk.provider.callContract({
        contractAddress: this.darkPoolAddress,
        entrypoint: 'get_current_epoch',
        calldata: [],
      }),
      this.obelysk.provider.callContract({
        contractAddress: this.darkPoolAddress,
        entrypoint: 'get_epoch_phase',
        calldata: [],
      }),
    ]);

    const epoch = Number(BigInt(epochResult[0]));
    const phaseNum = Number(BigInt(phaseResult[0]));
    const phases: EpochInfo['phase'][] = ['Commit', 'Reveal', 'Settle', 'Closed'];

    return {
      epoch,
      phase: phases[phaseNum] ?? 'Closed',
      blocksRemaining: 0,
    };
  }

  /**
   * Get the total number of orders ever placed.
   */
  async getOrderCount(): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.darkPoolAddress,
      entrypoint: 'get_order_count',
      calldata: [],
    });
    return Number(BigInt(result[0]));
  }

  /**
   * Get order IDs for a given epoch.
   */
  async getEpochOrders(epochId: number): Promise<string[]> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.darkPoolAddress,
      entrypoint: 'get_epoch_orders',
      calldata: [epochId.toString()],
    });
    const len = Number(BigInt(result[0]));
    return result.slice(1, 1 + len);
  }

  /**
   * Get supported trading pairs.
   */
  async getSupportedPairs(): Promise<Array<{ giveAsset: string; wantAsset: string }>> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.darkPoolAddress,
      entrypoint: 'get_supported_pairs',
      calldata: [],
    });
    const len = Number(BigInt(result[0]));
    const pairs: Array<{ giveAsset: string; wantAsset: string }> = [];
    for (let i = 0; i < len; i++) {
      pairs.push({
        giveAsset: result[1 + i * 2],
        wantAsset: result[2 + i * 2],
      });
    }
    return pairs;
  }

  /**
   * Get fee info (bps, recipient). Returns null if fee module not yet active.
   */
  async getFeeInfo(): Promise<{ feeBps: number; feeRecipient: string } | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.darkPoolAddress,
        entrypoint: 'get_fee_info',
        calldata: [],
      });
      return {
        feeBps: Number(BigInt(result[0])),
        feeRecipient: result[1],
      };
    } catch {
      return null;
    }
  }

  /**
   * Withdraw tokens from the DarkPool.
   */
  async withdraw(params: { token: string; amount: string }): Promise<{ txHash: string }> {
    const account = this.obelysk.requireAccount();
    const assetId = DARKPOOL_ASSET_IDS[params.token.toLowerCase()];
    if (!assetId) throw new Error(`Unknown DarkPool asset: ${params.token}`);

    const amountWei = parseAmount(params.amount, params.token);
    const amountLow = amountWei & ((1n << 128n) - 1n);
    const amountHigh = amountWei >> 128n;

    const calls: Call[] = [
      {
        contractAddress: this.darkPoolAddress,
        entrypoint: 'withdraw',
        calldata: CallData.compile({
          asset: assetId,
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
        }),
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);
    return { txHash: result.transaction_hash };
  }

  /** Cancel an order before reveal. */
  async cancelOrder(orderId: bigint): Promise<string> {
    const account = this.obelysk.requireAccount();
    const low = (orderId & ((1n << 128n) - 1n)).toString();
    const high = (orderId >> 128n).toString();
    const result = await account.execute([{
      contractAddress: this.darkPoolAddress,
      entrypoint: 'cancel_order',
      calldata: [low, high],
    }]);
    return result.transaction_hash;
  }

  /** Claim fills after epoch settlement. */
  async claimFill(params: {
    orderId: bigint;
    receiveCipher: { c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint } };
    receiveHint: bigint;
    receiveProof: { commitment: bigint; challenge: bigint; response: bigint };
    spendCipher: { c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint } };
    spendHint: bigint;
    spendProof: { commitment: bigint; challenge: bigint; response: bigint };
  }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const oLow = (params.orderId & ((1n << 128n) - 1n)).toString();
    const oHigh = (params.orderId >> 128n).toString();
    const result = await account.execute([{
      contractAddress: this.darkPoolAddress,
      entrypoint: 'claim_fill',
      calldata: [
        oLow, oHigh,
        params.receiveCipher.c1.x.toString(), params.receiveCipher.c1.y.toString(),
        params.receiveCipher.c2.x.toString(), params.receiveCipher.c2.y.toString(),
        params.receiveHint.toString(),
        params.receiveProof.commitment.toString(), params.receiveProof.challenge.toString(), params.receiveProof.response.toString(),
        params.spendCipher.c1.x.toString(), params.spendCipher.c1.y.toString(),
        params.spendCipher.c2.x.toString(), params.spendCipher.c2.y.toString(),
        params.spendHint.toString(),
        params.spendProof.commitment.toString(), params.spendProof.challenge.toString(), params.spendProof.response.toString(),
      ],
    }]);
    return result.transaction_hash;
  }

  /** Register your ElGamal public key with the DarkPool. */
  async registerPubkey(pubkey: { x: bigint; y: bigint }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const result = await account.execute([{
      contractAddress: this.darkPoolAddress,
      entrypoint: 'register_pubkey',
      calldata: [pubkey.x.toString(), pubkey.y.toString()],
    }]);
    return result.transaction_hash;
  }

  /** Get the result of a settled epoch. */
  async getEpochResult(epochId: number): Promise<{ settled: boolean; clearingPrices: string[] } | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.darkPoolAddress,
        entrypoint: 'get_epoch_result',
        calldata: [epochId.toString()],
      });
      if (result.length < 2) return null;
      const settled = BigInt(result[0]) !== 0n;
      const priceCount = Number(BigInt(result[1]));
      const clearingPrices = result.slice(2, 2 + priceCount);
      return { settled, clearingPrices };
    } catch {
      return null;
    }
  }

  /** Check if an order has been claimed. */
  async isOrderClaimed(orderId: bigint): Promise<boolean> {
    try {
      const low = (orderId & ((1n << 128n) - 1n)).toString();
      const high = (orderId >> 128n).toString();
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.darkPoolAddress,
        entrypoint: 'is_order_claimed',
        calldata: [low, high],
      });
      return BigInt(result[0]) !== 0n;
    } catch {
      return false;
    }
  }

  /** Get a trader's registered public key. */
  async getTraderPubkey(address: string): Promise<{ x: bigint; y: bigint } | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.darkPoolAddress,
        entrypoint: 'get_trader_pubkey',
        calldata: [address],
      });
      const x = BigInt(result[0]);
      const y = BigInt(result[1]);
      if (x === 0n && y === 0n) return null;
      return { x, y };
    } catch {
      return null;
    }
  }

  /** Get encrypted balance for a trader and asset. */
  async getEncryptedBalance(address: string, assetId: string): Promise<{ c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint } } | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.darkPoolAddress,
        entrypoint: 'get_encrypted_balance',
        calldata: [address, assetId],
      });
      if (result.length < 4) return null;
      return {
        c1: { x: BigInt(result[0]), y: BigInt(result[1]) },
        c2: { x: BigInt(result[2]), y: BigInt(result[3]) },
      };
    } catch {
      return null;
    }
  }
}
