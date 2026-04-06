/**
 * Shielded Swap Router Client
 *
 * Read swap router state (pools, fees, swap count).
 * Actual swaps require withdrawal proofs and are executed via the full
 * privacy pool → swap → re-deposit flow.
 */
import type { ObelyskClient } from './client';

export interface ShieldedSwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  minAmountOut: bigint;
  nullifier: string;
  merkleRoot: string;
  merkleProof: string[];
  newCommitment: string;
  encryptedAmount: bigint;
  proof: string;
}

export class ShieldedSwapClient {
  constructor(private readonly obelysk: ObelyskClient) {}

  private get contractAddress(): string {
    const addr = this.obelysk.contracts.shielded_swap;
    if (!addr) throw new Error('ShieldedSwap not configured for this network');
    return addr;
  }

  /** Get total number of shielded swaps executed. */
  async getSwapCount(): Promise<number> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_swap_count',
      calldata: [],
    });
    return Number(BigInt(result[0]));
  }

  /** Get the privacy pool address registered for a token. */
  async getPool(tokenAddress: string): Promise<string | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'get_pool',
        calldata: [tokenAddress],
      });
      return result[0] === '0x0' ? null : result[0];
    } catch {
      return null;
    }
  }

  /** Get the Ekubo core address (AMM integration). */
  async getEkuboCore(): Promise<string> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_ekubo_core',
      calldata: [],
    });
    return result[0];
  }

  /** Get swap fee info (bps, recipient). Returns null if not active. */
  async getSwapFeeInfo(): Promise<{ feeBps: number; feeRecipient: string } | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'get_swap_fee_info',
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

  /** Get contract owner. */
  async getOwner(): Promise<string> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'owner',
      calldata: [],
    });
    return result[0];
  }

  /**
   * Execute a shielded swap (privacy pool -> AMM -> re-deposit).
   * This is the full privacy-preserving swap flow.
   */
  async shieldedSwap(params: ShieldedSwapParams): Promise<string> {
    const account = this.obelysk.requireAccount();
    const result = await account.execute([{
      contractAddress: this.contractAddress,
      entrypoint: 'shielded_swap',
      calldata: [
        params.tokenIn,
        params.tokenOut,
        params.amountIn.toString(),
        params.minAmountOut.toString(),
        params.nullifier,
        params.merkleRoot,
        ...params.merkleProof,
        params.newCommitment,
        params.encryptedAmount.toString(),
        params.proof,
      ],
    }]);
    return result.transaction_hash;
  }
}
