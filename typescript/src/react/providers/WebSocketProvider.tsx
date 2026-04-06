/**
 * WebSocket Provider
 * Context provider for real-time updates via WebSocket
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import {
  WebSocketClient,
  type WsConfig,
  type WsEvent,
  type JobUpdateEvent,
  type WorkerUpdateEvent,
  type NetworkStatsEvent,
  type ProofVerifiedEvent,
} from '../../modules/websocket';
import { useBitSage } from './BitSageProvider';

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * WebSocket context value
 */
export interface WebSocketContextValue {
  /** WebSocket client instance */
  ws: WebSocketClient | null;
  /** Current connection state */
  connectionState: ConnectionState;
  /** Whether connected */
  isConnected: boolean;
  /** Last error message */
  error: string | null;
  /** Reconnect attempt count */
  reconnectAttempts: number;

  // Connection management
  /** Connect to WebSocket server */
  connect: () => Promise<void>;
  /** Disconnect from WebSocket server */
  disconnect: () => void;
  /** Force reconnect */
  reconnect: () => Promise<void>;

  // Subscription management
  /** Subscribe to job updates */
  subscribeToJob: (
    jobId: string,
    callback: (event: JobUpdateEvent) => void
  ) => () => void;
  /** Subscribe to worker updates */
  subscribeToWorker: (
    workerId: string,
    callback: (event: WorkerUpdateEvent) => void
  ) => () => void;
  /** Subscribe to network stats */
  subscribeToNetworkStats: (
    callback: (event: NetworkStatsEvent) => void
  ) => () => void;
  /** Subscribe to proof verification events */
  subscribeToProofVerified: (
    proofHash: string,
    callback: (event: ProofVerifiedEvent) => void
  ) => () => void;

  // Latest events (for convenience)
  /** Latest network stats event */
  latestNetworkStats: NetworkStatsEvent | null;
}

/**
 * WebSocket Provider props
 */
export interface WebSocketProviderProps {
  /** Child components */
  children: ReactNode;
  /** WebSocket URL override */
  url?: string;
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** WebSocket configuration */
  config?: Partial<WsConfig>;
}

// Create context
const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

/**
 * Get default WebSocket URL for network
 */
function getDefaultWsUrl(network: string): string {
  switch (network) {
    case 'mainnet':
      return 'wss://ws.bitsage.network';
    case 'sepolia':
      return 'wss://ws.sepolia.bitsage.network';
    case 'local':
      return 'ws://localhost:8081';
    default:
      return 'wss://ws.sepolia.bitsage.network';
  }
}

/**
 * WebSocket Provider Component
 *
 * Provides real-time WebSocket connection for:
 * - Job status updates
 * - Worker status updates
 * - Network statistics
 * - Proof verification events
 *
 * @example
 * ```tsx
 * import { BitSageProvider, WebSocketProvider } from '@obelyzk/sdk/react';
 *
 * function App() {
 *   return (
 *     <BitSageProvider network="sepolia">
 *       <WebSocketProvider autoConnect>
 *         <Dashboard />
 *       </WebSocketProvider>
 *     </BitSageProvider>
 *   );
 * }
 * ```
 */
export function WebSocketProvider({
  children,
  url,
  autoConnect = true,
  config,
}: WebSocketProviderProps): JSX.Element {
  const { network } = useBitSage();

  // State
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [latestNetworkStats, setLatestNetworkStats] = useState<NetworkStatsEvent | null>(null);

  // Refs
  const wsRef = useRef<WebSocketClient | null>(null);
  const unsubscribersRef = useRef<Map<string, () => void>>(new Map());

  // Resolve WebSocket URL
  const wsUrl = url || getDefaultWsUrl(network);

  // Create WebSocket client
  useEffect(() => {
    const ws = new WebSocketClient({
      url: wsUrl,
      reconnect: true,
      reconnectIntervalMs: 1000,
      maxReconnectAttempts: 10,
      heartbeatIntervalMs: 30000,
      ...config,
    });

    wsRef.current = ws;

    // Set up event handlers
    ws.onReconnect(() => {
      setReconnectAttempts((prev) => prev + 1);
    });

    ws.onError((err) => {
      setError(err.message);
      setConnectionState('error');
    });

    return () => {
      // Clean up subscriptions
      unsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribersRef.current.clear();

      // Disconnect
      ws.disconnect();
      wsRef.current = null;
    };
  }, [wsUrl, config]);

  // Connect handler
  const connect = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws) return;

    setConnectionState('connecting');
    setError(null);

    try {
      await ws.connect();
      setConnectionState('connected');
      setReconnectAttempts(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setConnectionState('error');
      throw err;
    }
  }, []);

  // Disconnect handler
  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;

    ws.disconnect();
    setConnectionState('disconnected');
    setError(null);
  }, []);

  // Reconnect handler
  const reconnect = useCallback(async () => {
    disconnect();
    await connect();
  }, [connect, disconnect]);

  // Subscribe to job updates
  const subscribeToJob = useCallback(
    (jobId: string, callback: (event: JobUpdateEvent) => void): (() => void) => {
      const ws = wsRef.current;
      if (!ws) {
        console.warn('WebSocket not initialized');
        return () => {};
      }

      const unsubscribe = ws.subscribeToJobUpdates(jobId, callback);
      const key = `job_${jobId}`;
      unsubscribersRef.current.set(key, unsubscribe);

      return () => {
        unsubscribe();
        unsubscribersRef.current.delete(key);
      };
    },
    []
  );

  // Subscribe to worker updates
  const subscribeToWorker = useCallback(
    (workerId: string, callback: (event: WorkerUpdateEvent) => void): (() => void) => {
      const ws = wsRef.current;
      if (!ws) {
        console.warn('WebSocket not initialized');
        return () => {};
      }

      const unsubscribe = ws.subscribeToWorkerUpdates(workerId, callback);
      const key = `worker_${workerId}`;
      unsubscribersRef.current.set(key, unsubscribe);

      return () => {
        unsubscribe();
        unsubscribersRef.current.delete(key);
      };
    },
    []
  );

  // Subscribe to network stats
  const subscribeToNetworkStats = useCallback(
    (callback: (event: NetworkStatsEvent) => void): (() => void) => {
      const ws = wsRef.current;
      if (!ws) {
        console.warn('WebSocket not initialized');
        return () => {};
      }

      // Wrap callback to update latest stats
      const wrappedCallback = (event: NetworkStatsEvent) => {
        setLatestNetworkStats(event);
        callback(event);
      };

      const unsubscribe = ws.subscribeToNetworkStats(wrappedCallback);
      const key = 'network_stats';
      unsubscribersRef.current.set(key, unsubscribe);

      return () => {
        unsubscribe();
        unsubscribersRef.current.delete(key);
      };
    },
    []
  );

  // Subscribe to proof verified events
  const subscribeToProofVerified = useCallback(
    (proofHash: string, callback: (event: ProofVerifiedEvent) => void): (() => void) => {
      const ws = wsRef.current;
      if (!ws) {
        console.warn('WebSocket not initialized');
        return () => {};
      }

      const unsubscribe = ws.subscribeToProofVerified(proofHash, callback);
      const key = `proof_${proofHash}`;
      unsubscribersRef.current.set(key, unsubscribe);

      return () => {
        unsubscribe();
        unsubscribersRef.current.delete(key);
      };
    },
    []
  );

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && wsRef.current) {
      connect().catch((err) => {
        console.error('Auto-connect failed:', err);
      });
    }
  }, [autoConnect, connect]);

  // Context value
  const value = useMemo<WebSocketContextValue>(
    () => ({
      ws: wsRef.current,
      connectionState,
      isConnected: connectionState === 'connected',
      error,
      reconnectAttempts,
      connect,
      disconnect,
      reconnect,
      subscribeToJob,
      subscribeToWorker,
      subscribeToNetworkStats,
      subscribeToProofVerified,
      latestNetworkStats,
    }),
    [
      connectionState,
      error,
      reconnectAttempts,
      connect,
      disconnect,
      reconnect,
      subscribeToJob,
      subscribeToWorker,
      subscribeToNetworkStats,
      subscribeToProofVerified,
      latestNetworkStats,
    ]
  );

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

/**
 * Hook to access WebSocket context
 *
 * @throws Error if used outside of WebSocketProvider
 */
export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext);

  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }

  return context;
}

/**
 * Hook to get WebSocket connection state
 */
export function useWebSocketConnection(): {
  connectionState: ConnectionState;
  isConnected: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;
} {
  const {
    connectionState,
    isConnected,
    error,
    connect,
    disconnect,
    reconnect,
  } = useWebSocket();

  return {
    connectionState,
    isConnected,
    error,
    connect,
    disconnect,
    reconnect,
  };
}

export { WebSocketContext };
