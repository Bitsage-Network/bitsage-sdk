/**
 * React Hooks
 * All hooks for BitSage SDK React integration
 */

// Job hooks
export {
  useSubmitJob,
  useJobStatus,
  useJobs,
  useWaitForJob,
  useCancelJob,
  useJobResult,
} from './useJobs';

// Mining hooks
export {
  useMiningRewardEstimate,
  useWorkerMiningStats,
  useMiningPoolStatus,
  useDailyCap,
  useCurrentBaseReward,
  useGpuMultiplier,
  useRemainingDailyCap,
  useMiningOverview,
} from './useMining';

// Staking hooks
export {
  useStakeInfo,
  useStake,
  useUnstake,
  useClaimRewards,
  useStakingConfig,
  useWorkerTier,
  useWorkerTierBenefits,
  useMinStake,
  usePendingUnstakes,
  useDelegateStake,
  useTotalStaked,
  useMyStaking,
} from './useStaking';

// Worker hooks
export {
  useWorkers,
  useWorker,
  useWorkerProfile,
  useLeaderboard,
  useRegisterWorker,
  useHeartbeat,
  useWorkersByCapability,
} from './useWorkers';

// Privacy hooks
export {
  usePrivateAccount,
  usePrivateBalance,
  usePrivateTransfer,
  useRegisterPrivateAccount,
  useStealthAddress,
  useRefreshPrivateBalances,
  useAllPrivateBalances,
} from './usePrivacyHooks';

// Governance hooks
export {
  useProposal,
  useProposals,
  useCreateProposal,
  useVote,
  useVotingPower,
  useGovernanceRights,
  useDelegate,
  useGovernanceStats,
  usePoolBalances,
  useTotalBurned,
  useVestingStatus,
} from './useGovernance';

// Dashboard hooks
export {
  useValidatorStatus,
  useGpuMetrics,
  useRewardsInfo,
  useRewardsHistory,
  useJobAnalytics,
  useRecentJobs,
  useNetworkStats,
  useNetworkWorkers,
  useValidatorOverview,
} from './useDashboard';

// WebSocket hooks
export {
  useJobUpdates,
  useWorkerUpdates,
  useNetworkStatsStream,
  useProofVerified,
  useMultipleJobUpdates,
  useSmoothedNetworkStats,
} from './useWebSocketHooks';

// Confidential Swap hooks
export {
  useConfidentialSwap,
  useConfidentialOrders,
  useCreateOrder,
  useTakeOrder,
  useSwapHistory,
  useDecryptSwap,
  useSwapCalculator,
  useOrderStatus,
  usePrivateSwapFlow,
} from './useConfidentialSwap';

export type {
  UseConfidentialSwapResult,
  UseConfidentialOrdersResult,
  UseCreateOrderResult,
  UseTakeOrderResult,
  UseSwapHistoryResult,
  UseDecryptSwapResult,
  UseSwapCalculatorResult,
} from './useConfidentialSwap';
