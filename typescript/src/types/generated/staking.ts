/**
 * Staking Types
 * Generated from BitSage-Cairo-Smart-Contracts/src/staking/prover_staking.cairo
 */

/** GPU tier classification for staking */
export type GpuTier =
  | 'Consumer'
  | 'Workstation'
  | 'DataCenter'
  | 'Enterprise'
  | 'Frontier';

/** Worker tier (8 levels for tokenomics v3.0) */
export type WorkerTier =
  | 'Basic'
  | 'Premium'
  | 'Enterprise'
  | 'Infrastructure'
  | 'Fleet'
  | 'Datacenter'
  | 'Hyperscale'
  | 'Institutional';

/** Holder tier based on stake amount */
export type HolderTier =
  | 'Regular'
  | 'Whale'
  | 'Institution'
  | 'HyperWhale';

/** Slash reason codes */
export type SlashReason =
  | 'InvalidProof'
  | 'Timeout'
  | 'RepeatedFailures'
  | 'Malicious'
  | 'BenchmarkFraud'
  | 'ProtocolViolation'
  | 'Unavailable'
  | 'PoorPerformance'
  | 'Fraud';

/** Worker stake information */
export interface WorkerStake {
  /** Total staked amount (wei) */
  amount: bigint;
  /** Amount locked (cannot unstake) */
  locked_amount: bigint;
  /** Timestamp when staked */
  staked_at: number;
  /** Last rewards claim timestamp */
  last_claim_at: number;
  /** GPU tier */
  gpu_tier: GpuTier;
  /** Whether worker is active */
  is_active: boolean;
  /** Consecutive job failures */
  consecutive_failures: number;
  /** Total successful jobs */
  total_successes: bigint;
  /** Total slashed amount */
  total_slashed: bigint;
  /** Whether has TEE support */
  has_tee: boolean;
  /** TEE type if applicable */
  tee_type?: 'IntelTDX' | 'AMDSEVSNP' | 'NvidiaCC';
}

/** Extended stake info with rewards */
export interface StakeInfo {
  /** Core stake data */
  stake: WorkerStake;
  /** Pending rewards (wei) */
  pending_rewards: bigint;
  /** Total rewards claimed (wei) */
  total_rewards_claimed: bigint;
  /** Current APY estimate (basis points) */
  estimated_apy_bps: number;
  /** Worker tier */
  worker_tier: WorkerTier;
  /** Holder tier */
  holder_tier: HolderTier;
  /** Locked until timestamp (for unstaking) */
  locked_until?: number;
  /** Is eligible for jobs */
  is_eligible: boolean;
}

/** Staking configuration */
export interface StakingConfig {
  /** Minimum stake per GPU tier (wei) */
  min_stake_per_tier: {
    Consumer: bigint;     // 1,000 SAGE
    Workstation: bigint;  // 2,500 SAGE
    DataCenter: bigint;   // 5,000 SAGE
    Enterprise: bigint;   // 10,000 SAGE
    Frontier: bigint;     // 25,000 SAGE
  };
  /** Slash percentages per reason (basis points) */
  slash_percentages: {
    InvalidProof: number;      // 10%
    Timeout: number;           // 5%
    RepeatedFailures: number;  // 15%
    Malicious: number;         // 50%
    BenchmarkFraud: number;    // 30%
    ProtocolViolation: number; // 20%
    Unavailable: number;       // 2%
    PoorPerformance: number;   // 5%
    Fraud: number;             // 100%
  };
  /** Unstake lockup period (seconds) */
  unstake_lockup_secs: number;
  /** Base reward APY (basis points) */
  reward_apy_bps: number;
  /** TEE bonus APY (basis points) */
  tee_bonus_apy_bps: number;
}

/** Slash record */
export interface SlashRecord {
  /** Slash ID */
  slash_id: bigint;
  /** Worker address */
  worker: string;
  /** Slash reason */
  reason: SlashReason;
  /** Amount slashed (wei) */
  amount: bigint;
  /** Percentage slashed (basis points) */
  percentage_bps: number;
  /** Related job ID if applicable */
  job_id?: bigint;
  /** Challenger address if any */
  challenger?: string;
  /** Timestamp */
  slashed_at: number;
  /** Evidence hash */
  evidence_hash?: bigint;
  /** Is disputed */
  is_disputed: boolean;
  /** Dispute ID if disputed */
  dispute_id?: bigint;
}

/** Dispute record for slash challenges */
export interface DisputeRecord {
  /** Dispute ID */
  dispute_id: bigint;
  /** Related slash ID */
  slash_id: bigint;
  /** Challenger address */
  challenger: string;
  /** Dispute bond amount (wei) */
  bond_amount: bigint;
  /** Evidence hash provided */
  evidence_hash: bigint;
  /** Dispute status */
  status: DisputeStatus;
  /** Submitted at timestamp */
  submitted_at: number;
  /** Resolution timestamp */
  resolved_at?: number;
  /** Resolution reason */
  resolution_reason?: string;
  /** Whether slash was upheld */
  slash_upheld?: boolean;
}

/** Dispute status */
export type DisputeStatus =
  | 'Pending'
  | 'UnderReview'
  | 'Resolved'
  | 'Rejected'
  | 'Expired';

/** Worker tier benefits */
export interface WorkerTierBenefits {
  /** Tier name */
  tier: WorkerTier;
  /** Required stake USD value */
  required_stake_usd: bigint;
  /** Priority queue access */
  priority_queue: boolean;
  /** Job multiplier (basis points) */
  job_multiplier_bps: number;
  /** Reduced slashing (basis points reduction) */
  slash_reduction_bps: number;
  /** Governance voting weight multiplier */
  voting_weight_multiplier: number;
}

/** Unstake request */
export interface UnstakeRequest {
  /** Request ID */
  request_id: bigint;
  /** Worker address */
  worker: string;
  /** Amount to unstake (wei) */
  amount: bigint;
  /** Request timestamp */
  requested_at: number;
  /** Available after timestamp */
  available_at: number;
  /** Status */
  status: 'Pending' | 'Available' | 'Completed' | 'Cancelled';
}

/** Minimum stake requirements */
export const MIN_STAKE = {
  Consumer: 1_000n * 10n ** 18n,     // 1,000 SAGE
  Workstation: 2_500n * 10n ** 18n,  // 2,500 SAGE
  DataCenter: 5_000n * 10n ** 18n,   // 5,000 SAGE
  Enterprise: 10_000n * 10n ** 18n,  // 10,000 SAGE
  Frontier: 25_000n * 10n ** 18n     // 25,000 SAGE
} as const;

/** Slash percentages (basis points) */
export const SLASH_PERCENTAGES = {
  InvalidProof: 1000,       // 10%
  Timeout: 500,             // 5%
  RepeatedFailures: 1500,   // 15%
  Malicious: 5000,          // 50%
  BenchmarkFraud: 3000,     // 30%
  ProtocolViolation: 2000,  // 20%
  Unavailable: 200,         // 2%
  PoorPerformance: 500,     // 5%
  Fraud: 10000              // 100%
} as const;

/** Unstake lockup period (7 days) */
export const UNSTAKE_LOCKUP_SECS = 7 * 24 * 60 * 60;

/** Helper to check if worker is eligible */
export function isWorkerEligible(stake: WorkerStake): boolean {
  const minRequired = MIN_STAKE[stake.gpu_tier];
  return stake.is_active && stake.amount >= minRequired && stake.consecutive_failures < 3;
}

/** Helper to get min stake for tier */
export function getMinStakeForTier(tier: GpuTier): bigint {
  return MIN_STAKE[tier];
}
