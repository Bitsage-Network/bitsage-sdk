/**
 * SDK Modules
 * Feature-specific clients for the BitSage network
 */

// Mining module
export { MiningClient, createMiningClient } from './mining';
export type { MiningClientConfig } from './mining';

// Dashboard module
export { DashboardClient, createDashboardClient } from './dashboard';
export type {
  ValidatorStatus,
  ValidatorStatusResponse,
  GpuMetrics,
  GpuMetricsResponse,
  RewardsInfo,
  HistoryPeriod,
  RewardHistoryEntry,
  RewardHistoryResponse,
  JobAnalytics,
  RecentJob,
  NetworkStats,
  WorkerSummary,
  NetworkWorkersResponse,
} from './dashboard';

// WebSocket module
export {
  WebSocketClient,
  DEFAULT_WS_CONFIG,
  createWebSocketClient,
} from './websocket';
export type {
  WsConfig,
  WsEvent,
  JobUpdateEvent,
  WorkerUpdateEvent,
  NetworkStatsEvent,
  ProofVerifiedEvent,
  UseWebSocketResult,
} from './websocket';

// Batch operations module
export {
  BatchClient,
  createBatchClient,
  MAX_BATCH_SIZE,
} from './batch';
export type {
  BatchJobResponse,
  BatchStatusResponse,
  BatchOperationType,
  BatchOperation,
  GasEstimate,
  BatchVerifyRequest,
  BatchVerifyResponse,
} from './batch';

// Payments module
export {
  PaymentsClient,
  createPaymentsClient,
} from './payments';
export type {
  PaymentsClientConfig,
} from './payments';

// Staking module
export {
  StakingClient,
  createStakingClient,
  MIN_STAKE,
  SLASH_PERCENTAGES,
  UNSTAKE_LOCKUP_SECS,
  isWorkerEligible,
  getMinStakeForTier,
} from './staking';
export type {
  StakingClientConfig,
  TransactionResult as StakingTransactionResult,
  TeeType,
  GpuTier,
  WorkerTier,
  HolderTier,
  SlashReason,
  WorkerStake,
  StakeInfo,
  StakingConfig,
  SlashRecord,
  DisputeRecord,
  WorkerTierBenefits,
  UnstakeRequest,
} from './staking';

// Workers module
export {
  WorkersClient,
  createWorkersClient,
  CAPABILITY_FLAGS,
} from './workers';
export type {
  WorkersClientConfig,
  TransactionResult as WorkersTransactionResult,
  WorkerStatus,
  WorkerCapabilities,
  WorkerInfo,
  WorkerProfile,
  PerformanceData,
  LeaderboardMetric,
  LeaderboardEntry,
  RegisterWorkerParams,
} from './workers';

// Privacy module
export {
  PrivacyClient,
  createPrivacyClient,
  PrivacyKeyManager,
  getPrivacyDerivationMessage,
  isValidPublicKey,
  EncryptionHelper,
  createTransferProof,
  verifyTransferProof,
} from './privacy';
export type {
  PrivacyClientConfig,
  TransactionResult as PrivacyTransactionResult,
  PrivacyAsset,
  ECPoint,
  ElGamalCiphertext,
  EncryptedBalance,
  PrivacyKeyPair,
  PrivateAccount,
  PrivateTransferParams,
  PrivateTransferWithAuditParams,
  SteganographicTransaction,
  MixingTransaction,
  MixingOutput,
  RagequitProof,
  DKGShare,
  ThresholdDecryptionRequest,
  MultiAssetBalances,
  PrivateSwapParams,
  TransferProof,
  AEHint,
  StealthAddress,
} from './privacy';

// Governance module
export {
  GovernanceClient,
  createGovernanceClient,
  GOVERNANCE_CONFIG,
} from './governance';
export type {
  GovernanceClientConfig,
  TransactionResult as GovernanceTransactionResult,
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
  VoteDirection,
  DelegationInfo,
  VoterInfo,
} from './governance';

// STWO Verifier module
export {
  StwoClient,
  createStwoClient,
  VERIFICATION_CONFIG,
} from './stwo';
export type {
  StwoClientConfig,
  TransactionResult as StwoTransactionResult,
  VerificationStatus,
  ProofSource,
  TeeType as StwoTeeType,
  TeeAttestation,
  ProofMetadata,
  GpuTeeProofParams,
  BatchStatus,
  ProofJobSpec,
  ProofType,
  ProofPriority,
  ProofSubmission,
  ProverMetrics,
  CompressionStats,
  CompressedProof,
  EnclaveInfo,
  ChallengeParams,
  ChallengeStatus,
} from './stwo';

// TEE module
export {
  TeeClient,
  createTeeClient,
} from './tee';
export type {
  TeeClientConfig,
  TransactionResult as TeeTransactionResult,
  TeeResultParams,
  TeeJobResult,
  TeeChallengeParams,
  TeeChallengeStatus,
  GpuAttestation,
  WorkerTeeStatus,
} from './tee';

// STWO GPU Prover module
export {
  StwoProverClient,
  createStwoProverClient,
  DEFAULT_PROVER_CONFIG,
  PROOF_TYPES,
  GPU_TIERS,
} from './stwo-prover';
export type {
  StwoProverConfig,
  GpuTier as StwoGpuTier,
  ProofJobPriority,
  ProofJobStatus,
  ProofType as StwoProofType,
  ProofJobRequest,
  ProofJobResponse,
  ProofGenerationStatus,
  ProofResult,
  BatchProofRequest,
  BatchProofResponse,
  ProverMetrics as StwoProverMetrics,
  ProofCostEstimate,
} from './stwo-prover';
