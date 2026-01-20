/**
 * SAGE Token Governance Types
 * Generated from BitSage-Cairo-Smart-Contracts/src/sage_token.cairo
 */

/** Proposal status */
export type ProposalStatus =
  | 'Draft'
  | 'Active'
  | 'Succeeded'
  | 'Executed'
  | 'Defeated'
  | 'Cancelled'
  | 'Expired';

/** Proposal type for enhanced governance */
export type ProposalType =
  | 'Standard'
  | 'InflationAdjustment'
  | 'BurnRateChange'
  | 'TreasurySpend'
  | 'ProtocolUpgrade'
  | 'Emergency';

/** Governance proposal */
export interface GovernanceProposal {
  /** Proposal ID */
  proposal_id: bigint;
  /** Proposer address */
  proposer: string;
  /** Description of proposal */
  description: string;
  /** Proposal type */
  proposal_type: ProposalType;
  /** Inflation change (basis points, signed) */
  inflation_change_bps: number;
  /** Burn rate change (basis points, signed) */
  burn_rate_change_bps: number;
  /** Treasury spend amount (if applicable) */
  treasury_spend_amount?: bigint;
  /** Treasury spend recipient */
  treasury_spend_recipient?: string;
  /** Votes in favor */
  votes_for: bigint;
  /** Votes against */
  votes_against: bigint;
  /** Current status */
  status: ProposalStatus;
  /** Creation timestamp */
  created_at: number;
  /** Voting start timestamp */
  voting_starts_at: number;
  /** Voting end timestamp */
  voting_ends_at: number;
  /** Execution timestamp (if executed) */
  executed_at?: number;
  /** Quorum required (basis points) */
  quorum_bps: number;
  /** Snapshot block number */
  snapshot_block: number;
}

/** Governance rights for an address */
export interface GovernanceRights {
  /** Address */
  address: string;
  /** Current voting power */
  voting_power: bigint;
  /** Can create standard proposals */
  can_create_standard: boolean;
  /** Can create inflation proposals */
  can_create_inflation: boolean;
  /** Can create emergency proposals */
  can_create_emergency: boolean;
  /** Number of active proposals */
  active_proposals: number;
  /** Last proposal timestamp */
  last_proposal_at?: number;
  /** Delegated voting power */
  delegated_power: bigint;
  /** Address delegated to */
  delegated_to?: string;
}

/** Governance statistics */
export interface GovernanceStats {
  /** Total proposals created */
  total_proposals: bigint;
  /** Total executed proposals */
  executed_proposals: bigint;
  /** Total defeated proposals */
  defeated_proposals: bigint;
  /** Current total voting power */
  total_voting_power: bigint;
  /** Average participation rate (basis points) */
  avg_participation_bps: number;
  /** Current quorum threshold (basis points) */
  quorum_threshold_bps: number;
  /** Minimum proposal threshold (SAGE) */
  proposal_threshold: bigint;
}

/** Token pool balances */
export interface PoolBalances {
  /** Ecosystem pool (40%) */
  ecosystem: bigint;
  /** Treasury pool (15%) */
  treasury: bigint;
  /** Team pool (15%) */
  team: bigint;
  /** Public sale pool (10%) */
  public_sale: bigint;
  /** Pre-seed pool (2%) */
  pre_seed: bigint;
  /** Seed pool (5%) */
  seed: bigint;
  /** Strategic pool (8%) */
  strategic: bigint;
  /** Advisors pool (3%) */
  advisors: bigint;
  /** Code dev pool (2%) */
  code_dev: bigint;
}

/** Vesting status */
export interface VestingStatus {
  /** Treasury vesting progress (basis points) */
  treasury_vested_bps: number;
  /** Team vesting progress (basis points) */
  team_vested_bps: number;
  /** Whether team cliff has passed */
  team_cliff_passed: boolean;
  /** Public sale vesting progress (basis points) */
  public_sale_vested_bps: number;
  /** Months since TGE */
  months_since_tge: number;
  /** Next vesting release timestamp */
  next_release_at: number;
}

/** Security budget information */
export interface SecurityBudget {
  /** Annual security budget (wei) */
  annual_budget: bigint;
  /** Remaining budget this year (wei) */
  remaining_budget: bigint;
  /** Reserve fund (wei) */
  reserve_fund: bigint;
  /** Last audit timestamp */
  last_audit_at: number;
  /** Current security score (0-100) */
  security_score: number;
}

/** Burn event record */
export interface BurnEvent {
  /** Event ID */
  event_id: bigint;
  /** Amount burned (wei) */
  amount: bigint;
  /** Revenue source */
  revenue_source: string;
  /** Execution price (6 decimals) */
  execution_price: bigint;
  /** Timestamp */
  burned_at: number;
  /** Transaction hash */
  tx_hash: string;
}

/** Ecosystem emission status */
export interface EcosystemEmissionStatus {
  /** Remaining to emit (wei) */
  remaining: bigint;
  /** Total emitted (wei) */
  total_emitted: bigint;
  /** Current month number */
  current_month: number;
  /** Last emission timestamp */
  last_emission_at: number;
  /** Current emission rate (wei/month) */
  emission_rate: bigint;
}

/** Token flow summary */
export interface TokenFlowSummary {
  /** Total minted (wei) */
  total_minted: bigint;
  /** Total burned (wei) */
  total_burned: bigint;
  /** Net change (wei, absolute value) */
  net_change_abs: bigint;
  /** Whether net deflationary */
  is_deflationary: boolean;
  /** Period start timestamp */
  period_start: number;
  /** Period end timestamp */
  period_end: number;
}

/** Milestone status flags */
export interface MilestoneStatus {
  /** Burned 10% of supply */
  burn_10_percent: boolean;
  /** Burned 25% of supply */
  burn_25_percent: boolean;
  /** Burned 50% of supply */
  burn_50_percent: boolean;
  /** Reached 1M USD monthly revenue */
  revenue_1m_usd: boolean;
  /** Reached 10M USD monthly revenue */
  revenue_10m_usd: boolean;
}

/** Rate limit info for large transfers */
export interface RateLimitInfo {
  /** Amount already transferred this period */
  amount_transferred: bigint;
  /** Period start timestamp */
  period_start: number;
  /** Maximum allowed per period */
  max_per_period: bigint;
  /** Cooldown remaining (seconds) */
  cooldown_remaining: number;
}

/** Pending large transfer */
export interface PendingTransfer {
  /** Transfer ID */
  transfer_id: bigint;
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Amount (wei) */
  amount: bigint;
  /** Initiated timestamp */
  initiated_at: number;
  /** Executable after timestamp */
  executable_after: number;
  /** Status */
  status: 'Pending' | 'Executed' | 'Cancelled';
}

/** Create proposal parameters */
export interface CreateProposalParams {
  /** Proposal description */
  description: string;
  /** Proposal type */
  proposal_type: ProposalType;
  /** Inflation change (optional, basis points) */
  inflation_change_bps?: number;
  /** Burn rate change (optional, basis points) */
  burn_rate_change_bps?: number;
  /** Treasury spend amount (optional, wei) */
  treasury_spend_amount?: bigint;
  /** Treasury spend recipient (optional) */
  treasury_spend_recipient?: string;
}

/** Governance configuration constants */
export const GOVERNANCE_CONFIG = {
  /** Voting period (3 days) */
  VOTING_PERIOD_SECS: 3 * 24 * 60 * 60,
  /** Execution delay (1 day) */
  EXECUTION_DELAY_SECS: 24 * 60 * 60,
  /** Quorum threshold (4%) */
  QUORUM_BPS: 400,
  /** Proposal threshold (100,000 SAGE) */
  PROPOSAL_THRESHOLD: 100_000n * 10n ** 18n,
  /** Emergency proposal threshold (1,000,000 SAGE) */
  EMERGENCY_THRESHOLD: 1_000_000n * 10n ** 18n,
  /** Maximum inflation change per proposal (1%) */
  MAX_INFLATION_CHANGE_BPS: 100,
  /** Maximum burn rate change per proposal (5%) */
  MAX_BURN_RATE_CHANGE_BPS: 500,
  /** Rate limit window (24 hours) */
  RATE_LIMIT_WINDOW_SECS: 24 * 60 * 60,
  /** Large transfer threshold */
  LARGE_TRANSFER_THRESHOLD: 1_000_000n * 10n ** 18n,
  /** Large transfer timelock (24 hours) */
  LARGE_TRANSFER_TIMELOCK_SECS: 24 * 60 * 60
} as const;
