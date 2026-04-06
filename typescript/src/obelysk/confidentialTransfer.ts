/**
 * Confidential Transfer Client
 *
 * Peer-to-peer transfers with ElGamal encrypted amounts.
 * The on-chain contract only sees ciphertexts — amounts are hidden.
 */
import { CallData, hash, type Call } from 'starknet';
import type { ObelyskClient } from './client';
import { parseAmount } from './contracts';
import {
  mod, ecMul, randomScalar, elgamalEncrypt, createEncryptionProof, createAEHint,
  FIELD_PRIME, type ECPoint,
} from './crypto';

export interface TransferParams {
  /** Recipient's Starknet address */
  to: string;
  /** Recipient's ElGamal public key */
  recipientPublicKey: ECPoint;
  /** Amount (human-readable) */
  amount: string;
  /** Token symbol */
  token: string;
}

export interface FundParams { assetId: number; amount: bigint; encryptionRandomness: bigint; aeHint: bigint; }
export interface WithdrawCTParams { to: string; assetId: number; amount: bigint; proof: { commitment: bigint; challenge: bigint; response: bigint }; }

// ============================================================================
// Confidential Transfer Client
// ============================================================================

export class ConfidentialTransferClient {
  constructor(private readonly obelysk: ObelyskClient) {}

  private get contractAddress(): string {
    const addr = this.obelysk.contracts.confidential_transfer;
    if (!addr) throw new Error('ConfidentialTransfer not configured for this network');
    return addr;
  }

  /**
   * Send a confidential transfer with ElGamal encrypted amount.
   *
   * Generates encryption proof (Schnorr) to prove the ciphertext is well-formed.
   */
  async transfer(params: TransferParams): Promise<{ txHash: string }> {
    const account = this.obelysk.requireAccount();
    const tokenAddress = this.obelysk.getTokenAddress(params.token);
    const amountWei = parseAmount(params.amount, params.token);

    // Encrypt amount for recipient
    const { c1, c2, randomness } = elgamalEncrypt(amountWei, params.recipientPublicKey);

    // Generate Schnorr proof of correct encryption
    const proof = createEncryptionProof(randomness, c1);

    // AE hint for recipient (O(1) decryption)
    const nonce = randomScalar();
    const sharedPoint = ecMul(randomness, params.recipientPublicKey);
    const sharedSecret = BigInt(hash.computePoseidonHash(
      sharedPoint.x.toString(),
      sharedPoint.y.toString()
    ));
    const { encryptedAmount: encryptedHint, mac } = createAEHint(amountWei, sharedSecret);

    const amountLow = amountWei & ((1n << 128n) - 1n);
    const amountHigh = amountWei >> 128n;

    const calls: Call[] = [
      {
        contractAddress: tokenAddress,
        entrypoint: 'approve',
        calldata: CallData.compile({
          spender: this.contractAddress,
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
        }),
      },
      {
        contractAddress: this.contractAddress,
        entrypoint: 'confidential_transfer',
        calldata: CallData.compile({
          recipient: params.to,
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
          encrypted_amount: {
            c1_x: c1.x.toString(),
            c1_y: c1.y.toString(),
            c2_x: c2.x.toString(),
            c2_y: c2.y.toString(),
          },
          encryption_proof: {
            commitment_x: proof.commitment.x.toString(),
            commitment_y: proof.commitment.y.toString(),
            challenge: proof.challenge.toString(),
            response: proof.response.toString(),
          },
          ae_hint: {
            encrypted_amount: encryptedHint.toString(),
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
   * Read your encrypted balance from the contract.
   */
  async getEncryptedBalance(address: string, token: string): Promise<{ c1: ECPoint; c2: ECPoint } | null> {
    try {
      const tokenAddress = this.obelysk.getTokenAddress(token);
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'get_encrypted_balance',
        calldata: [address, tokenAddress],
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

  /** Register an ElGamal public key for confidential transfers. */
  async register(publicKey: { x: bigint; y: bigint }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const result = await account.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'register',
      calldata: [publicKey.x.toString(), publicKey.y.toString()],
    }]);
    return result.transaction_hash;
  }

  /** Fund: deposit public tokens into encrypted balance. */
  async fund(params: { assetId: number; amount: bigint; encryptionRandomness: bigint; aeHint: bigint }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const low = (params.amount & ((1n << 128n) - 1n)).toString();
    const high = (params.amount >> 128n).toString();
    const result = await account.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'fund',
      calldata: [params.assetId.toString(), low, high, params.encryptionRandomness.toString(), params.aeHint.toString()],
    }]);
    return result.transaction_hash;
  }

  /** Fund another account's encrypted balance. */
  async fundFor(params: { account: string; assetId: number; amount: bigint; encryptionRandomness: bigint; aeHint: bigint }): Promise<string> {
    const signer = this.obelysk.requireAccount();
    const low = (params.amount & ((1n << 128n) - 1n)).toString();
    const high = (params.amount >> 128n).toString();
    const result = await signer.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'fund_for',
      calldata: [params.account, params.assetId.toString(), low, high, params.encryptionRandomness.toString(), params.aeHint.toString()],
    }]);
    return result.transaction_hash;
  }

  /** Rollover: claim pending incoming transfers into your balance. */
  async rollover(assetId: number): Promise<string> {
    const account = this.obelysk.requireAccount();
    const result = await account.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'rollover',
      calldata: [assetId.toString()],
    }]);
    return result.transaction_hash;
  }

  /** Withdraw: convert encrypted balance back to public tokens. */
  async withdraw(params: { to: string; assetId: number; amount: bigint; proof: { commitment: bigint; challenge: bigint; response: bigint } }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const low = (params.amount & ((1n << 128n) - 1n)).toString();
    const high = (params.amount >> 128n).toString();
    const result = await account.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'withdraw',
      calldata: [params.to, params.assetId.toString(), low, high, params.proof.commitment.toString(), params.proof.challenge.toString(), params.proof.response.toString()],
    }]);
    return result.transaction_hash;
  }

  /** Get a registered public key. */
  async getPublicKey(address: string): Promise<{ x: bigint; y: bigint } | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'get_public_key',
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
}
