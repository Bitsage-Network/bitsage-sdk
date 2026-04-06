/**
 * Privacy Router Client
 *
 * Read-only views into the Obelysk Privacy Router — the core private
 * balance, transfer, and audit infrastructure.
 */
import type { ObelyskClient } from './client';
import type { ECPoint } from './crypto';

export interface PrivateAccount {
  publicKey: ECPoint;
  encryptedBalance: { c1: ECPoint; c2: ECPoint };
  registered: boolean;
}

export class PrivacyRouterClient {
  constructor(private readonly obelysk: ObelyskClient) {}

  private get contractAddress(): string {
    const addr = this.obelysk.contracts.privacy_router;
    if (!addr) throw new Error('PrivacyRouter not configured for this network');
    return addr;
  }

  /**
   * Get a registered private account's info.
   */
  async getAccount(address: string): Promise<PrivateAccount | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'get_account',
        calldata: [address],
      });
      if (result.length < 8) return null;
      return {
        publicKey: { x: BigInt(result[0]), y: BigInt(result[1]) },
        encryptedBalance: {
          c1: { x: BigInt(result[2]), y: BigInt(result[3]) },
          c2: { x: BigInt(result[4]), y: BigInt(result[5]) },
        },
        registered: BigInt(result[6]) !== 0n,
      };
    } catch {
      return null;
    }
  }

  /** Check if a nullifier has been spent. */
  async isNullifierUsed(nullifier: string): Promise<boolean> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'is_nullifier_used',
        calldata: [nullifier],
      });
      return BigInt(result[0]) !== 0n;
    } catch {
      return false;
    }
  }

  /** Get the current nullifier tree root. */
  async getNullifierTreeRoot(): Promise<string> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_nullifier_tree_root',
      calldata: [],
    });
    return result[0];
  }

  /** Get the current epoch of the privacy router. */
  async getCurrentEpoch(): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_current_epoch',
      calldata: [],
    });
    return Number(BigInt(result[0]));
  }

  /** Get total nullifier count. */
  async getNullifierCount(): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_nullifier_count',
      calldata: [],
    });
    return Number(BigInt(result[0]));
  }

  /** Check if an asset ID is supported. */
  async isAssetSupported(assetId: number): Promise<boolean> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'is_asset_supported',
        calldata: [assetId.toString()],
      });
      return BigInt(result[0]) !== 0n;
    } catch {
      return false;
    }
  }

  /** Get the token address for an asset ID. */
  async getAssetToken(assetId: number): Promise<string> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_asset_token',
      calldata: [assetId.toString()],
    });
    return result[0];
  }

  /** Get the number of auditors. */
  async getAuditorCount(): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_auditor_count',
      calldata: [],
    });
    return Number(BigInt(result[0]));
  }

  /** Check if an address is a registered auditor. */
  async isAuditor(address: string): Promise<boolean> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'is_auditor',
        calldata: [address],
      });
      return BigInt(result[0]) !== 0n;
    } catch {
      return false;
    }
  }

  /** Get the audit approval threshold. */
  async getAuditThreshold(): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_audit_threshold',
      calldata: [],
    });
    return Number(BigInt(result[0]));
  }

  /** Get the large transfer threshold. */
  async getLargeTransferThreshold(): Promise<bigint> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_large_transfer_threshold',
      calldata: [],
    });
    return BigInt(result[0]);
  }

  /** Check if the Lean IMT is active. */
  async isLeanIMTActive(): Promise<boolean> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'is_lean_imt_active',
        calldata: [],
      });
      return BigInt(result[0]) !== 0n;
    } catch {
      return false;
    }
  }

  /** Get pending audit/disclosure request count. */
  async getPendingRequestCount(): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_pending_request_count',
      calldata: [],
    });
    return Number(BigInt(result[0]));
  }

  /** Register an account with the privacy router. */
  async registerAccount(publicKey: { x: bigint; y: bigint }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const result = await account.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'register_account',
      calldata: [publicKey.x.toString(), publicKey.y.toString()],
    }]);
    return result.transaction_hash;
  }

  /** Deposit tokens into encrypted balance. */
  async deposit(params: { amount: bigint; encryptedAmount: { c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint } }; proof: { commitment: bigint; challenge: bigint; response: bigint } }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const low = (params.amount & ((1n << 128n) - 1n)).toString();
    const high = (params.amount >> 128n).toString();
    const result = await account.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'deposit',
      calldata: [
        low, high,
        params.encryptedAmount.c1.x.toString(), params.encryptedAmount.c1.y.toString(),
        params.encryptedAmount.c2.x.toString(), params.encryptedAmount.c2.y.toString(),
        params.proof.commitment.toString(), params.proof.challenge.toString(), params.proof.response.toString(),
      ],
    }]);
    return result.transaction_hash;
  }

  /** Withdraw from encrypted balance to public. */
  async withdraw(params: { amount: bigint; encryptedDelta: { c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint } }; proof: { commitment: bigint; challenge: bigint; response: bigint }; rangeProofData?: string[] }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const low = (params.amount & ((1n << 128n) - 1n)).toString();
    const high = (params.amount >> 128n).toString();
    const calldata = [
      low, high,
      params.encryptedDelta.c1.x.toString(), params.encryptedDelta.c1.y.toString(),
      params.encryptedDelta.c2.x.toString(), params.encryptedDelta.c2.y.toString(),
      params.proof.commitment.toString(), params.proof.challenge.toString(), params.proof.response.toString(),
    ];
    if (params.rangeProofData) calldata.push(...params.rangeProofData);
    const result = await account.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'withdraw',
      calldata,
    }]);
    return result.transaction_hash;
  }

  /** Private transfer between accounts. */
  async privateTransfer(params: {
    to: string;
    senderCipher: { c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint } };
    receiverCipher: { c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint } };
    proof: { commitment: bigint; challenge: bigint; response: bigint };
    senderAeHint: bigint;
    receiverAeHint: bigint;
  }): Promise<string> {
    const account = this.obelysk.requireAccount();
    const result = await account.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'private_transfer',
      calldata: [
        params.to,
        params.senderCipher.c1.x.toString(), params.senderCipher.c1.y.toString(),
        params.senderCipher.c2.x.toString(), params.senderCipher.c2.y.toString(),
        params.receiverCipher.c1.x.toString(), params.receiverCipher.c1.y.toString(),
        params.receiverCipher.c2.x.toString(), params.receiverCipher.c2.y.toString(),
        params.proof.commitment.toString(), params.proof.challenge.toString(), params.proof.response.toString(),
        params.senderAeHint.toString(), params.receiverAeHint.toString(),
      ],
    }]);
    return result.transaction_hash;
  }

  /** Request disclosure of a nullifier (audit). */
  async requestDisclosure(nullifier: string, reason: string): Promise<string> {
    const account = this.obelysk.requireAccount();
    const result = await account.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'request_disclosure',
      calldata: [nullifier, reason],
    }]);
    return result.transaction_hash;
  }

  /** Ragequit: emergency withdrawal with proof. */
  async ragequit(proof: string[]): Promise<string> {
    const account = this.obelysk.requireAccount();
    const result = await account.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'ragequit',
      calldata: proof,
    }]);
    return result.transaction_hash;
  }

  /** Get the nullifier tree state. */
  async getNullifierTreeState(): Promise<{ root: string; size: number }> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_nullifier_tree_state',
      calldata: [],
    });
    return { root: result[0], size: Number(BigInt(result[1])) };
  }

  /** Get account balance hints (for O(1) decryption). */
  async getAccountHints(address: string): Promise<{ balanceHint: bigint; pendingInHint: bigint; pendingOutHint: bigint } | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'get_account_hints',
        calldata: [address],
      });
      return {
        balanceHint: BigInt(result[0]),
        pendingInHint: BigInt(result[1]),
        pendingOutHint: BigInt(result[2]),
      };
    } catch {
      return null;
    }
  }
}
