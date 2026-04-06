/**
 * Prover Staking Client
 *
 * Stake SAGE tokens to become eligible as a GPU prover.
 * Workers must stake a minimum amount based on their GPU tier.
 *
 * GPU Tiers: Consumer (0), Professional (1), DataCenter (2), H100 (3)
 */
import { CallData, type Call } from 'starknet';
import type { ObelyskClient } from './client';
import { parseAmount, formatAmount } from './contracts';

export type GpuTier = 'Consumer' | 'Professional' | 'DataCenter' | 'H100';

const GPU_TIER_MAP: Record<GpuTier, number> = {
  Consumer: 0,
  Professional: 1,
  DataCenter: 2,
  H100: 3,
};

export interface WorkerStake {
  amount: bigint;
  gpuTier: GpuTier;
  stakedAt: number;
  isActive: boolean;
  successCount: number;
  failCount: number;
}

export interface StakingConfig {
  minStakeConsumer: bigint;
  minStakeProfessional: bigint;
  minStakeDataCenter: bigint;
  minStakeH100: bigint;
  cooldownPeriod: number;
  slashPercent: number;
  rewardRateBps: number;
}

export class ProverStakingClient {
  constructor(private readonly obelysk: ObelyskClient) {}

  private get contractAddress(): string {
    const addr = this.obelysk.contracts.prover_staking;
    if (!addr) throw new Error('ProverStaking not configured for this network');
    return addr;
  }

  /**
   * Get a worker's current stake info.
   */
  async getStake(workerAddress: string): Promise<WorkerStake> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_stake',
      calldata: [workerAddress],
    });

    const tiers: GpuTier[] = ['Consumer', 'Professional', 'DataCenter', 'H100'];
    return {
      amount: BigInt(result[0]),
      gpuTier: tiers[Number(BigInt(result[1]))] ?? 'Consumer',
      stakedAt: Number(BigInt(result[2])),
      isActive: BigInt(result[3]) !== 0n,
      successCount: Number(BigInt(result[4])),
      failCount: Number(BigInt(result[5])),
    };
  }

  /**
   * Check if a worker is eligible (staked enough, not in cooldown).
   */
  async isEligible(workerAddress: string): Promise<boolean> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'is_eligible',
      calldata: [workerAddress],
    });
    return BigInt(result[0]) !== 0n;
  }

  /**
   * Get minimum stake required for a GPU tier.
   */
  async getMinStake(tier: GpuTier): Promise<bigint> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_min_stake',
      calldata: [GPU_TIER_MAP[tier].toString()],
    });
    return BigInt(result[0]);
  }

  /**
   * Get total SAGE staked across all workers.
   */
  async getTotalStaked(): Promise<bigint> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'total_staked',
      calldata: [],
    });
    return BigInt(result[0]);
  }

  /**
   * Get total SAGE slashed.
   */
  async getTotalSlashed(): Promise<bigint> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'total_slashed',
      calldata: [],
    });
    return BigInt(result[0]);
  }

  /**
   * Get staking configuration.
   */
  async getConfig(): Promise<StakingConfig> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_config',
      calldata: [],
    });
    return {
      minStakeConsumer: BigInt(result[0]),
      minStakeProfessional: BigInt(result[1]),
      minStakeDataCenter: BigInt(result[2]),
      minStakeH100: BigInt(result[3]),
      cooldownPeriod: Number(BigInt(result[4])),
      slashPercent: Number(BigInt(result[5])),
      rewardRateBps: Number(BigInt(result[6])),
    };
  }

  /**
   * Stake SAGE tokens to become a prover.
   */
  async stake(amount: string, tier: GpuTier): Promise<{ txHash: string }> {
    const account = this.obelysk.requireAccount();
    const sageToken = this.obelysk.getTokenAddress('sage');
    const amountWei = parseAmount(amount, 'sage');
    const amountLow = amountWei & ((1n << 128n) - 1n);
    const amountHigh = amountWei >> 128n;

    const calls: Call[] = [
      {
        contractAddress: sageToken,
        entrypoint: 'approve',
        calldata: CallData.compile({
          spender: this.contractAddress,
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
        }),
      },
      {
        contractAddress: this.contractAddress,
        entrypoint: 'stake',
        calldata: CallData.compile({
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
          gpu_tier: GPU_TIER_MAP[tier].toString(),
        }),
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);
    return { txHash: result.transaction_hash };
  }

  /**
   * Request unstaking (starts cooldown period).
   */
  async requestUnstake(amount: string): Promise<{ txHash: string }> {
    const account = this.obelysk.requireAccount();
    const amountWei = parseAmount(amount, 'sage');
    const amountLow = amountWei & ((1n << 128n) - 1n);
    const amountHigh = amountWei >> 128n;

    const calls: Call[] = [
      {
        contractAddress: this.contractAddress,
        entrypoint: 'request_unstake',
        calldata: CallData.compile({
          amount: { low: amountLow.toString(), high: amountHigh.toString() },
        }),
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);
    return { txHash: result.transaction_hash };
  }

  /**
   * Complete unstaking after cooldown period.
   */
  async completeUnstake(): Promise<{ txHash: string }> {
    const account = this.obelysk.requireAccount();

    const calls: Call[] = [
      {
        contractAddress: this.contractAddress,
        entrypoint: 'complete_unstake',
        calldata: [],
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);
    return { txHash: result.transaction_hash };
  }

  /**
   * Claim accumulated staking rewards.
   */
  async claimRewards(): Promise<{ txHash: string }> {
    const account = this.obelysk.requireAccount();

    const calls: Call[] = [
      {
        contractAddress: this.contractAddress,
        entrypoint: 'claim_rewards',
        calldata: [],
      },
    ];

    const result = await account.execute(calls);
    await this.obelysk.provider.waitForTransaction(result.transaction_hash);
    return { txHash: result.transaction_hash };
  }
}
