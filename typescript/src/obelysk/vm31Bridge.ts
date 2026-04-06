/**
 * VM31 Confidential Bridge Client
 *
 * Read-only views into the VM31Bridge contract, which facilitates
 * bridging between the VM31 UTXO pool and the ElGamal-based
 * ConfidentialTransfer system.
 */
import type { ObelyskClient } from './client';

// ============================================================================
// Types
// ============================================================================

export interface AssetPair {
  vm31AssetId: string;
  confidentialAssetId: string;
}

export interface BridgeConfig {
  relayer: string;
  vm31Pool: string;
  confidentialTransfer: string;
}

// ============================================================================
// VM31 Bridge Client
// ============================================================================

export class VM31BridgeClient {
  constructor(private readonly obelysk: ObelyskClient) {}

  private get contractAddress(): string {
    return this.obelysk.contracts.vm31_bridge;
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

  /** Get the VM31Pool contract address */
  async getVM31Pool(): Promise<string> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_vm31_pool',
      calldata: [],
    });
    return result[0];
  }

  /** Get the ConfidentialTransfer contract address */
  async getConfidentialTransfer(): Promise<string> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_confidential_transfer',
      calldata: [],
    });
    return result[0];
  }

  /** Get the asset pair mapping for a given token address */
  async getAssetPair(tokenAddress: string): Promise<AssetPair | null> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'get_asset_pair',
        calldata: [tokenAddress],
      });
      return {
        vm31AssetId: result[0],
        confidentialAssetId: result[1],
      };
    } catch {
      return null;
    }
  }

  /** Check if a bridge key has already been processed */
  async isBridgeKeyProcessed(bridgeKey: string): Promise<boolean> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'is_bridge_key_processed',
      calldata: [bridgeKey],
    });
    return BigInt(result[0]) !== 0n;
  }

  /** Compute a bridge key from withdrawal parameters */
  async computeBridgeKey(params: {
    batchId: string;
    withdrawalIdx: number;
    payoutRecipient: string;
    creditRecipient: string;
    token: string;
    amount: bigint;
  }): Promise<string> {
    const low = params.amount & ((1n << 128n) - 1n);
    const high = params.amount >> 128n;
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'compute_bridge_key',
      calldata: [
        params.batchId,
        params.withdrawalIdx.toString(),
        params.payoutRecipient,
        params.creditRecipient,
        params.token,
        low.toString(),
        high.toString(),
      ],
    });
    return result[0];
  }

  /** Get full bridge configuration (relayer, vm31Pool, confidentialTransfer) */
  async getConfig(): Promise<BridgeConfig> {
    const [relayer, vm31Pool, confidentialTransfer] = await Promise.all([
      this.getRelayer(),
      this.getVM31Pool(),
      this.getConfidentialTransfer(),
    ]);
    return { relayer, vm31Pool, confidentialTransfer };
  }

  /** Get pending upgrade info, if any */
  async getPendingUpgrade(): Promise<{ classHash: string; scheduledAt: number } | null> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_pending_upgrade',
      calldata: [],
    });
    const classHash = result[0];
    if (classHash === '0x0') return null;
    return {
      classHash,
      scheduledAt: Number(BigInt(result[1])),
    };
  }

  /** Check if the bridge contract is paused */
  async isPaused(): Promise<boolean> {
    try {
      const result = await this.obelysk.provider.callContract({
        contractAddress: this.contractAddress,
        entrypoint: 'is_paused',
        calldata: [],
      });
      return BigInt(result[0]) !== 0n;
    } catch {
      return false;
    }
  }
}
