/**
 * Payment Router Types
 * Generated from BitSage-Cairo-Smart-Contracts/src/payments/
 */

/** Supported payment tokens */
export type PaymentToken =
  | 'USDC'
  | 'STRK'
  | 'WBTC'
  | 'SAGE'
  | 'STAKED_SAGE'
  | 'PRIVACY_CREDIT';

/** Payment quote from router */
export interface PaymentQuote {
  /** Unique quote ID */
  quote_id: bigint;
  /** Token to pay with */
  payment_token: PaymentToken;
  /** Amount in payment token (wei) */
  payment_amount: bigint;
  /** SAGE equivalent amount (wei) */
  sage_equivalent: bigint;
  /** Discount applied (basis points) */
  discount_bps: number;
  /** USD value (6 decimals) */
  usd_value: bigint;
  /** Quote expiration timestamp */
  expires_at: number;
}

/** Discount tiers by payment method */
export interface DiscountTiers {
  /** Stablecoin discount (0%) */
  stablecoin_discount_bps: number;
  /** STRK discount (0%) */
  strk_discount_bps: number;
  /** WBTC discount (0%) */
  wbtc_discount_bps: number;
  /** SAGE direct payment discount (5%) */
  sage_discount_bps: number;
  /** Staked SAGE discount (10%) */
  staked_sage_discount_bps: number;
  /** Privacy credit discount (2%) */
  privacy_credit_discount_bps: number;
}

/** Fee distribution configuration */
export interface FeeDistribution {
  /** Worker share (80%) */
  worker_bps: number;
  /** Protocol fee (20%) */
  protocol_fee_bps: number;
  /** Burn share of protocol fee (70%) */
  burn_share_bps: number;
  /** Treasury share of protocol fee (20%) */
  treasury_share_bps: number;
  /** Staker rewards share of protocol fee (10%) */
  staker_share_bps: number;
}

/** OTC desk configuration */
export interface OTCConfig {
  /** USDC token address */
  usdc_address: string;
  /** STRK token address */
  strk_address: string;
  /** WBTC token address */
  wbtc_address: string;
  /** SAGE token address */
  sage_address: string;
  /** Pragma oracle address */
  oracle_address: string;
  /** Maximum slippage (basis points) */
  max_slippage_bps: number;
  /** Quote validity duration (seconds) */
  quote_validity_secs: number;
}

/** Payment statistics */
export interface PaymentStats {
  /** Total payments in USD (6 decimals) */
  total_payments_usd: bigint;
  /** Total SAGE burned (wei) */
  total_sage_burned: bigint;
  /** Total paid to workers (wei) */
  total_worker_payments: bigint;
  /** Total staker rewards (wei) */
  total_staker_rewards: bigint;
  /** Total treasury collected (wei) */
  total_treasury_collected: bigint;
  /** Number of payments processed */
  payment_count: bigint;
}

/** Job payment record */
export interface JobPaymentRecord {
  /** Job ID */
  job_id: bigint;
  /** Worker address */
  worker: string;
  /** Client address */
  client: string;
  /** Payment amount in SAGE (wei) */
  sage_amount: bigint;
  /** USD value (6 decimals) */
  usd_value: bigint;
  /** Whether privacy is enabled */
  privacy_enabled: boolean;
  /** Payment status */
  status: PaymentStatus;
  /** Proof hash (if verified) */
  proof_hash?: bigint;
  /** Registration timestamp */
  registered_at: number;
  /** Completion timestamp */
  completed_at?: number;
}

/** Payment status */
export type PaymentStatus =
  | 'Pending'
  | 'ProofVerified'
  | 'PaymentReleased'
  | 'Disputed'
  | 'Cancelled';

/** Verification source for payment release */
export type VerificationSource =
  | 'STWOProof'
  | 'TEEOptimistic'
  | 'TEEChallenged';

/** Metered billing checkpoint */
export interface ComputeCheckpoint {
  /** Checkpoint ID */
  checkpoint_id: bigint;
  /** Job ID */
  job_id: bigint;
  /** Hour number (1-indexed) */
  hour_number: number;
  /** Proof data hash */
  proof_hash: bigint;
  /** Checkpoint status */
  status: CheckpointStatus;
  /** Submitted at timestamp */
  submitted_at: number;
  /** Verified at timestamp */
  verified_at?: number;
  /** Payment released at */
  paid_at?: number;
}

/** Checkpoint status */
export type CheckpointStatus =
  | 'Submitted'
  | 'Verified'
  | 'Paid'
  | 'Failed';

/** Privacy credit deposit */
export interface PrivacyCreditDeposit {
  /** Depositor address */
  depositor: string;
  /** Amount deposited (wei) */
  amount: bigint;
  /** Commitment for privacy */
  commitment: bigint;
  /** Timestamp */
  deposited_at: number;
}

/** Privacy credit usage */
export interface PrivacyCreditUsage {
  /** Job ID paid for */
  job_id: bigint;
  /** USD amount used (6 decimals) */
  usd_amount: bigint;
  /** Nullifier to prevent double-spend */
  nullifier: bigint;
  /** Timestamp */
  used_at: number;
}

/** Transaction result */
export interface TransactionResult {
  /** Transaction hash */
  transaction_hash: string;
  /** Status */
  status: 'pending' | 'accepted' | 'rejected';
  /** Block number (if accepted) */
  block_number?: number;
  /** Gas used */
  gas_used?: bigint;
}

/** Default discount tiers */
export const DEFAULT_DISCOUNT_TIERS: DiscountTiers = {
  stablecoin_discount_bps: 0,
  strk_discount_bps: 0,
  wbtc_discount_bps: 0,
  sage_discount_bps: 500,        // 5%
  staked_sage_discount_bps: 1000, // 10%
  privacy_credit_discount_bps: 200 // 2%
};

/** Default fee distribution */
export const DEFAULT_FEE_DISTRIBUTION: FeeDistribution = {
  worker_bps: 8000,         // 80%
  protocol_fee_bps: 2000,   // 20%
  burn_share_bps: 7000,     // 70% of protocol fee
  treasury_share_bps: 2000, // 20% of protocol fee
  staker_share_bps: 1000    // 10% of protocol fee
};
