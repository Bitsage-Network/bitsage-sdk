/**
 * Mining Rewards Types
 * Generated from BitSage-Cairo-Smart-Contracts/src/economics/mining_rewards.cairo
 */

/** Staking tier determines daily mining caps */
export type StakeTier = 'None' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

/** Daily mining statistics */
export interface DailyStats {
  /** Day number (unix timestamp / 86400) */
  day: number;
  /** Number of jobs completed this day */
  jobs_completed: number;
  /** SAGE earned today (wei) */
  earned_today: bigint;
}

/** Worker's lifetime mining statistics */
export interface WorkerMiningStats {
  /** Total jobs completed since registration */
  total_jobs: bigint;
  /** Total SAGE earned (wei) */
  total_earned: bigint;
  /** Daily statistics array */
  daily_stats: DailyStats[];
  /** Timestamp of first job */
  first_job_at: number;
  /** Timestamp of most recent job */
  last_job_at: number;
}

/** Mining pool status */
export interface MiningPoolStatus {
  /** Total SAGE distributed from pool (wei) */
  total_distributed: bigint;
  /** Remaining SAGE in mining pool (wei) */
  remaining_pool: bigint;
  /** Current base reward per job with halvening applied (wei) */
  current_base_reward: bigint;
  /** Current halvening multiplier (basis points, 10000 = 1.0x) */
  halvening_multiplier: number;
  /** Year number since mining started */
  current_year: number;
}

/** Mining configuration */
export interface MiningConfig {
  /** Base reward per job (wei) - 2 SAGE in Year 1 */
  base_reward_wei: bigint;
  /** Timestamp when mining started */
  start_timestamp: number;
  /** Halvening period in seconds (1 year) */
  halvening_period_secs: number;
  /** Daily caps by stake tier (wei) */
  caps_by_tier: {
    None: bigint;      // 100 SAGE
    Bronze: bigint;    // 150 SAGE
    Silver: bigint;    // 200 SAGE
    Gold: bigint;      // 300 SAGE
    Platinum: bigint;  // 500 SAGE
  };
  /** GPU multipliers by tier (basis points, 10000 = 1.0x) */
  gpu_multipliers: {
    Consumer: number;     // 10000 (1.0x)
    Workstation: number;  // 12500 (1.25x)
    DataCenter: number;   // 15000 (1.5x)
    Enterprise: number;   // 20000 (2.0x)
    Frontier: number;     // 25000 (2.5x)
  };
}

/** Result of mining reward calculation */
export interface RewardResult {
  /** Calculated reward amount (wei) */
  amount: bigint;
  /** Whether the reward was capped by daily limit */
  capped: boolean;
  /** Remaining daily cap after this reward (wei) */
  remaining_cap: bigint;
  /** Worker's current stake tier */
  stake_tier: StakeTier;
}

/** GPU tier for mining multipliers */
export type MiningGpuTier = 'Consumer' | 'Workstation' | 'DataCenter' | 'Enterprise' | 'Frontier';

/** Stake tier thresholds (in SAGE wei) */
export const STAKE_TIER_THRESHOLDS = {
  None: 0n,
  Bronze: 1_000n * 10n ** 18n,    // 1,000 SAGE
  Silver: 10_000n * 10n ** 18n,   // 10,000 SAGE
  Gold: 50_000n * 10n ** 18n,     // 50,000 SAGE
  Platinum: 200_000n * 10n ** 18n // 200,000 SAGE
} as const;

/** Daily caps by stake tier (in SAGE wei) */
export const DAILY_CAPS = {
  None: 100n * 10n ** 18n,     // 100 SAGE/day
  Bronze: 150n * 10n ** 18n,   // 150 SAGE/day
  Silver: 200n * 10n ** 18n,   // 200 SAGE/day
  Gold: 300n * 10n ** 18n,     // 300 SAGE/day
  Platinum: 500n * 10n ** 18n  // 500 SAGE/day
} as const;

/** GPU multipliers (basis points, 10000 = 1.0x) */
export const GPU_MULTIPLIERS = {
  Consumer: 10000,     // 1.0x
  Workstation: 12500,  // 1.25x
  DataCenter: 15000,   // 1.5x
  Enterprise: 20000,   // 2.0x
  Frontier: 25000      // 2.5x
} as const;

/** Halvening schedule (year -> multiplier in basis points) */
export const HALVENING_SCHEDULE = {
  1: 10000,  // 100% (2 SAGE)
  2: 7500,   // 75%  (1.5 SAGE)
  3: 5000,   // 50%  (1 SAGE)
  4: 3750,   // 37.5% (0.75 SAGE)
  5: 2500    // 25%  (0.5 SAGE)
} as const;

/** Helper to get stake tier from staked amount */
export function getStakeTierFromAmount(stakedAmount: bigint): StakeTier {
  if (stakedAmount >= STAKE_TIER_THRESHOLDS.Platinum) return 'Platinum';
  if (stakedAmount >= STAKE_TIER_THRESHOLDS.Gold) return 'Gold';
  if (stakedAmount >= STAKE_TIER_THRESHOLDS.Silver) return 'Silver';
  if (stakedAmount >= STAKE_TIER_THRESHOLDS.Bronze) return 'Bronze';
  return 'None';
}

/** Helper to get daily cap for stake tier */
export function getDailyCapForTier(tier: StakeTier): bigint {
  return DAILY_CAPS[tier];
}

/** Helper to get GPU multiplier */
export function getGpuMultiplier(tier: MiningGpuTier): number {
  return GPU_MULTIPLIERS[tier];
}
