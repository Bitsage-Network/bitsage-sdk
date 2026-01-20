/**
 * Starknet Contract Client
 * Handles direct contract interactions for on-chain operations
 */

import { SdkError } from '../client';
import type { TransactionResult } from '../types/generated/payments';

export interface ContractConfig {
  /** Starknet RPC URL */
  rpcUrl: string;
  /** Network (mainnet, sepolia, local) */
  network: 'mainnet' | 'sepolia' | 'local';
  /** Account address for signing */
  accountAddress?: string;
  /** Private key for signing */
  privateKey?: string;
  /** Maximum gas price (wei) */
  maxGasPrice?: bigint;
  /** Transaction confirmation timeout (ms) */
  confirmationTimeoutMs: number;
  /** Polling interval for transaction status (ms) */
  pollingIntervalMs: number;
}

export const DEFAULT_CONTRACT_CONFIG: ContractConfig = {
  rpcUrl: 'https://starknet-sepolia.public.blastapi.io',
  network: 'sepolia',
  confirmationTimeoutMs: 120000,
  pollingIntervalMs: 3000,
};

/** Call result from contract */
export interface CallResult {
  result: string[];
}

/** Transaction status */
export type TxStatus =
  | 'NOT_RECEIVED'
  | 'RECEIVED'
  | 'PENDING'
  | 'ACCEPTED_ON_L2'
  | 'ACCEPTED_ON_L1'
  | 'REJECTED';

/** Transaction receipt */
export interface TransactionReceipt {
  transaction_hash: string;
  status: TxStatus;
  block_hash?: string;
  block_number?: number;
  actual_fee?: {
    amount: string;
    unit: string;
  };
  execution_status?: 'SUCCEEDED' | 'REVERTED';
  revert_reason?: string;
}

/**
 * Starknet Contract Client
 *
 * Provides direct contract interaction capabilities for:
 * - Reading contract state (call)
 * - Writing to contracts (invoke)
 * - Waiting for transaction confirmation
 */
export class ContractClient {
  private config: ContractConfig;

  constructor(config: Partial<ContractConfig> = {}) {
    this.config = { ...DEFAULT_CONTRACT_CONFIG, ...config };
  }

  /**
   * Configure wallet for signing transactions
   */
  withWallet(accountAddress: string, privateKey: string): this {
    this.config.accountAddress = accountAddress;
    this.config.privateKey = privateKey;
    return this;
  }

  /**
   * Call a contract method (read-only, no gas)
   */
  async call(
    contractAddress: string,
    entrypoint: string,
    calldata: string[] = []
  ): Promise<string[]> {
    const response = await this.rpcCall('starknet_call', {
      request: {
        contract_address: contractAddress,
        entry_point_selector: this.getSelectorFromName(entrypoint),
        calldata,
      },
      block_id: 'pending',
    });

    return response.result as string[];
  }

  /**
   * Invoke a contract method (write, requires gas)
   */
  async invoke(
    contractAddress: string,
    entrypoint: string,
    calldata: string[] = []
  ): Promise<TransactionResult> {
    this.requireWallet();

    // Build the transaction
    const txHash = await this.sendTransaction(contractAddress, entrypoint, calldata);

    return {
      transaction_hash: txHash,
      status: 'pending',
    };
  }

  /**
   * Invoke and wait for confirmation
   */
  async invokeAndWait(
    contractAddress: string,
    entrypoint: string,
    calldata: string[] = []
  ): Promise<TransactionResult> {
    const result = await this.invoke(contractAddress, entrypoint, calldata);
    return this.waitForTransaction(result.transaction_hash);
  }

  /**
   * Wait for transaction to be accepted
   */
  async waitForTransaction(txHash: string): Promise<TransactionResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.confirmationTimeoutMs) {
      try {
        const receipt = await this.getTransactionReceipt(txHash);

        if (receipt.status === 'ACCEPTED_ON_L2' || receipt.status === 'ACCEPTED_ON_L1') {
          if (receipt.execution_status === 'REVERTED') {
            throw new SdkError(
              `Transaction reverted: ${receipt.revert_reason || 'Unknown reason'}`,
              'TX_REVERTED'
            );
          }

          return {
            transaction_hash: txHash,
            status: 'accepted',
            block_number: receipt.block_number,
            gas_used: receipt.actual_fee ? BigInt(receipt.actual_fee.amount) : undefined,
          };
        }

        if (receipt.status === 'REJECTED') {
          throw new SdkError('Transaction rejected', 'TX_REJECTED');
        }

        // Still pending, wait and retry
        await this.sleep(this.config.pollingIntervalMs);
      } catch (error) {
        if (error instanceof SdkError) {
          throw error;
        }
        // RPC error, might be temporary
        await this.sleep(this.config.pollingIntervalMs);
      }
    }

    throw new SdkError('Transaction confirmation timeout', 'TX_TIMEOUT');
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(txHash: string): Promise<TransactionReceipt> {
    const response = await this.rpcCall('starknet_getTransactionReceipt', {
      transaction_hash: txHash,
    });

    return response.result as TransactionReceipt;
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(txHash: string): Promise<TxStatus> {
    try {
      const response = await this.rpcCall('starknet_getTransactionStatus', {
        transaction_hash: txHash,
      });
      return (response.result as { finality_status: TxStatus }).finality_status;
    } catch {
      return 'NOT_RECEIVED';
    }
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    const response = await this.rpcCall('starknet_blockNumber', {});
    return response.result as number;
  }

  /**
   * Get chain ID
   */
  async getChainId(): Promise<string> {
    const response = await this.rpcCall('starknet_chainId', {});
    return response.result as string;
  }

  /**
   * Send transaction (internal)
   */
  private async sendTransaction(
    contractAddress: string,
    entrypoint: string,
    calldata: string[]
  ): Promise<string> {
    // For production, this would use starknet.js Account class
    // This is a simplified version that calls the backend API

    // In a real implementation, you would:
    // 1. Get nonce from account
    // 2. Build invoke transaction
    // 3. Sign with private key
    // 4. Send via starknet_addInvokeTransaction

    // For now, we'll throw an error indicating this needs wallet integration
    throw new SdkError(
      'Direct contract invocation requires starknet.js integration. ' +
      'Use the API endpoints or integrate with @starknet-react/core.',
      'NOT_IMPLEMENTED'
    );
  }

  /**
   * Make RPC call
   */
  private async rpcCall(method: string, params: Record<string, unknown>): Promise<{ result: unknown }> {
    const response = await fetch(this.config.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new SdkError(`RPC error: ${response.status}`, 'RPC_ERROR', response.status);
    }

    const data = await response.json();

    if (data.error) {
      throw new SdkError(
        data.error.message || 'RPC error',
        'RPC_ERROR',
        data.error.code
      );
    }

    return { result: data.result };
  }

  /**
   * Get selector from function name
   */
  private getSelectorFromName(name: string): string {
    // Simplified selector calculation
    // In production, use starknet.js hash.getSelectorFromName
    return this.starknetKeccak(name);
  }

  /**
   * Simplified Starknet Keccak (for selector calculation)
   */
  private starknetKeccak(name: string): string {
    // This is a placeholder - in production use starknet.js
    // For now, return the name as-is (backend will handle it)
    return name;
  }

  /**
   * Require wallet to be configured
   */
  private requireWallet(): void {
    if (!this.config.accountAddress || !this.config.privateKey) {
      throw new SdkError('Wallet not configured', 'WALLET_REQUIRED');
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ContractConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ContractConfig {
    return { ...this.config };
  }
}

/**
 * Helper to encode felt252 values
 */
export function toFelt(value: string | number | bigint): string {
  if (typeof value === 'string') {
    if (value.startsWith('0x')) {
      return value;
    }
    return '0x' + BigInt(value).toString(16);
  }
  return '0x' + BigInt(value).toString(16);
}

/**
 * Helper to decode felt252 values
 */
export function fromFelt(felt: string): bigint {
  return BigInt(felt);
}

/**
 * Split u256 into two felt252 (low, high)
 */
export function splitU256(value: bigint): [string, string] {
  const low = value & ((1n << 128n) - 1n);
  const high = value >> 128n;
  return [toFelt(low), toFelt(high)];
}

/**
 * Join two felt252 into u256
 */
export function joinU256(low: string, high: string): bigint {
  return fromFelt(low) + (fromFelt(high) << 128n);
}
