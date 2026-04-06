/**
 * Stealth Payments Client
 *
 * Send tokens to stealth addresses for receiver privacy.
 * The sender generates an ephemeral key pair, derives a stealth address,
 * and sends tokens there. Only the receiver can detect and spend.
 *
 * Flow:
 *   1. Sender looks up receiver's stealth meta-address (spend_pk, view_pk) from registry
 *   2. Sender generates ephemeral key, derives stealth address
 *   3. Sender sends tokens to stealth address + publishes ephemeral pubkey
 *   4. Receiver scans ephemeral pubkeys, detects payments, derives spend key
 */
import { CallData, hash, type Call } from 'starknet';
import type { ObelyskClient } from './client';
import { parseAmount } from './contracts';
import { mod, ecAdd, ecMul, randomScalar, FIELD_PRIME, GENERATOR_G } from './crypto';

// ============================================================================
// Types
// ============================================================================

export interface StealthSendParams {
  /** Recipient's Starknet address (must be registered in StealthRegistry) */
  to: string;
  /** Token symbol */
  token: string;
  /** Human-readable amount */
  amount: string;
}

export interface StealthMetaAddress {
  spendPublicKey: { x: bigint; y: bigint };
  viewPublicKey: { x: bigint; y: bigint };
}

export interface StealthSpendingProof { commitment: bigint; challenge: bigint; response: bigint; stealthPubkey: { x: bigint; y: bigint }; }
export interface StealthAnnouncement { ephemeralPubkey: { x: bigint; y: bigint }; stealthAddress: string; viewTag: string; token: string; amount: bigint; }
export interface ClaimParams { announcementIndex: number; spendingProof: StealthSpendingProof; recipient: string; }

// ============================================================================
// Stealth Client
// ============================================================================

export class StealthClient {
  constructor(private readonly obelysk: ObelyskClient) {}

  private get registryAddress(): string {
    const addr = this.obelysk.contracts.stealth_registry;
    if (!addr) throw new Error('StealthRegistry not configured for this network');
    return addr;
  }

  /**
   * Look up a recipient's stealth meta-address from the registry.
   */
  async lookupRecipient(address: string): Promise<StealthMetaAddress | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.registryAddress,
        entrypoint: 'get_meta_address',
        calldata: [address],
      });

      if (result.length < 4 || result[0] === '0x0') return null;

      return {
        spendPublicKey: { x: BigInt(result[0]), y: BigInt(result[1]) },
        viewPublicKey: { x: BigInt(result[2]), y: BigInt(result[3]) },
      };
    } catch {
      return null;
    }
  }

  /**
   * Send tokens to a stealth address.
   *
   * Generates ephemeral key, derives stealth address via ECDH,
   * sends tokens + publishes ephemeral pubkey on-chain.
   */
  async send(params: StealthSendParams): Promise<{ txHash: string; stealthAddress: string; ephemeralPubKey: { x: string; y: string } }> {
    const account = this.obelysk.requireAccount();
    const tokenAddress = this.obelysk.getTokenAddress(params.token);

    const meta = await this.lookupRecipient(params.to);
    if (!meta) throw new Error(`Recipient ${params.to} not registered in StealthRegistry`);

    // Generate ephemeral key pair
    const ephemeralSecret = randomScalar();
    const ephemeralPubKey = ecMul(ephemeralSecret, GENERATOR_G);

    // ECDH: shared_secret = Poseidon(ephemeral_secret * view_public_key)
    const sharedPoint = ecMul(ephemeralSecret, meta.viewPublicKey);
    const sharedSecretHash = BigInt(hash.computePoseidonHash(
      sharedPoint.x.toString(),
      sharedPoint.y.toString()
    ));

    // Stealth public key: spend_pk + shared_secret * G
    const stealthOffset = ecMul(sharedSecretHash, GENERATOR_G);
    const stealthPubKey = ecAdd(meta.spendPublicKey, stealthOffset);

    // Derive stealth address from public key (Poseidon hash)
    const stealthAddress = '0x' + mod(
      BigInt(hash.computePoseidonHash(stealthPubKey.x.toString(), stealthPubKey.y.toString())),
      FIELD_PRIME
    ).toString(16);

    const amountWei = parseAmount(params.amount, params.token);
    const amountLow = amountWei & ((1n << 128n) - 1n);
    const amountHigh = amountWei >> 128n;

    const calls: Call[] = [
      {
        contractAddress: tokenAddress,
        entrypoint: 'transfer',
        calldata: CallData.compile({
          recipient: stealthAddress,
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
        }),
      },
      {
        contractAddress: this.registryAddress,
        entrypoint: 'announce',
        calldata: CallData.compile({
          ephemeral_pub_key_x: ephemeralPubKey.x.toString(),
          ephemeral_pub_key_y: ephemeralPubKey.y.toString(),
          stealth_address: stealthAddress,
          token: tokenAddress,
        }),
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);

    return {
      txHash: result.transaction_hash,
      stealthAddress,
      ephemeralPubKey: {
        x: '0x' + ephemeralPubKey.x.toString(16),
        y: '0x' + ephemeralPubKey.y.toString(16),
      },
    };
  }

  /**
   * Check if an address has a registered stealth meta-address.
   */
  async hasMetaAddress(address: string): Promise<boolean> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.registryAddress,
        entrypoint: 'has_meta_address',
        calldata: [address],
      });
      return BigInt(result[0]) !== 0n;
    } catch {
      return false;
    }
  }

  /**
   * Get the total number of stealth payment announcements.
   */
  async getAnnouncementCount(): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.registryAddress,
      entrypoint: 'get_announcement_count',
      calldata: [],
    });
    return Number(BigInt(result[0]));
  }

  /**
   * Get the total number of registered workers/recipients.
   */
  async getRegisteredCount(): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.registryAddress,
      entrypoint: 'get_registered_worker_count',
      calldata: [],
    });
    return Number(BigInt(result[0]));
  }

  /**
   * Check if a stealth payment announcement has been claimed.
   */
  async isClaimed(announcementIndex: number): Promise<boolean> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.registryAddress,
      entrypoint: 'is_claimed',
      calldata: [announcementIndex.toString()],
    });
    return BigInt(result[0]) !== 0n;
  }

  /**
   * Register your stealth meta-address in the registry.
   */
  async register(spendPubKey: { x: bigint; y: bigint }, viewPubKey: { x: bigint; y: bigint }): Promise<{ txHash: string }> {
    const account = this.obelysk.requireAccount();

    const calls: Call[] = [
      {
        contractAddress: this.registryAddress,
        entrypoint: 'register_meta_address',
        calldata: CallData.compile({
          spend_pub_key_x: spendPubKey.x.toString(),
          spend_pub_key_y: spendPubKey.y.toString(),
          view_pub_key_x: viewPubKey.x.toString(),
          view_pub_key_y: viewPubKey.y.toString(),
        }),
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);
    return { txHash: result.transaction_hash };
  }

  /** Claim a stealth payment. */
  async claim(params: { announcementIndex: number; spendingProof: { commitment: bigint; challenge: bigint; response: bigint; stealthPubkey: { x: bigint; y: bigint } }; recipient: string }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const p = params.spendingProof;
    const result = await account.execute([{
      contractAddress: this.registryAddress,
      entrypoint: 'claim_stealth_payment',
      calldata: [
        params.announcementIndex.toString(),
        p.commitment.toString(), p.challenge.toString(), p.response.toString(),
        p.stealthPubkey.x.toString(), p.stealthPubkey.y.toString(),
        params.recipient,
      ],
    }]);
    return result.transaction_hash;
  }

  /** Batch claim multiple stealth payments. */
  async batchClaim(params: { announcementIndices: number[]; spendingProofs: Array<{ commitment: bigint; challenge: bigint; response: bigint; stealthPubkey: { x: bigint; y: bigint } }>; recipient: string }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const calldata: string[] = [
      params.announcementIndices.length.toString(),
      ...params.announcementIndices.map(i => i.toString()),
      params.spendingProofs.length.toString(),
      ...params.spendingProofs.flatMap(p => [
        p.commitment.toString(), p.challenge.toString(), p.response.toString(),
        p.stealthPubkey.x.toString(), p.stealthPubkey.y.toString(),
      ]),
      params.recipient,
    ];
    const result = await account.execute([{
      contractAddress: this.registryAddress,
      entrypoint: 'batch_claim_stealth_payments',
      calldata,
    }]);
    return result.transaction_hash;
  }

  /** Update your stealth meta-address. */
  async updateMetaAddress(spendPubKey: { x: bigint; y: bigint }, viewPubKey: { x: bigint; y: bigint }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const result = await account.execute([{
      contractAddress: this.registryAddress,
      entrypoint: 'update_meta_address',
      calldata: [spendPubKey.x.toString(), spendPubKey.y.toString(), viewPubKey.x.toString(), viewPubKey.y.toString()],
    }]);
    return result.transaction_hash;
  }

  /** Get a specific announcement by index. */
  async getAnnouncement(index: number): Promise<{ ephemeralPubkey: { x: bigint; y: bigint }; stealthAddress: string; viewTag: string; token: string; amount: bigint } | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.registryAddress,
        entrypoint: 'get_announcement',
        calldata: [index.toString()],
      });
      return {
        ephemeralPubkey: { x: BigInt(result[0]), y: BigInt(result[1]) },
        stealthAddress: result[2],
        viewTag: result[3],
        token: result[4],
        amount: BigInt(result[5]),
      };
    } catch {
      return null;
    }
  }

  /** Get announcements in a range. */
  async getAnnouncementsRange(start: number, end: number): Promise<Array<{ ephemeralPubkey: { x: bigint; y: bigint }; stealthAddress: string; viewTag: string; token: string; amount: bigint }>> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.registryAddress,
        entrypoint: 'get_announcements_range',
        calldata: [start.toString(), end.toString()],
      });
      // First element is array length
      const count = Number(BigInt(result[0]));
      const items: Array<{ ephemeralPubkey: { x: bigint; y: bigint }; stealthAddress: string; viewTag: string; token: string; amount: bigint }> = [];
      for (let i = 0; i < count; i++) {
        const base = 1 + i * 6;
        items.push({
          ephemeralPubkey: { x: BigInt(result[base]), y: BigInt(result[base + 1]) },
          stealthAddress: result[base + 2],
          viewTag: result[base + 3],
          token: result[base + 4],
          amount: BigInt(result[base + 5]),
        });
      }
      return items;
    } catch {
      return [];
    }
  }
}
