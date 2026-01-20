/**
 * BitSage SDK
 *
 * Official TypeScript SDK for interacting with the BitSage Network.
 *
 * @example
 * ```typescript
 * import { BitSageClient } from '@bitsage/sdk';
 *
 * const client = new BitSageClient();
 *
 * // Submit an AI inference job
 * const response = await client.submitJob({
 *   job_type: { type: 'ai_inference', model_type: 'llama-7b', batch_size: 1 },
 *   input_data: btoa('Hello, BitSage!'),
 *   max_cost_sage: 100n,
 *   max_duration_secs: 3600,
 *   priority: 5,
 *   require_tee: false,
 * });
 *
 * console.log('Job submitted:', response.job_id);
 *
 * // Wait for completion
 * const result = await client.waitForCompletion(response.job_id);
 * console.log('Result:', result);
 * ```
 *
 * @packageDocumentation
 */

// Core client
export { BitSageClient, DEFAULT_CONFIG, SdkError } from './client';
export type { ClientConfig, Network, WalletConfig } from './client';

// Original types (backwards compatibility)
export type {
  JobId,
  WorkerId,
  JobType,
  JobStatus,
  GpuTier,
  WorkerStatus,
  ProofVerificationStatus,
  WorkerCapabilities,
  WorkerInfo,
  ProofDetails,
  NetworkStats,
  StakeInfo,
  FaucetStatus,
  SubmitJobRequest,
  SubmitJobResponse,
  JobStatusResponse,
  JobResult,
  ListJobsParams,
  ListJobsResponse,
  FaucetClaimResponse,
} from './types';

export { getMinStake, getGpuTier } from './types';

// Generated types (new comprehensive types)
export * from './types/generated';

// Transport layer
export {
  HttpClient,
  DEFAULT_HTTP_CONFIG,
  WebSocketClient,
  DEFAULT_WS_CONFIG,
  ContractClient,
  DEFAULT_CONTRACT_CONFIG,
  toFelt,
  fromFelt,
  splitU256,
  joinU256,
} from './transport';
export type {
  HttpConfig,
  WsConfig,
  WsEvent,
  JobUpdateEvent,
  WorkerUpdateEvent,
  NetworkStatsEvent,
  ProofVerifiedEvent,
  ContractConfig,
  TransactionReceipt,
  TxStatus,
} from './transport';

// Contract registry
export {
  SEPOLIA_CONTRACTS,
  MAINNET_CONTRACTS,
  LOCAL_CONTRACTS,
  getContractsForNetwork,
  isContractConfigured,
  SEPOLIA_TOKENS,
  MAINNET_TOKENS,
  getTokensForNetwork,
  PRAGMA_ORACLE,
} from './contracts';
export type { ContractRegistry, ExternalTokens } from './contracts';

// Feature modules
export {
  // Mining
  MiningClient,
  createMiningClient,
  // Dashboard
  DashboardClient,
  createDashboardClient,
  // WebSocket
  createWebSocketClient,
  // Batch
  BatchClient,
  createBatchClient,
  MAX_BATCH_SIZE,
  // Payments
  PaymentsClient,
  createPaymentsClient,
  // Staking
  StakingClient,
  createStakingClient,
  MIN_STAKE,
  SLASH_PERCENTAGES,
  UNSTAKE_LOCKUP_SECS,
  isWorkerEligible,
  getMinStakeForTier,
  // Workers
  WorkersClient,
  createWorkersClient,
  CAPABILITY_FLAGS,
  // Privacy
  PrivacyClient,
  createPrivacyClient,
  PrivacyKeyManager,
  getPrivacyDerivationMessage,
  isValidPublicKey,
  EncryptionHelper,
  createTransferProof,
  verifyTransferProof,
  // Governance
  GovernanceClient,
  createGovernanceClient,
  GOVERNANCE_CONFIG,
  // STWO Verifier
  StwoClient,
  createStwoClient,
  VERIFICATION_CONFIG,
  // TEE
  TeeClient,
  createTeeClient,
  // STWO GPU Prover
  StwoProverClient,
  createStwoProverClient,
  DEFAULT_PROVER_CONFIG,
  PROOF_TYPES,
  GPU_TIERS,
} from './modules';

export type {
  // Mining
  MiningClientConfig,
  // Dashboard
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
  WorkerSummary,
  NetworkWorkersResponse,
  // WebSocket
  UseWebSocketResult,
  // Batch
  BatchJobResponse,
  BatchStatusResponse,
  BatchOperationType,
  BatchOperation,
  GasEstimate,
  BatchVerifyRequest,
  BatchVerifyResponse,
  // Payments
  PaymentsClientConfig,
  // Staking
  StakingClientConfig,
  StakingTransactionResult,
  TeeType,
  WorkerTier,
  HolderTier,
  SlashReason,
  WorkerStake,
  StakingConfig,
  SlashRecord,
  DisputeRecord,
  WorkerTierBenefits,
  UnstakeRequest,
  // Workers
  WorkersClientConfig,
  WorkersTransactionResult,
  WorkerCapabilities as WorkerCapabilitiesExtended,
  WorkerProfile,
  PerformanceData,
  LeaderboardMetric,
  LeaderboardEntry,
  RegisterWorkerParams,
  // Privacy
  PrivacyClientConfig,
  PrivacyTransactionResult,
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
  // Governance
  GovernanceClientConfig,
  GovernanceTransactionResult,
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
  // STWO Verifier
  StwoClientConfig,
  StwoTransactionResult,
  VerificationStatus,
  ProofSource,
  StwoTeeType,
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
  // TEE
  TeeClientConfig,
  TeeTransactionResult,
  TeeResultParams,
  TeeJobResult,
  TeeChallengeParams,
  TeeChallengeStatus,
  GpuAttestation,
  WorkerTeeStatus,
  // STWO GPU Prover
  StwoProverConfig,
  StwoGpuTier,
  ProofJobPriority,
  ProofJobStatus,
  StwoProofType,
  ProofJobRequest,
  ProofJobResponse,
  ProofGenerationStatus,
  ProofResult,
  BatchProofRequest,
  BatchProofResponse,
  StwoProverMetrics,
  ProofCostEstimate,
} from './modules';

// Branding
export {
  BITSAGE_LOGO,
  BITSAGE_TAGLINE,
  BITSAGE_BANNER,
  OBELYSK_LOGO,
  OBELYSK_TAGLINE,
  OBELYSK_BANNER,
  printBitsageBanner,
  printObelyskanBanner,
  getVersionBanner,
} from './branding';

// Obelysk Privacy SDK (ElGamal encryption, Confidential Swaps, STWO proofs)
export {
  // Core privacy class
  ObelyskPrivacy,
  // Confidential swap client
  ConfidentialSwapClient,
  // Constants
  FIELD_PRIME,
  CURVE_ORDER,
  GENERATOR_G,
  GENERATOR_H,
  // Utility functions
  addMod,
  subMod,
  mulMod,
  powMod,
  invMod,
  ecAdd,
  ecMul,
  ecDouble,
  isIdentity,
  randomScalar,
  poseidonHash,
  // Asset enum
  AssetId,
} from './privacy';

export type {
  // Types from privacy module
  ElGamalKeyPair,
  ElGamalCiphertext as ObelyskCiphertext,
  EncryptionProof as ObelyskEncryptionProof,
  ConfidentialOrder,
  SwapProofBundle,
  RangeProof,
  RateProof,
  BalanceProof,
  ConfidentialSwapConfig,
  CreateOrderRequest,
  CreateOrderResponse,
  TakeOrderResponse,
  SwapHistoryEntry,
} from './privacy';
