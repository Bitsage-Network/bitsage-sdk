/**
 * Payments Module
 * Multi-token payment system with OTC desk and privacy credits
 */

import { HttpClient } from '../transport/http-client';
import { ContractClient, toFelt } from '../transport/contract-client';
import type {
  PaymentToken,
  PaymentQuote,
  DiscountTiers,
  FeeDistribution,
  PaymentStats,
  JobPaymentRecord,
  ComputeCheckpoint,
  TransactionResult,
  DEFAULT_DISCOUNT_TIERS,
  DEFAULT_FEE_DISTRIBUTION,
} from '../types/generated/payments';

export interface PaymentsClientConfig {
  /** Payment router contract address */
  paymentRouterAddress: string;
  /** Proof-gated payment contract address */
  proofGatedPaymentAddress: string;
}

/**
 * Payments Client
 *
 * Handles all payment operations including:
 * - Multi-token payment quotes (USDC, STRK, WBTC, SAGE)
 * - Direct SAGE payments with discounts
 * - Staked SAGE payments (10% discount)
 * - Privacy credits for anonymous payments
 * - Metered billing with hourly checkpoints
 *
 * @example
 * ```typescript
 * const payments = new PaymentsClient(httpClient, contractClient, config);
 *
 * // Get a payment quote
 * const quote = await payments.getPaymentQuote('SAGE', 100n * 10n**6n); // $100 worth
 * console.log(`Pay ${quote.payment_amount} SAGE (${quote.discount_bps/100}% discount)`);
 *
 * // Execute the payment
 * const result = await payments.executePayment(quote.quote_id, jobId);
 * ```
 */
export class PaymentsClient {
  private http: HttpClient;
  private contract: ContractClient;
  private config: PaymentsClientConfig;

  constructor(
    http: HttpClient,
    contract: ContractClient,
    config: PaymentsClientConfig
  ) {
    this.http = http;
    this.contract = contract;
    this.config = config;
  }

  // =========================================================================
  // Quote Operations
  // =========================================================================

  /**
   * Get a payment quote for a USD amount
   *
   * @param token - Payment token to use
   * @param usdAmount - Amount in USD (6 decimals, e.g., 100_000_000 = $100)
   * @returns Payment quote with conversion rate and discount
   */
  async getPaymentQuote(token: PaymentToken, usdAmount: bigint): Promise<PaymentQuote> {
    const response = await this.http.post<{
      quote_id: string;
      payment_token: PaymentToken;
      payment_amount: string;
      sage_equivalent: string;
      discount_bps: number;
      usd_value: string;
      expires_at: number;
    }>('/api/payments/quote', {
      payment_token: token,
      usd_amount: usdAmount.toString(),
    });

    return {
      quote_id: BigInt(response.quote_id),
      payment_token: response.payment_token,
      payment_amount: BigInt(response.payment_amount),
      sage_equivalent: BigInt(response.sage_equivalent),
      discount_bps: response.discount_bps,
      usd_value: BigInt(response.usd_value),
      expires_at: response.expires_at,
    };
  }

  /**
   * Execute a quoted payment
   *
   * @param quoteId - Quote ID from getPaymentQuote
   * @param jobId - Job being paid for
   * @returns Transaction result
   */
  async executePayment(quoteId: bigint, jobId: bigint): Promise<TransactionResult> {
    return this.http.post<TransactionResult>('/api/payments/execute', {
      quote_id: quoteId.toString(),
      job_id: jobId.toString(),
    });
  }

  // =========================================================================
  // Direct Payment Methods
  // =========================================================================

  /**
   * Pay directly with SAGE tokens (5% discount)
   *
   * @param amount - SAGE amount (wei)
   * @param jobId - Job being paid for
   * @returns Transaction result
   */
  async payWithSAGE(amount: bigint, jobId: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.paymentRouterAddress,
      'pay_with_sage',
      [toFelt(amount), toFelt(jobId)]
    );
  }

  /**
   * Pay with staked SAGE (10% discount)
   *
   * @param usdAmount - USD amount (6 decimals)
   * @param jobId - Job being paid for
   * @returns Transaction result
   */
  async payWithStakedSAGE(usdAmount: bigint, jobId: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.paymentRouterAddress,
      'pay_with_staked_sage',
      [toFelt(usdAmount), toFelt(jobId)]
    );
  }

  // =========================================================================
  // Privacy Credits
  // =========================================================================

  /**
   * Deposit tokens as privacy credits
   *
   * @param amount - Amount to deposit (wei)
   * @param commitment - Privacy commitment hash
   * @returns Transaction result
   */
  async depositPrivacyCredits(amount: bigint, commitment: string): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.paymentRouterAddress,
      'deposit_privacy_credits',
      [toFelt(amount), commitment]
    );
  }

  /**
   * Pay anonymously using privacy credits (2% discount)
   *
   * @param usdAmount - USD amount (6 decimals)
   * @param nullifier - Nullifier to prevent double-spending
   * @param proof - ZK proof of valid credit
   * @returns Transaction result
   */
  async payWithPrivacyCredits(
    usdAmount: bigint,
    nullifier: string,
    proof: string[]
  ): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.paymentRouterAddress,
      'pay_with_privacy_credits',
      [toFelt(usdAmount), nullifier, ...proof]
    );
  }

  // =========================================================================
  // Configuration
  // =========================================================================

  /**
   * Get current discount tiers
   *
   * @returns Discount configuration
   */
  async getDiscountTiers(): Promise<DiscountTiers> {
    return this.http.get<DiscountTiers>('/api/payments/config/discounts');
  }

  /**
   * Get fee distribution configuration
   *
   * @returns Fee distribution (worker/burn/treasury/stakers split)
   */
  async getFeeDistribution(): Promise<FeeDistribution> {
    return this.http.get<FeeDistribution>('/api/payments/config/fees');
  }

  /**
   * Get payment statistics
   *
   * @returns Payment volume statistics
   */
  async getStats(): Promise<PaymentStats> {
    const response = await this.http.get<{
      total_payments_usd: string;
      total_sage_burned: string;
      total_worker_payments: string;
      total_staker_rewards: string;
      total_treasury_collected: string;
      payment_count: string;
    }>('/api/payments/stats');

    return {
      total_payments_usd: BigInt(response.total_payments_usd),
      total_sage_burned: BigInt(response.total_sage_burned),
      total_worker_payments: BigInt(response.total_worker_payments),
      total_staker_rewards: BigInt(response.total_staker_rewards),
      total_treasury_collected: BigInt(response.total_treasury_collected),
      payment_count: BigInt(response.payment_count),
    };
  }

  // =========================================================================
  // Proof-Gated Payments
  // =========================================================================

  /**
   * Check if payment is ready for release
   *
   * @param jobId - Job ID
   * @returns Whether proof has been verified and payment can be released
   */
  async isPaymentReady(jobId: bigint): Promise<boolean> {
    const response = await this.http.get<{ ready: boolean }>(
      `/api/payments/jobs/${jobId}/ready`
    );
    return response.ready;
  }

  /**
   * Get job payment record
   *
   * @param jobId - Job ID
   * @returns Payment record details
   */
  async getJobPayment(jobId: bigint): Promise<JobPaymentRecord> {
    const response = await this.http.get<{
      job_id: string;
      worker: string;
      client: string;
      sage_amount: string;
      usd_value: string;
      privacy_enabled: boolean;
      status: string;
      proof_hash?: string;
      registered_at: number;
      completed_at?: number;
    }>(`/api/payments/jobs/${jobId}`);

    return {
      job_id: BigInt(response.job_id),
      worker: response.worker,
      client: response.client,
      sage_amount: BigInt(response.sage_amount),
      usd_value: BigInt(response.usd_value),
      privacy_enabled: response.privacy_enabled,
      status: response.status as JobPaymentRecord['status'],
      proof_hash: response.proof_hash ? BigInt(response.proof_hash) : undefined,
      registered_at: response.registered_at,
      completed_at: response.completed_at,
    };
  }

  /**
   * Manually release payment (if proof verified)
   *
   * @param jobId - Job ID
   * @returns Transaction result
   */
  async releasePayment(jobId: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.proofGatedPaymentAddress,
      'release_payment',
      [toFelt(jobId)]
    );
  }

  // =========================================================================
  // Metered Billing
  // =========================================================================

  /**
   * Submit hourly compute checkpoint
   *
   * @param jobId - Job ID
   * @param hour - Hour number (1-indexed)
   * @param proofData - Proof of computation
   * @param proofHash - Hash of the proof
   * @returns Transaction result
   */
  async submitCheckpoint(
    jobId: bigint,
    hour: number,
    proofData: string[],
    proofHash: string
  ): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.proofGatedPaymentAddress,
      'submit_checkpoint',
      [toFelt(jobId), toFelt(hour), proofHash, ...proofData]
    );
  }

  /**
   * Verify and pay for a checkpoint
   *
   * @param checkpointId - Checkpoint ID
   * @returns Transaction result
   */
  async verifyAndPayCheckpoint(checkpointId: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.proofGatedPaymentAddress,
      'verify_and_pay_checkpoint',
      [toFelt(checkpointId)]
    );
  }

  /**
   * Get checkpoints for a job
   *
   * @param jobId - Job ID
   * @returns Array of checkpoint records
   */
  async getJobCheckpoints(jobId: bigint): Promise<ComputeCheckpoint[]> {
    const response = await this.http.get<Array<{
      checkpoint_id: string;
      job_id: string;
      hour_number: number;
      proof_hash: string;
      status: string;
      submitted_at: number;
      verified_at?: number;
      paid_at?: number;
    }>>(`/api/payments/jobs/${jobId}/checkpoints`);

    return response.map(cp => ({
      checkpoint_id: BigInt(cp.checkpoint_id),
      job_id: BigInt(cp.job_id),
      hour_number: cp.hour_number,
      proof_hash: BigInt(cp.proof_hash),
      status: cp.status as ComputeCheckpoint['status'],
      submitted_at: cp.submitted_at,
      verified_at: cp.verified_at,
      paid_at: cp.paid_at,
    }));
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Calculate discount amount
   *
   * @param baseAmount - Base amount (wei)
   * @param discountBps - Discount in basis points
   * @returns Discounted amount
   */
  static calculateDiscount(baseAmount: bigint, discountBps: number): bigint {
    return baseAmount - (baseAmount * BigInt(discountBps)) / 10000n;
  }

  /**
   * Get discount for payment token
   *
   * @param token - Payment token
   * @param tiers - Discount tiers (or uses defaults)
   * @returns Discount in basis points
   */
  static getDiscountForToken(token: PaymentToken, tiers?: DiscountTiers): number {
    const discounts = tiers || {
      stablecoin_discount_bps: 0,
      strk_discount_bps: 0,
      wbtc_discount_bps: 0,
      sage_discount_bps: 500,
      staked_sage_discount_bps: 1000,
      privacy_credit_discount_bps: 200,
    };

    switch (token) {
      case 'USDC':
        return discounts.stablecoin_discount_bps;
      case 'STRK':
        return discounts.strk_discount_bps;
      case 'WBTC':
        return discounts.wbtc_discount_bps;
      case 'SAGE':
        return discounts.sage_discount_bps;
      case 'STAKED_SAGE':
        return discounts.staked_sage_discount_bps;
      case 'PRIVACY_CREDIT':
        return discounts.privacy_credit_discount_bps;
      default:
        return 0;
    }
  }
}

/**
 * Create a PaymentsClient instance
 */
export function createPaymentsClient(
  http: HttpClient,
  contract: ContractClient,
  paymentRouterAddress: string,
  proofGatedPaymentAddress: string
): PaymentsClient {
  return new PaymentsClient(http, contract, {
    paymentRouterAddress,
    proofGatedPaymentAddress,
  });
}
