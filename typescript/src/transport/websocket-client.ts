/**
 * WebSocket Client with auto-reconnect and subscription management
 */

import { SdkError } from '../client';

export interface WsConfig {
  /** WebSocket URL */
  url: string;
  /** Auto-reconnect on disconnect */
  reconnect: boolean;
  /** Initial reconnect delay (ms) */
  reconnectIntervalMs: number;
  /** Maximum reconnect attempts */
  maxReconnectAttempts: number;
  /** Heartbeat interval (ms) */
  heartbeatIntervalMs: number;
  /** Connection timeout (ms) */
  connectTimeoutMs: number;
}

export const DEFAULT_WS_CONFIG: WsConfig = {
  url: 'wss://api.bitsage.network/ws',
  reconnect: true,
  reconnectIntervalMs: 1000,
  maxReconnectAttempts: 10,
  heartbeatIntervalMs: 30000,
  connectTimeoutMs: 10000,
};

/** WebSocket event types */
export type WsEventType =
  | 'job_update'
  | 'worker_update'
  | 'network_stats'
  | 'proof_verified'
  | 'heartbeat'
  | 'error';

/** Base WebSocket event */
export interface WsEvent {
  type: WsEventType;
  timestamp: number;
  data: unknown;
}

/** Job update event */
export interface JobUpdateEvent extends WsEvent {
  type: 'job_update';
  data: {
    job_id: string;
    status: string;
    progress?: number;
    error?: string;
    worker_id?: string;
  };
}

/** Worker update event */
export interface WorkerUpdateEvent extends WsEvent {
  type: 'worker_update';
  data: {
    worker_id: string;
    status: string;
    gpu_utilization?: number;
    memory_usage?: number;
    active_jobs?: number;
    temperature?: number;
  };
}

/** Network stats event */
export interface NetworkStatsEvent extends WsEvent {
  type: 'network_stats';
  data: {
    active_workers: number;
    jobs_in_progress: number;
    tps: number;
    jobs_completed_last_hour: number;
  };
}

/** Proof verified event */
export interface ProofVerifiedEvent extends WsEvent {
  type: 'proof_verified';
  data: {
    proof_hash: string;
    job_id: string;
    verified: boolean;
    gas_used?: bigint;
    tx_hash?: string;
  };
}

type EventCallback<T extends WsEvent = WsEvent> = (event: T) => void;
type Unsubscribe = () => void;

/**
 * WebSocket Client with auto-reconnect and subscriptions
 */
export class WebSocketClient {
  private config: WsConfig;
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, Set<EventCallback>> = new Map();
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionallyClosed = false;

  // Event handlers
  private onReconnectCallback?: () => void;
  private onErrorCallback?: (error: Error) => void;
  private onDisconnectCallback?: () => void;

  constructor(config: Partial<WsConfig> = {}) {
    this.config = { ...DEFAULT_WS_CONFIG, ...config };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isIntentionallyClosed = false;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new SdkError('WebSocket connection timeout', 'WS_TIMEOUT'));
      }, this.config.connectTimeoutMs);

      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = () => {
          clearTimeout(timeoutId);
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (event) => {
          clearTimeout(timeoutId);
          const error = new SdkError('WebSocket error', 'WS_ERROR');
          this.onErrorCallback?.(error);
          reject(error);
        };

        this.ws.onclose = () => {
          clearTimeout(timeoutId);
          this.stopHeartbeat();
          this.onDisconnectCallback?.();

          if (!this.isIntentionallyClosed && this.config.reconnect) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        clearTimeout(timeoutId);
        reject(new SdkError((error as Error).message, 'WS_CONNECTION_FAILED'));
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to job updates
   */
  subscribeToJobUpdates(jobId: string, callback: EventCallback<JobUpdateEvent>): Unsubscribe {
    return this.subscribe(`job:${jobId}`, callback as EventCallback);
  }

  /**
   * Subscribe to worker updates
   */
  subscribeToWorkerUpdates(workerId: string, callback: EventCallback<WorkerUpdateEvent>): Unsubscribe {
    return this.subscribe(`worker:${workerId}`, callback as EventCallback);
  }

  /**
   * Subscribe to network stats
   */
  subscribeToNetworkStats(callback: EventCallback<NetworkStatsEvent>): Unsubscribe {
    return this.subscribe('network:stats', callback as EventCallback);
  }

  /**
   * Subscribe to proof verified events
   */
  subscribeToProofVerified(proofHash: string, callback: EventCallback<ProofVerifiedEvent>): Unsubscribe {
    return this.subscribe(`proof:${proofHash}`, callback as EventCallback);
  }

  /**
   * Generic subscribe method
   */
  subscribe(channel: string, callback: EventCallback): Unsubscribe {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      this.sendSubscribe(channel);
    }

    this.subscriptions.get(channel)!.add(callback);

    return () => {
      const callbacks = this.subscriptions.get(channel);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(channel);
          this.sendUnsubscribe(channel);
        }
      }
    };
  }

  /**
   * Set reconnect callback
   */
  onReconnect(callback: () => void): Unsubscribe {
    this.onReconnectCallback = callback;
    return () => { this.onReconnectCallback = undefined; };
  }

  /**
   * Set error callback
   */
  onError(callback: (error: Error) => void): Unsubscribe {
    this.onErrorCallback = callback;
    return () => { this.onErrorCallback = undefined; };
  }

  /**
   * Set disconnect callback
   */
  onDisconnect(callback: () => void): Unsubscribe {
    this.onDisconnectCallback = callback;
    return () => { this.onDisconnectCallback = undefined; };
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const event = JSON.parse(data) as WsEvent;

      // Handle heartbeat
      if (event.type === 'heartbeat') {
        return;
      }

      // Route to appropriate subscriptions
      const channel = this.getChannelFromEvent(event);
      const callbacks = this.subscriptions.get(channel);

      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(event);
          } catch (error) {
            console.error('Error in WebSocket callback:', error);
          }
        });
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  /**
   * Get channel from event
   */
  private getChannelFromEvent(event: WsEvent): string {
    switch (event.type) {
      case 'job_update':
        return `job:${(event.data as { job_id: string }).job_id}`;
      case 'worker_update':
        return `worker:${(event.data as { worker_id: string }).worker_id}`;
      case 'network_stats':
        return 'network:stats';
      case 'proof_verified':
        return `proof:${(event.data as { proof_hash: string }).proof_hash}`;
      default:
        return event.type;
    }
  }

  /**
   * Send subscribe message
   */
  private sendSubscribe(channel: string): void {
    this.send({ action: 'subscribe', channel });
  }

  /**
   * Send unsubscribe message
   */
  private sendUnsubscribe(channel: string): void {
    this.send({ action: 'unsubscribe', channel });
  }

  /**
   * Send message
   */
  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ action: 'ping' });
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      const error = new SdkError(
        `Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`,
        'WS_MAX_RECONNECTS'
      );
      this.onErrorCallback?.(error);
      return;
    }

    const delay = this.config.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        this.resubscribeAll();
        this.onReconnectCallback?.();
      } catch (error) {
        // Will trigger another reconnect via onclose handler
      }
    }, delay);
  }

  /**
   * Clear reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Resubscribe to all channels after reconnect
   */
  private resubscribeAll(): void {
    for (const channel of this.subscriptions.keys()) {
      this.sendSubscribe(channel);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WsConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
