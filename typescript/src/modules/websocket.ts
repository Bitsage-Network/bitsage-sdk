/**
 * WebSocket Module
 * Re-exports WebSocket client with additional convenience methods
 */

import {
  WebSocketClient,
  DEFAULT_WS_CONFIG,
} from '../transport/websocket-client';
import type {
  WsConfig,
  WsEvent,
  JobUpdateEvent,
  WorkerUpdateEvent,
  NetworkStatsEvent,
  ProofVerifiedEvent,
} from '../transport/websocket-client';

export {
  WebSocketClient,
  DEFAULT_WS_CONFIG,
};

export type {
  WsConfig,
  WsEvent,
  JobUpdateEvent,
  WorkerUpdateEvent,
  NetworkStatsEvent,
  ProofVerifiedEvent,
};

/**
 * Create a WebSocket client with default configuration
 */
export function createWebSocketClient(config?: Partial<WsConfig>): WebSocketClient {
  return new WebSocketClient(config);
}

/**
 * WebSocket hook result for React integration
 */
export interface UseWebSocketResult<T extends WsEvent> {
  /** Latest event */
  event: T | null;
  /** Connection status */
  isConnected: boolean;
  /** Error if any */
  error: Error | null;
  /** Unsubscribe function */
  unsubscribe: () => void;
}
