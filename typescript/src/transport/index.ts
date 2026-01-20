/**
 * Transport Layer
 * HTTP, WebSocket, and Contract clients
 */

export { HttpClient, DEFAULT_HTTP_CONFIG } from './http-client';
export type { HttpConfig, HttpErrorResponse } from './http-client';

export { WebSocketClient, DEFAULT_WS_CONFIG } from './websocket-client';
export type {
  WsConfig,
  WsEvent,
  WsEventType,
  JobUpdateEvent,
  WorkerUpdateEvent,
  NetworkStatsEvent,
  ProofVerifiedEvent,
} from './websocket-client';

export {
  ContractClient,
  DEFAULT_CONTRACT_CONFIG,
  toFelt,
  fromFelt,
  splitU256,
  joinU256,
} from './contract-client';
export type {
  ContractConfig,
  CallResult,
  TxStatus,
  TransactionReceipt
} from './contract-client';
