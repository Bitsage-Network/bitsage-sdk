/**
 * SAGE Token Governance Module
 * Full governance system with proposals, voting, and tokenomics
 */

import { HttpClient } from '../transport/http-client';
import { ContractClient, toFelt } from '../transport/contract-client';
import type { TransactionReceipt } from '../transport/contract-client';
import type {
  ProposalStatus,
  ProposalType,
  GovernanceProposal,
  GovernanceRights,
  GovernanceStats,
  PoolBalances,
  VestingStatus,
  SecurityBudget,
  BurnEvent,
  EcosystemEmissionStatus,
  TokenFlowSummary,
  MilestoneStatus,
  RateLimitInfo,
  PendingTransfer,
  CreateProposalParams,
} from '../types/generated/governance';

import { GOVERNANCE_CONFIG } from '../types/generated/governance';

export interface GovernanceClientConfig {
  /** SAGE token contract address */
  sageTokenAddress: string;
  /** Governance contract address (if separate) */
  governanceAddress?: string;
  /** Burn manager contract address */
  burnManagerAddress?: string;
}

/** Transaction result */
export interface TransactionResult {
  transaction_hash: string;
  status: 'pending' | 'accepted' | 'rejected';
  receipt?: TransactionReceipt;
}

/** Vote direction */
export type VoteDirection = 'for' | 'against' | 'abstain';

/** Delegation info */
export interface DelegationInfo {
  /** Address delegated to */
  delegatee: string;
  /** Amount of voting power delegated */
  voting_power: bigint;
  /** When delegation started */
  delegated_at: number;
}

/** Voter info for a specific proposal */
export interface VoterInfo {
  /** Has voted */
  has_voted: boolean;
  /** Vote direction (if voted) */
  vote_direction?: VoteDirection;
  /** Voting power used */
  voting_power_used: bigint;
  /** Timestamp of vote */
  voted_at?: number;
}

/**
 * SAGE Token Governance Client
 *
 * Full governance functionality including:
 * - Proposal creation and management
 * - Voting with delegation support
 * - Tokenomics (burn rate, inflation, pools)
 * - Treasury management
 * - Large transfer rate limiting
 * - Vesting schedules
 *
 * @example
 * ```typescript
 * const governance = new GovernanceClient(httpClient, contractClient, config);
 *
 * // Check voting power
 * const power = await governance.getVotingPower(myAddress);
 * console.log(`Voting power: ${power / 10n**18n} SAGE`);
 *
 * // Create a proposal
 * const result = await governance.createProposal({
 *   description: 'Increase burn rate by 1%',
 *   proposal_type: 'BurnRateChange',
 *   burn_rate_change_bps: 100,
 * });
 *
 * // Vote on a proposal
 * await governance.vote(proposalId, 'for');
 *
 * // Check tokenomics
 * const burned = await governance.getTotalBurned();
 * const rate = await governance.getBurnRate();
 * ```
 */
export class GovernanceClient {
  private http: HttpClient;
  private contract: ContractClient;
  private config: GovernanceClientConfig;

  constructor(
    http: HttpClient,
    contract: ContractClient,
    config: GovernanceClientConfig
  ) {
    this.http = http;
    this.contract = contract;
    this.config = config;
  }

  // =========================================================================
  // Proposal Management
  // =========================================================================

  /**
   * Create a new governance proposal
   *
   * @param params - Proposal parameters
   * @returns Transaction result with proposal ID
   */
  async createProposal(params: CreateProposalParams): Promise<TransactionResult> {
    // Validate parameters
    this.validateProposalParams(params);

    const contractAddress = this.config.governanceAddress || this.config.sageTokenAddress;

    return this.contract.invokeAndWait(
      contractAddress,
      'create_proposal',
      [
        params.description,
        this.proposalTypeToFelt(params.proposal_type),
        toFelt(params.inflation_change_bps || 0),
        toFelt(params.burn_rate_change_bps || 0),
        params.treasury_spend_amount ? toFelt(params.treasury_spend_amount) : '0',
        params.treasury_spend_recipient || '0',
      ]
    );
  }

  /**
   * Get proposal details
   *
   * @param proposalId - Proposal ID
   * @returns Proposal details
   */
  async getProposal(proposalId: bigint): Promise<GovernanceProposal> {
    const response = await this.http.get<{
      proposal_id: string;
      proposer: string;
      description: string;
      proposal_type: string;
      inflation_change_bps: number;
      burn_rate_change_bps: number;
      treasury_spend_amount?: string;
      treasury_spend_recipient?: string;
      votes_for: string;
      votes_against: string;
      status: string;
      created_at: number;
      voting_starts_at: number;
      voting_ends_at: number;
      executed_at?: number;
      quorum_bps: number;
      snapshot_block: number;
    }>(`/api/governance/proposals/${proposalId}`);

    return {
      proposal_id: BigInt(response.proposal_id),
      proposer: response.proposer,
      description: response.description,
      proposal_type: response.proposal_type as ProposalType,
      inflation_change_bps: response.inflation_change_bps,
      burn_rate_change_bps: response.burn_rate_change_bps,
      treasury_spend_amount: response.treasury_spend_amount
        ? BigInt(response.treasury_spend_amount)
        : undefined,
      treasury_spend_recipient: response.treasury_spend_recipient,
      votes_for: BigInt(response.votes_for),
      votes_against: BigInt(response.votes_against),
      status: response.status as ProposalStatus,
      created_at: response.created_at,
      voting_starts_at: response.voting_starts_at,
      voting_ends_at: response.voting_ends_at,
      executed_at: response.executed_at,
      quorum_bps: response.quorum_bps,
      snapshot_block: response.snapshot_block,
    };
  }

  /**
   * List proposals with filtering
   *
   * @param params - Filter parameters
   * @returns Array of proposals
   */
  async listProposals(params?: {
    status?: ProposalStatus;
    proposal_type?: ProposalType;
    proposer?: string;
    limit?: number;
    offset?: number;
  }): Promise<GovernanceProposal[]> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.set('status', params.status);
    if (params?.proposal_type) queryParams.set('type', params.proposal_type);
    if (params?.proposer) queryParams.set('proposer', params.proposer);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());

    const response = await this.http.get<Array<{
      proposal_id: string;
      proposer: string;
      description: string;
      proposal_type: string;
      inflation_change_bps: number;
      burn_rate_change_bps: number;
      treasury_spend_amount?: string;
      treasury_spend_recipient?: string;
      votes_for: string;
      votes_against: string;
      status: string;
      created_at: number;
      voting_starts_at: number;
      voting_ends_at: number;
      executed_at?: number;
      quorum_bps: number;
      snapshot_block: number;
    }>>(`/api/governance/proposals?${queryParams.toString()}`);

    return response.map(p => ({
      proposal_id: BigInt(p.proposal_id),
      proposer: p.proposer,
      description: p.description,
      proposal_type: p.proposal_type as ProposalType,
      inflation_change_bps: p.inflation_change_bps,
      burn_rate_change_bps: p.burn_rate_change_bps,
      treasury_spend_amount: p.treasury_spend_amount
        ? BigInt(p.treasury_spend_amount)
        : undefined,
      treasury_spend_recipient: p.treasury_spend_recipient,
      votes_for: BigInt(p.votes_for),
      votes_against: BigInt(p.votes_against),
      status: p.status as ProposalStatus,
      created_at: p.created_at,
      voting_starts_at: p.voting_starts_at,
      voting_ends_at: p.voting_ends_at,
      executed_at: p.executed_at,
      quorum_bps: p.quorum_bps,
      snapshot_block: p.snapshot_block,
    }));
  }

  /**
   * Cancel a proposal (proposer only)
   *
   * @param proposalId - Proposal ID
   * @returns Transaction result
   */
  async cancelProposal(proposalId: bigint): Promise<TransactionResult> {
    const contractAddress = this.config.governanceAddress || this.config.sageTokenAddress;

    return this.contract.invokeAndWait(
      contractAddress,
      'cancel_proposal',
      [toFelt(proposalId)]
    );
  }

  /**
   * Execute a succeeded proposal
   *
   * @param proposalId - Proposal ID
   * @returns Transaction result
   */
  async executeProposal(proposalId: bigint): Promise<TransactionResult> {
    const contractAddress = this.config.governanceAddress || this.config.sageTokenAddress;

    return this.contract.invokeAndWait(
      contractAddress,
      'execute_proposal',
      [toFelt(proposalId)]
    );
  }

  // =========================================================================
  // Voting
  // =========================================================================

  /**
   * Vote on a proposal
   *
   * @param proposalId - Proposal ID
   * @param direction - Vote direction
   * @returns Transaction result
   */
  async vote(proposalId: bigint, direction: VoteDirection): Promise<TransactionResult> {
    const contractAddress = this.config.governanceAddress || this.config.sageTokenAddress;

    return this.contract.invokeAndWait(
      contractAddress,
      'vote',
      [toFelt(proposalId), this.voteDirectionToFelt(direction)]
    );
  }

  /**
   * Vote with specific voting power
   *
   * @param proposalId - Proposal ID
   * @param direction - Vote direction
   * @param votingPower - Amount of voting power to use
   * @returns Transaction result
   */
  async voteWithPower(
    proposalId: bigint,
    direction: VoteDirection,
    votingPower: bigint
  ): Promise<TransactionResult> {
    const contractAddress = this.config.governanceAddress || this.config.sageTokenAddress;

    return this.contract.invokeAndWait(
      contractAddress,
      'vote_with_power',
      [toFelt(proposalId), this.voteDirectionToFelt(direction), toFelt(votingPower)]
    );
  }

  /**
   * Get voter info for a proposal
   *
   * @param proposalId - Proposal ID
   * @param voter - Voter address
   * @returns Voter info
   */
  async getVoterInfo(proposalId: bigint, voter: string): Promise<VoterInfo> {
    const response = await this.http.get<{
      has_voted: boolean;
      vote_direction?: string;
      voting_power_used: string;
      voted_at?: number;
    }>(`/api/governance/proposals/${proposalId}/voters/${voter}`);

    return {
      has_voted: response.has_voted,
      vote_direction: response.vote_direction as VoteDirection | undefined,
      voting_power_used: BigInt(response.voting_power_used),
      voted_at: response.voted_at,
    };
  }

  // =========================================================================
  // Voting Power & Delegation
  // =========================================================================

  /**
   * Get voting power for an address
   *
   * @param address - Address to check
   * @returns Voting power (wei)
   */
  async getVotingPower(address: string): Promise<bigint> {
    const response = await this.http.get<{ voting_power: string }>(
      `/api/governance/voting-power/${address}`
    );
    return BigInt(response.voting_power);
  }

  /**
   * Get governance rights for an address
   *
   * @param address - Address to check
   * @returns Governance rights
   */
  async getGovernanceRights(address: string): Promise<GovernanceRights> {
    const response = await this.http.get<{
      address: string;
      voting_power: string;
      can_create_standard: boolean;
      can_create_inflation: boolean;
      can_create_emergency: boolean;
      active_proposals: number;
      last_proposal_at?: number;
      delegated_power: string;
      delegated_to?: string;
    }>(`/api/governance/rights/${address}`);

    return {
      ...response,
      voting_power: BigInt(response.voting_power),
      delegated_power: BigInt(response.delegated_power),
    };
  }

  /**
   * Delegate voting power to another address
   *
   * @param delegatee - Address to delegate to
   * @returns Transaction result
   */
  async delegate(delegatee: string): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.sageTokenAddress,
      'delegate',
      [delegatee]
    );
  }

  /**
   * Undelegate voting power
   *
   * @returns Transaction result
   */
  async undelegate(): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.sageTokenAddress,
      'undelegate',
      []
    );
  }

  /**
   * Get delegation info for an address
   *
   * @param address - Address to check
   * @returns Delegation info or null if not delegating
   */
  async getDelegationInfo(address: string): Promise<DelegationInfo | null> {
    try {
      const response = await this.http.get<{
        delegatee: string;
        voting_power: string;
        delegated_at: number;
      }>(`/api/governance/delegation/${address}`);

      return {
        delegatee: response.delegatee,
        voting_power: BigInt(response.voting_power),
        delegated_at: response.delegated_at,
      };
    } catch {
      return null;
    }
  }

  // =========================================================================
  // Tokenomics
  // =========================================================================

  /**
   * Get total SAGE burned
   *
   * @returns Total burned (wei)
   */
  async getTotalBurned(): Promise<bigint> {
    const response = await this.http.get<{ total_burned: string }>(
      '/api/governance/tokenomics/burned'
    );
    return BigInt(response.total_burned);
  }

  /**
   * Get current burn rate
   *
   * @returns Burn rate in basis points
   */
  async getBurnRate(): Promise<number> {
    const response = await this.http.get<{ burn_rate_bps: number }>(
      '/api/governance/tokenomics/burn-rate'
    );
    return response.burn_rate_bps;
  }

  /**
   * Get current inflation rate
   *
   * @returns Inflation rate in basis points
   */
  async getInflationRate(): Promise<number> {
    const response = await this.http.get<{ inflation_rate_bps: number }>(
      '/api/governance/tokenomics/inflation-rate'
    );
    return response.inflation_rate_bps;
  }

  /**
   * Get pool balances
   *
   * @returns All pool balances
   */
  async getPoolBalances(): Promise<PoolBalances> {
    const response = await this.http.get<{
      ecosystem: string;
      treasury: string;
      team: string;
      public_sale: string;
      pre_seed: string;
      seed: string;
      strategic: string;
      advisors: string;
      code_dev: string;
    }>('/api/governance/tokenomics/pools');

    return {
      ecosystem: BigInt(response.ecosystem),
      treasury: BigInt(response.treasury),
      team: BigInt(response.team),
      public_sale: BigInt(response.public_sale),
      pre_seed: BigInt(response.pre_seed),
      seed: BigInt(response.seed),
      strategic: BigInt(response.strategic),
      advisors: BigInt(response.advisors),
      code_dev: BigInt(response.code_dev),
    };
  }

  /**
   * Get vesting status
   *
   * @returns Current vesting status
   */
  async getVestingStatus(): Promise<VestingStatus> {
    return this.http.get<VestingStatus>('/api/governance/tokenomics/vesting');
  }

  /**
   * Get security budget
   *
   * @returns Security budget info
   */
  async getSecurityBudget(): Promise<SecurityBudget> {
    const response = await this.http.get<{
      annual_budget: string;
      remaining_budget: string;
      reserve_fund: string;
      last_audit_at: number;
      security_score: number;
    }>('/api/governance/tokenomics/security-budget');

    return {
      annual_budget: BigInt(response.annual_budget),
      remaining_budget: BigInt(response.remaining_budget),
      reserve_fund: BigInt(response.reserve_fund),
      last_audit_at: response.last_audit_at,
      security_score: response.security_score,
    };
  }

  /**
   * Get ecosystem emission status
   *
   * @returns Emission status
   */
  async getEcosystemEmissionStatus(): Promise<EcosystemEmissionStatus> {
    const response = await this.http.get<{
      remaining: string;
      total_emitted: string;
      current_month: number;
      last_emission_at: number;
      emission_rate: string;
    }>('/api/governance/tokenomics/ecosystem-emission');

    return {
      remaining: BigInt(response.remaining),
      total_emitted: BigInt(response.total_emitted),
      current_month: response.current_month,
      last_emission_at: response.last_emission_at,
      emission_rate: BigInt(response.emission_rate),
    };
  }

  /**
   * Get burn event history
   *
   * @param limit - Number of events
   * @returns Array of burn events
   */
  async getBurnHistory(limit: number = 100): Promise<BurnEvent[]> {
    const response = await this.http.get<Array<{
      event_id: string;
      amount: string;
      revenue_source: string;
      execution_price: string;
      burned_at: number;
      tx_hash: string;
    }>>(`/api/governance/tokenomics/burn-history?limit=${limit}`);

    return response.map(e => ({
      event_id: BigInt(e.event_id),
      amount: BigInt(e.amount),
      revenue_source: e.revenue_source,
      execution_price: BigInt(e.execution_price),
      burned_at: e.burned_at,
      tx_hash: e.tx_hash,
    }));
  }

  /**
   * Get token flow summary
   *
   * @param periodDays - Number of days for period
   * @returns Token flow summary
   */
  async getTokenFlowSummary(periodDays: number = 30): Promise<TokenFlowSummary> {
    const response = await this.http.get<{
      total_minted: string;
      total_burned: string;
      net_change_abs: string;
      is_deflationary: boolean;
      period_start: number;
      period_end: number;
    }>(`/api/governance/tokenomics/flow-summary?days=${periodDays}`);

    return {
      total_minted: BigInt(response.total_minted),
      total_burned: BigInt(response.total_burned),
      net_change_abs: BigInt(response.net_change_abs),
      is_deflationary: response.is_deflationary,
      period_start: response.period_start,
      period_end: response.period_end,
    };
  }

  /**
   * Get milestone status
   *
   * @returns Milestone flags
   */
  async getMilestoneStatus(): Promise<MilestoneStatus> {
    return this.http.get<MilestoneStatus>('/api/governance/tokenomics/milestones');
  }

  // =========================================================================
  // Rate Limiting & Large Transfers
  // =========================================================================

  /**
   * Get rate limit info for an address
   *
   * @param address - Address to check
   * @returns Rate limit info
   */
  async getRateLimitInfo(address: string): Promise<RateLimitInfo> {
    const response = await this.http.get<{
      amount_transferred: string;
      period_start: number;
      max_per_period: string;
      cooldown_remaining: number;
    }>(`/api/governance/rate-limit/${address}`);

    return {
      amount_transferred: BigInt(response.amount_transferred),
      period_start: response.period_start,
      max_per_period: BigInt(response.max_per_period),
      cooldown_remaining: response.cooldown_remaining,
    };
  }

  /**
   * Initiate a large transfer (requires timelock)
   *
   * @param to - Recipient address
   * @param amount - Amount (wei)
   * @returns Transaction result with transfer ID
   */
  async initiateLargeTransfer(to: string, amount: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.sageTokenAddress,
      'initiate_large_transfer',
      [to, toFelt(amount)]
    );
  }

  /**
   * Execute a pending large transfer
   *
   * @param transferId - Transfer ID
   * @returns Transaction result
   */
  async executeLargeTransfer(transferId: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.sageTokenAddress,
      'execute_large_transfer',
      [toFelt(transferId)]
    );
  }

  /**
   * Cancel a pending large transfer
   *
   * @param transferId - Transfer ID
   * @returns Transaction result
   */
  async cancelLargeTransfer(transferId: bigint): Promise<TransactionResult> {
    return this.contract.invokeAndWait(
      this.config.sageTokenAddress,
      'cancel_large_transfer',
      [toFelt(transferId)]
    );
  }

  /**
   * Get pending large transfers for an address
   *
   * @param address - Address to check
   * @returns Array of pending transfers
   */
  async getPendingTransfers(address: string): Promise<PendingTransfer[]> {
    const response = await this.http.get<Array<{
      transfer_id: string;
      from: string;
      to: string;
      amount: string;
      initiated_at: number;
      executable_after: number;
      status: string;
    }>>(`/api/governance/transfers/pending/${address}`);

    return response.map(t => ({
      transfer_id: BigInt(t.transfer_id),
      from: t.from,
      to: t.to,
      amount: BigInt(t.amount),
      initiated_at: t.initiated_at,
      executable_after: t.executable_after,
      status: t.status as PendingTransfer['status'],
    }));
  }

  // =========================================================================
  // Statistics
  // =========================================================================

  /**
   * Get governance statistics
   *
   * @returns Governance stats
   */
  async getGovernanceStats(): Promise<GovernanceStats> {
    const response = await this.http.get<{
      total_proposals: string;
      executed_proposals: string;
      defeated_proposals: string;
      total_voting_power: string;
      avg_participation_bps: number;
      quorum_threshold_bps: number;
      proposal_threshold: string;
    }>('/api/governance/stats');

    return {
      total_proposals: BigInt(response.total_proposals),
      executed_proposals: BigInt(response.executed_proposals),
      defeated_proposals: BigInt(response.defeated_proposals),
      total_voting_power: BigInt(response.total_voting_power),
      avg_participation_bps: response.avg_participation_bps,
      quorum_threshold_bps: response.quorum_threshold_bps,
      proposal_threshold: BigInt(response.proposal_threshold),
    };
  }

  /**
   * Get top voters by participation
   *
   * @param limit - Number of voters
   * @returns Array of top voters
   */
  async getTopVoters(limit: number = 100): Promise<Array<{
    address: string;
    voting_power: bigint;
    proposals_voted: number;
    participation_rate_bps: number;
  }>> {
    const response = await this.http.get<Array<{
      address: string;
      voting_power: string;
      proposals_voted: number;
      participation_rate_bps: number;
    }>>(`/api/governance/top-voters?limit=${limit}`);

    return response.map(v => ({
      address: v.address,
      voting_power: BigInt(v.voting_power),
      proposals_voted: v.proposals_voted,
      participation_rate_bps: v.participation_rate_bps,
    }));
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Check if address can create a proposal
   *
   * @param address - Address to check
   * @param proposalType - Type of proposal
   * @returns Whether address can create this proposal type
   */
  async canCreateProposal(address: string, proposalType: ProposalType): Promise<boolean> {
    const rights = await this.getGovernanceRights(address);

    switch (proposalType) {
      case 'Emergency':
        return rights.can_create_emergency;
      case 'InflationAdjustment':
        return rights.can_create_inflation;
      default:
        return rights.can_create_standard;
    }
  }

  /**
   * Get proposal quorum progress
   *
   * @param proposalId - Proposal ID
   * @returns Quorum progress (basis points of quorum achieved)
   */
  async getQuorumProgress(proposalId: bigint): Promise<{
    current_participation_bps: number;
    quorum_required_bps: number;
    quorum_reached: boolean;
  }> {
    const proposal = await this.getProposal(proposalId);
    const stats = await this.getGovernanceStats();

    const totalVotes = proposal.votes_for + proposal.votes_against;
    const participationBps = stats.total_voting_power > 0n
      ? Number((totalVotes * 10000n) / stats.total_voting_power)
      : 0;

    return {
      current_participation_bps: participationBps,
      quorum_required_bps: proposal.quorum_bps,
      quorum_reached: participationBps >= proposal.quorum_bps,
    };
  }

  /**
   * Check if proposal can be executed
   *
   * @param proposalId - Proposal ID
   * @returns Whether proposal can be executed
   */
  async canExecuteProposal(proposalId: bigint): Promise<{
    can_execute: boolean;
    reason?: string;
  }> {
    const proposal = await this.getProposal(proposalId);

    if (proposal.status !== 'Succeeded') {
      return { can_execute: false, reason: `Proposal status is ${proposal.status}` };
    }

    const now = Math.floor(Date.now() / 1000);
    const executionDelay = GOVERNANCE_CONFIG.EXECUTION_DELAY_SECS;
    const executeAfter = proposal.voting_ends_at + executionDelay;

    if (now < executeAfter) {
      return {
        can_execute: false,
        reason: `Execution delay not passed. Can execute after ${new Date(executeAfter * 1000).toISOString()}`,
      };
    }

    return { can_execute: true };
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private validateProposalParams(params: CreateProposalParams): void {
    if (!params.description || params.description.length === 0) {
      throw new Error('Proposal description is required');
    }

    if (params.inflation_change_bps !== undefined) {
      if (Math.abs(params.inflation_change_bps) > GOVERNANCE_CONFIG.MAX_INFLATION_CHANGE_BPS) {
        throw new Error(
          `Inflation change exceeds maximum of ${GOVERNANCE_CONFIG.MAX_INFLATION_CHANGE_BPS / 100}%`
        );
      }
    }

    if (params.burn_rate_change_bps !== undefined) {
      if (Math.abs(params.burn_rate_change_bps) > GOVERNANCE_CONFIG.MAX_BURN_RATE_CHANGE_BPS) {
        throw new Error(
          `Burn rate change exceeds maximum of ${GOVERNANCE_CONFIG.MAX_BURN_RATE_CHANGE_BPS / 100}%`
        );
      }
    }

    if (params.proposal_type === 'TreasurySpend') {
      if (!params.treasury_spend_amount || !params.treasury_spend_recipient) {
        throw new Error('Treasury spend amount and recipient are required');
      }
    }
  }

  private proposalTypeToFelt(type: ProposalType): string {
    const mapping: Record<ProposalType, string> = {
      Standard: '0',
      InflationAdjustment: '1',
      BurnRateChange: '2',
      TreasurySpend: '3',
      ProtocolUpgrade: '4',
      Emergency: '5',
    };
    return mapping[type];
  }

  private voteDirectionToFelt(direction: VoteDirection): string {
    const mapping: Record<VoteDirection, string> = {
      for: '0',
      against: '1',
      abstain: '2',
    };
    return mapping[direction];
  }
}

/**
 * Create a GovernanceClient instance
 */
export function createGovernanceClient(
  http: HttpClient,
  contract: ContractClient,
  sageTokenAddress: string,
  governanceAddress?: string,
  burnManagerAddress?: string
): GovernanceClient {
  return new GovernanceClient(http, contract, {
    sageTokenAddress,
    governanceAddress,
    burnManagerAddress,
  });
}

// Re-export types and constants
export type {
  ProposalStatus,
  ProposalType,
  GovernanceProposal,
  GovernanceRights,
  GovernanceStats,
  PoolBalances,
  VestingStatus,
  SecurityBudget,
  BurnEvent,
  EcosystemEmissionStatus,
  TokenFlowSummary,
  MilestoneStatus,
  RateLimitInfo,
  PendingTransfer,
  CreateProposalParams,
};

export { GOVERNANCE_CONFIG };
