/**
 * BitSage SDK React Integration
 *
 * Provides React components and hooks for building BitSage applications.
 *
 * @example
 * ```tsx
 * import {
 *   BitSageProvider,
 *   WebSocketProvider,
 *   PrivacyProvider,
 *   useSubmitJob,
 *   useJobStatus,
 *   useNetworkStatsStream,
 * } from '@bitsage/sdk/react';
 *
 * function App() {
 *   return (
 *     <BitSageProvider network="sepolia">
 *       <WebSocketProvider autoConnect>
 *         <PrivacyProvider>
 *           <Dashboard />
 *         </PrivacyProvider>
 *       </WebSocketProvider>
 *     </BitSageProvider>
 *   );
 * }
 *
 * function Dashboard() {
 *   const { stats } = useNetworkStatsStream();
 *   const { submit, isLoading } = useSubmitJob();
 *
 *   return (
 *     <div>
 *       <h1>BitSage Network</h1>
 *       <p>Active workers: {stats?.active_workers}</p>
 *       <button onClick={() => submit({ ... })} disabled={isLoading}>
 *         Submit Job
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @packageDocumentation
 */

// Providers
export {
  // BitSage Provider
  BitSageProvider,
  useBitSage,
  useBitSageClient,
  useWallet,
  useNetwork,
  useContracts,
  BitSageContext,
  // Privacy Provider
  PrivacyProvider,
  usePrivacy,
  usePrivacyKeys,
  usePrivacyClient,
  PrivacyContext,
  // WebSocket Provider
  WebSocketProvider,
  useWebSocket,
  useWebSocketConnection,
  WebSocketContext,
} from './providers';

export type {
  BitSageContextValue,
  BitSageProviderProps,
  WalletConfig,
  PrivacyContextValue,
  PrivacyProviderProps,
  WebSocketContextValue,
  WebSocketProviderProps,
  ConnectionState,
} from './providers';

// Hooks
export {
  // Jobs
  useSubmitJob,
  useJobStatus,
  useJobs,
  useWaitForJob,
  useCancelJob,
  useJobResult,
  // Mining
  useMiningRewardEstimate,
  useWorkerMiningStats,
  useMiningPoolStatus,
  useDailyCap,
  useCurrentBaseReward,
  useGpuMultiplier,
  useRemainingDailyCap,
  useMiningOverview,
  // Staking
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
  // Workers
  useWorkers,
  useWorker,
  useWorkerProfile,
  useLeaderboard,
  useRegisterWorker,
  useHeartbeat,
  useWorkersByCapability,
  // Privacy
  usePrivateAccount,
  usePrivateBalance,
  usePrivateTransfer,
  useRegisterPrivateAccount,
  useStealthAddress,
  useRefreshPrivateBalances,
  useAllPrivateBalances,
  // Governance
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
  // Dashboard
  useValidatorStatus,
  useGpuMetrics,
  useRewardsInfo,
  useRewardsHistory,
  useJobAnalytics,
  useRecentJobs,
  useNetworkStats,
  useNetworkWorkers,
  useValidatorOverview,
  // WebSocket
  useJobUpdates,
  useWorkerUpdates,
  useNetworkStatsStream,
  useProofVerified,
  useMultipleJobUpdates,
  useSmoothedNetworkStats,
} from './hooks';
