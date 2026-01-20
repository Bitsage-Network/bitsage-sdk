/**
 * WebSocket Hooks
 * React hooks for real-time WebSocket subscriptions
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from '../providers/WebSocketProvider';
import type {
  JobUpdateEvent,
  WorkerUpdateEvent,
  NetworkStatsEvent,
  ProofVerifiedEvent,
} from '../../modules/websocket';

/**
 * Hook to subscribe to job updates
 *
 * @param jobId - Job ID to subscribe to
 *
 * @example
 * ```tsx
 * function JobProgress({ jobId }: { jobId: string }) {
 *   const { event, isSubscribed } = useJobUpdates(jobId);
 *
 *   return (
 *     <div>
 *       <p>Status: {event?.status || 'Waiting...'}</p>
 *       {event?.progress && <p>Progress: {event.progress}%</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useJobUpdates(jobId: string | undefined): {
  event: JobUpdateEvent | null;
  isSubscribed: boolean;
  history: JobUpdateEvent[];
} {
  const { subscribeToJob, isConnected } = useWebSocket();
  const [event, setEvent] = useState<JobUpdateEvent | null>(null);
  const [history, setHistory] = useState<JobUpdateEvent[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!jobId || !isConnected) {
      setIsSubscribed(false);
      return;
    }

    const handleEvent = (e: JobUpdateEvent) => {
      setEvent(e);
      setHistory((prev) => [...prev, e]);
    };

    unsubscribeRef.current = subscribeToJob(jobId, handleEvent);
    setIsSubscribed(true);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setIsSubscribed(false);
    };
  }, [jobId, isConnected, subscribeToJob]);

  return { event, isSubscribed, history };
}

/**
 * Hook to subscribe to worker updates
 *
 * @param workerId - Worker ID to subscribe to
 *
 * @example
 * ```tsx
 * function WorkerStatus({ workerId }: { workerId: string }) {
 *   const { event } = useWorkerUpdates(workerId);
 *
 *   return (
 *     <div>
 *       <p>Online: {event?.online ? 'Yes' : 'No'}</p>
 *       <p>Load: {event?.load || 0}%</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useWorkerUpdates(workerId: string | undefined): {
  event: WorkerUpdateEvent | null;
  isSubscribed: boolean;
} {
  const { subscribeToWorker, isConnected } = useWebSocket();
  const [event, setEvent] = useState<WorkerUpdateEvent | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!workerId || !isConnected) {
      setIsSubscribed(false);
      return;
    }

    unsubscribeRef.current = subscribeToWorker(workerId, setEvent);
    setIsSubscribed(true);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setIsSubscribed(false);
    };
  }, [workerId, isConnected, subscribeToWorker]);

  return { event, isSubscribed };
}

/**
 * Hook to subscribe to network stats updates
 *
 * @example
 * ```tsx
 * function NetworkDashboard() {
 *   const { stats } = useNetworkStatsStream();
 *
 *   return (
 *     <div>
 *       <p>Active workers: {stats?.active_workers || 0}</p>
 *       <p>Jobs in queue: {stats?.jobs_pending || 0}</p>
 *       <p>Total FLOPS: {stats?.total_flops || '0'}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useNetworkStatsStream(): {
  stats: NetworkStatsEvent | null;
  isSubscribed: boolean;
} {
  const { subscribeToNetworkStats, latestNetworkStats, isConnected } = useWebSocket();
  const [stats, setStats] = useState<NetworkStatsEvent | null>(latestNetworkStats);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isConnected) {
      setIsSubscribed(false);
      return;
    }

    unsubscribeRef.current = subscribeToNetworkStats(setStats);
    setIsSubscribed(true);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setIsSubscribed(false);
    };
  }, [isConnected, subscribeToNetworkStats]);

  // Update from context if we have cached stats
  useEffect(() => {
    if (latestNetworkStats) {
      setStats(latestNetworkStats);
    }
  }, [latestNetworkStats]);

  return { stats, isSubscribed };
}

/**
 * Hook to subscribe to proof verification events
 *
 * @param proofHash - Proof hash to subscribe to
 *
 * @example
 * ```tsx
 * function ProofStatus({ proofHash }: { proofHash: string }) {
 *   const { event, isVerified } = useProofVerified(proofHash);
 *
 *   return (
 *     <div>
 *       {isVerified ? (
 *         <p>Proof verified at block {event?.block_number}</p>
 *       ) : (
 *         <p>Waiting for verification...</p>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useProofVerified(proofHash: string | undefined): {
  event: ProofVerifiedEvent | null;
  isVerified: boolean;
  isSubscribed: boolean;
} {
  const { subscribeToProofVerified, isConnected } = useWebSocket();
  const [event, setEvent] = useState<ProofVerifiedEvent | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!proofHash || !isConnected) {
      setIsSubscribed(false);
      return;
    }

    unsubscribeRef.current = subscribeToProofVerified(proofHash, setEvent);
    setIsSubscribed(true);

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setIsSubscribed(false);
    };
  }, [proofHash, isConnected, subscribeToProofVerified]);

  return {
    event,
    isVerified: event?.data?.verified ?? false,
    isSubscribed,
  };
}

/**
 * Hook to subscribe to multiple jobs
 *
 * @param jobIds - Array of job IDs to subscribe to
 *
 * @example
 * ```tsx
 * function BatchJobProgress({ jobIds }: { jobIds: string[] }) {
 *   const { events, completedCount } = useMultipleJobUpdates(jobIds);
 *
 *   return (
 *     <div>
 *       <p>Completed: {completedCount} / {jobIds.length}</p>
 *       {Object.entries(events).map(([id, event]) => (
 *         <p key={id}>{id}: {event?.status}</p>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMultipleJobUpdates(jobIds: string[]): {
  events: Record<string, JobUpdateEvent | null>;
  completedCount: number;
  failedCount: number;
} {
  const { subscribeToJob, isConnected } = useWebSocket();
  const [events, setEvents] = useState<Record<string, JobUpdateEvent | null>>({});
  const unsubscribersRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    if (!isConnected) return;

    // Subscribe to new jobs
    for (const jobId of jobIds) {
      if (!unsubscribersRef.current.has(jobId)) {
        const unsubscribe = subscribeToJob(jobId, (event) => {
          setEvents((prev) => ({ ...prev, [jobId]: event }));
        });
        unsubscribersRef.current.set(jobId, unsubscribe);
      }
    }

    // Unsubscribe from removed jobs
    for (const [jobId, unsubscribe] of unsubscribersRef.current.entries()) {
      if (!jobIds.includes(jobId)) {
        unsubscribe();
        unsubscribersRef.current.delete(jobId);
        setEvents((prev) => {
          const next = { ...prev };
          delete next[jobId];
          return next;
        });
      }
    }

    return () => {
      // Cleanup all subscriptions on unmount
      for (const unsubscribe of unsubscribersRef.current.values()) {
        unsubscribe();
      }
      unsubscribersRef.current.clear();
    };
  }, [jobIds, isConnected, subscribeToJob]);

  const completedCount = Object.values(events).filter(
    (e) => e?.data?.status === 'completed'
  ).length;

  const failedCount = Object.values(events).filter(
    (e) => e?.data?.status === 'failed'
  ).length;

  return { events, completedCount, failedCount };
}

/**
 * Hook to get real-time metrics with smoothing
 *
 * @example
 * ```tsx
 * function SmoothMetrics() {
 *   const { currentValue, average, trend } = useSmoothedNetworkStats('jobs_pending');
 *
 *   return (
 *     <div>
 *       <p>Current: {currentValue}</p>
 *       <p>Avg (30s): {average.toFixed(2)}</p>
 *       <p>Trend: {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSmoothedNetworkStats(
  metric: keyof NetworkStatsEvent,
  windowSize: number = 10
): {
  currentValue: number;
  average: number;
  trend: number;
} {
  const { stats } = useNetworkStatsStream();
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    if (stats && typeof stats[metric] === 'number') {
      setHistory((prev) => {
        const next = [...prev, stats[metric] as number];
        return next.slice(-windowSize);
      });
    }
  }, [stats, metric, windowSize]);

  const currentValue = history[history.length - 1] || 0;
  const average =
    history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 0;

  // Calculate trend (difference between last and first half averages)
  let trend = 0;
  if (history.length >= 4) {
    const mid = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, mid);
    const secondHalf = history.slice(mid);
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    trend = secondAvg - firstAvg;
  }

  return { currentValue, average, trend };
}
