/**
 * OTC Orderbook Client
 *
 * On-chain limit/market order book for peer-to-peer token trading.
 * Supports limit orders, market orders, batch operations, and
 * real-time orderbook depth queries.
 */
import type { ObelyskClient } from './client';

// ============================================================================
// Types
// ============================================================================

export enum OrderSide {
  Buy = 0,
  Sell = 1,
}

export enum OrderType {
  Limit = 0,
  Market = 1,
}

export enum OrderStatus {
  Open = 0,
  PartialFill = 1,
  Filled = 2,
  Cancelled = 3,
  Expired = 4,
}

export interface TradingPair {
  baseToken: string;
  quoteToken: string;
  minOrderSize: bigint;
  tickSize: bigint;
  isActive: boolean;
}

export interface OTCOrder {
  orderId: bigint;
  maker: string;
  pairId: number;
  side: OrderSide;
  orderType: OrderType;
  price: bigint;
  remaining: bigint;
  amount: bigint;
  status: OrderStatus;
  createdAt: number;
  expiresAt: number;
}

export interface OTCTrade {
  tradeId: bigint;
  makerOrderId: bigint;
  takerOrderId: bigint;
  maker: string;
  taker: string;
  price: bigint;
  amount: bigint;
  quoteAmount: bigint;
  executedAt: number;
}

export interface OrderbookConfig {
  makerFeeBps: number;
  takerFeeBps: number;
  defaultExpirySecs: number;
  maxOrdersPerUser: number;
  paused: boolean;
}

export interface PlaceLimitOrderParams {
  pairId: number;
  side: OrderSide;
  price: bigint;
  amount: bigint;
  /** Seconds until expiry. 0 or undefined uses the contract default. */
  expiresIn?: number;
}

export interface PlaceMarketOrderParams {
  pairId: number;
  side: OrderSide;
  amount: bigint;
}

export interface OrderbookDepthLevel {
  price: bigint;
  totalAmount: bigint;
  orderCount: number;
}

export interface OrderbookDepth {
  bids: OrderbookDepthLevel[];
  asks: OrderbookDepthLevel[];
}

export interface Stats24h {
  volume: bigint;
  high: bigint;
  low: bigint;
  tradeCount: bigint;
}

// ============================================================================
// Helpers
// ============================================================================

const U128_MASK = (1n << 128n) - 1n;

function splitU256(value: bigint): { low: string; high: string } {
  return {
    low: (value & U128_MASK).toString(),
    high: (value >> 128n).toString(),
  };
}

function parseU256(result: string[], offset: number): bigint {
  return BigInt(result[offset]) + (BigInt(result[offset + 1]) << 128n);
}

const ORDER_SIDE_VALUES: OrderSide[] = [OrderSide.Buy, OrderSide.Sell];
const ORDER_TYPE_VALUES: OrderType[] = [OrderType.Limit, OrderType.Market];
const ORDER_STATUS_VALUES: OrderStatus[] = [
  OrderStatus.Open,
  OrderStatus.PartialFill,
  OrderStatus.Filled,
  OrderStatus.Cancelled,
  OrderStatus.Expired,
];

/**
 * Parse an OTCOrder struct from a flat result array starting at the given offset.
 *
 * Layout (13 felts):
 *   [0..1]  orderId      (u256 — low, high)
 *   [2]     maker        (felt)
 *   [3]     pairId       (u8)
 *   [4]     side         (u8)
 *   [5]     orderType    (u8)
 *   [6..7]  price        (u256)
 *   [8..9]  amount       (u256)
 *   [10..11] remaining   (u256)
 *   [12]    status       (u8)
 *   [13]    createdAt    (u64)
 *   [14]    expiresAt    (u64)
 *
 * Total: 15 felts per order.
 */
const ORDER_FELT_COUNT = 15;

function parseOrder(result: string[], offset: number): OTCOrder {
  return {
    orderId: parseU256(result, offset),
    maker: result[offset + 2],
    pairId: Number(BigInt(result[offset + 3])),
    side: ORDER_SIDE_VALUES[Number(BigInt(result[offset + 4]))] ?? OrderSide.Buy,
    orderType: ORDER_TYPE_VALUES[Number(BigInt(result[offset + 5]))] ?? OrderType.Limit,
    price: parseU256(result, offset + 6),
    amount: parseU256(result, offset + 8),
    remaining: parseU256(result, offset + 10),
    status: ORDER_STATUS_VALUES[Number(BigInt(result[offset + 12]))] ?? OrderStatus.Open,
    createdAt: Number(BigInt(result[offset + 13])),
    expiresAt: Number(BigInt(result[offset + 14])),
  };
}

/**
 * Parse an OTCTrade struct from a flat result array starting at the given offset.
 *
 * Layout (15 felts):
 *   [0..1]   tradeId       (u256)
 *   [2..3]   makerOrderId  (u256)
 *   [4..5]   takerOrderId  (u256)
 *   [6]      maker         (felt)
 *   [7]      taker         (felt)
 *   [8..9]   price         (u256)
 *   [10..11] amount        (u256)
 *   [12..13] quoteAmount   (u256)
 *   [14]     executedAt    (u64)
 *
 * Total: 15 felts per trade.
 */
const TRADE_FELT_COUNT = 15;

function parseTrade(result: string[], offset: number): OTCTrade {
  return {
    tradeId: parseU256(result, offset),
    makerOrderId: parseU256(result, offset + 2),
    takerOrderId: parseU256(result, offset + 4),
    maker: result[offset + 6],
    taker: result[offset + 7],
    price: parseU256(result, offset + 8),
    amount: parseU256(result, offset + 10),
    quoteAmount: parseU256(result, offset + 12),
    executedAt: Number(BigInt(result[offset + 14])),
  };
}

// ============================================================================
// OTC Orderbook Client
// ============================================================================

export class OTCOrderbookClient {
  constructor(private readonly obelysk: ObelyskClient) {}

  private get contractAddress(): string {
    const addr = this.obelysk.contracts.otc_orderbook;
    if (!addr) throw new Error('OTC Orderbook contract not configured for this network');
    return addr;
  }

  // --------------------------------------------------------------------------
  // Write operations
  // --------------------------------------------------------------------------

  /**
   * Place a limit order on the orderbook.
   *
   * The contract handles internal matching against resting orders.
   * Returns the transaction hash.
   */
  async placeLimitOrder(params: PlaceLimitOrderParams): Promise<string> {
    const account = this.obelysk.requireAccount();
    const { low: pLow, high: pHigh } = splitU256(params.price);
    const { low: aLow, high: aHigh } = splitU256(params.amount);

    const result = await account.execute([
      {
        contractAddress: this.contractAddress,
        entrypoint: 'place_limit_order',
        calldata: [
          params.pairId.toString(),
          params.side.toString(),
          pLow,
          pHigh,
          aLow,
          aHigh,
          (params.expiresIn ?? 0).toString(),
        ],
      },
    ]);
    return result.transaction_hash;
  }

  /**
   * Place a market order that fills immediately against resting liquidity.
   * Returns the transaction hash.
   */
  async placeMarketOrder(params: PlaceMarketOrderParams): Promise<string> {
    const account = this.obelysk.requireAccount();
    const { low: aLow, high: aHigh } = splitU256(params.amount);

    const result = await account.execute([
      {
        contractAddress: this.contractAddress,
        entrypoint: 'place_market_order',
        calldata: [
          params.pairId.toString(),
          params.side.toString(),
          aLow,
          aHigh,
        ],
      },
    ]);
    return result.transaction_hash;
  }

  /**
   * Cancel a single order by ID.
   * Only the maker can cancel their own order.
   */
  async cancelOrder(orderId: bigint): Promise<string> {
    const account = this.obelysk.requireAccount();
    const { low, high } = splitU256(orderId);

    const result = await account.execute([
      {
        contractAddress: this.contractAddress,
        entrypoint: 'cancel_order',
        calldata: [low, high],
      },
    ]);
    return result.transaction_hash;
  }

  /**
   * Cancel all open orders for the caller.
   */
  async cancelAllOrders(): Promise<string> {
    const account = this.obelysk.requireAccount();

    const result = await account.execute([
      {
        contractAddress: this.contractAddress,
        entrypoint: 'cancel_all_orders',
        calldata: [],
      },
    ]);
    return result.transaction_hash;
  }

  /**
   * Place multiple limit orders in a single transaction.
   *
   * Cairo expects an array of (u8, OrderSide, u256, u256, u64) tuples.
   * Calldata: [length, ...flattened orders].
   */
  async batchPlaceOrders(orders: PlaceLimitOrderParams[]): Promise<string> {
    const account = this.obelysk.requireAccount();

    const calldata: string[] = [orders.length.toString()];
    for (const order of orders) {
      const { low: pLow, high: pHigh } = splitU256(order.price);
      const { low: aLow, high: aHigh } = splitU256(order.amount);
      calldata.push(
        order.pairId.toString(),
        order.side.toString(),
        pLow,
        pHigh,
        aLow,
        aHigh,
        (order.expiresIn ?? 0).toString(),
      );
    }

    const result = await account.execute([
      {
        contractAddress: this.contractAddress,
        entrypoint: 'batch_place_orders',
        calldata,
      },
    ]);
    return result.transaction_hash;
  }

  /**
   * Cancel multiple orders in a single transaction.
   *
   * Calldata: [length, ...flattened u256 order IDs].
   */
  async batchCancelOrders(orderIds: bigint[]): Promise<string> {
    const account = this.obelysk.requireAccount();

    const calldata: string[] = [orderIds.length.toString()];
    for (const id of orderIds) {
      const { low, high } = splitU256(id);
      calldata.push(low, high);
    }

    const result = await account.execute([
      {
        contractAddress: this.contractAddress,
        entrypoint: 'batch_cancel_orders',
        calldata,
      },
    ]);
    return result.transaction_hash;
  }

  // --------------------------------------------------------------------------
  // Read operations
  // --------------------------------------------------------------------------

  /**
   * Get a single order by ID.
   */
  async getOrder(orderId: bigint): Promise<OTCOrder> {
    const { low, high } = splitU256(orderId);
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_order',
      calldata: [low, high],
    });
    return parseOrder(result, 0);
  }

  /**
   * Get all order IDs belonging to a user.
   */
  async getUserOrders(user: string): Promise<bigint[]> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_user_orders',
      calldata: [user],
    });
    const len = Number(BigInt(result[0]));
    const ids: bigint[] = [];
    for (let i = 0; i < len; i++) {
      ids.push(parseU256(result, 1 + i * 2));
    }
    return ids;
  }

  /**
   * Get the best (highest) bid price for a trading pair.
   */
  async getBestBid(pairId: number): Promise<bigint> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_best_bid',
      calldata: [pairId.toString()],
    });
    return parseU256(result, 0);
  }

  /**
   * Get the best (lowest) ask price for a trading pair.
   */
  async getBestAsk(pairId: number): Promise<bigint> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_best_ask',
      calldata: [pairId.toString()],
    });
    return parseU256(result, 0);
  }

  /**
   * Get the bid-ask spread for a trading pair.
   */
  async getSpread(pairId: number): Promise<bigint> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_spread',
      calldata: [pairId.toString()],
    });
    return parseU256(result, 0);
  }

  /**
   * Get trading pair configuration.
   */
  async getPair(pairId: number): Promise<TradingPair> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_pair',
      calldata: [pairId.toString()],
    });
    return {
      baseToken: result[0],
      quoteToken: result[1],
      minOrderSize: parseU256(result, 2),
      tickSize: parseU256(result, 4),
      isActive: BigInt(result[6]) !== 0n,
    };
  }

  /**
   * Get the orderbook configuration (fees, limits, pause state).
   */
  async getConfig(): Promise<OrderbookConfig> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_config',
      calldata: [],
    });
    return {
      makerFeeBps: Number(BigInt(result[0])),
      takerFeeBps: Number(BigInt(result[1])),
      defaultExpirySecs: Number(BigInt(result[2])),
      maxOrdersPerUser: Number(BigInt(result[3])),
      paused: BigInt(result[4]) !== 0n,
    };
  }

  /**
   * Get aggregate orderbook statistics.
   */
  async getStats(): Promise<{
    orderCount: bigint;
    tradeCount: bigint;
    totalVolume: bigint;
    totalFees: bigint;
  }> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_stats',
      calldata: [],
    });
    return {
      orderCount: parseU256(result, 0),
      tradeCount: parseU256(result, 2),
      totalVolume: parseU256(result, 4),
      totalFees: parseU256(result, 6),
    };
  }

  /**
   * Get total number of orders ever placed.
   */
  async getOrderCount(): Promise<bigint> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_order_count',
      calldata: [],
    });
    return parseU256(result, 0);
  }

  /**
   * Get total number of trades executed.
   */
  async getTradeCount(): Promise<bigint> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_trade_count',
      calldata: [],
    });
    return parseU256(result, 0);
  }

  /**
   * Get the time-weighted average price for a trading pair.
   */
  async getTwap(pairId: number): Promise<bigint> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_twap',
      calldata: [pairId.toString()],
    });
    return parseU256(result, 0);
  }

  /**
   * Get 24-hour rolling statistics for a trading pair.
   */
  async get24hStats(pairId: number): Promise<Stats24h> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_24h_stats',
      calldata: [pairId.toString()],
    });
    return {
      volume: parseU256(result, 0),
      high: parseU256(result, 2),
      low: parseU256(result, 4),
      tradeCount: parseU256(result, 6),
    };
  }

  /**
   * Get the most recent trade for a trading pair.
   */
  async getLastTrade(pairId: number): Promise<{
    price: bigint;
    amount: bigint;
    timestamp: number;
  }> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_last_trade',
      calldata: [pairId.toString()],
    });
    return {
      price: parseU256(result, 0),
      amount: parseU256(result, 2),
      timestamp: Number(BigInt(result[4])),
    };
  }

  /**
   * Get the orderbook depth (price levels) for a trading pair.
   *
   * Returns up to `maxLevels` aggregated price levels for both
   * bids and asks. Each level contains price, total amount, and
   * number of orders at that price.
   */
  async getOrderbookDepth(pairId: number, maxLevels: number): Promise<OrderbookDepth> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_orderbook_depth',
      calldata: [pairId.toString(), maxLevels.toString()],
    });

    let offset = 0;

    // Parse bids array: [length, ...levels]
    const bidCount = Number(BigInt(result[offset]));
    offset += 1;
    const bids: OrderbookDepthLevel[] = [];
    for (let i = 0; i < bidCount; i++) {
      bids.push({
        price: parseU256(result, offset),
        totalAmount: parseU256(result, offset + 2),
        orderCount: Number(BigInt(result[offset + 4])),
      });
      offset += 5; // 2 (price u256) + 2 (amount u256) + 1 (count u32)
    }

    // Parse asks array: [length, ...levels]
    const askCount = Number(BigInt(result[offset]));
    offset += 1;
    const asks: OrderbookDepthLevel[] = [];
    for (let i = 0; i < askCount; i++) {
      asks.push({
        price: parseU256(result, offset),
        totalAmount: parseU256(result, offset + 2),
        orderCount: Number(BigInt(result[offset + 4])),
      });
      offset += 5;
    }

    return { bids, asks };
  }

  /**
   * Get active orders for a trading pair with pagination.
   */
  async getActiveOrders(pairId: number, offset: number, limit: number): Promise<OTCOrder[]> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_active_orders',
      calldata: [pairId.toString(), offset.toString(), limit.toString()],
    });

    const len = Number(BigInt(result[0]));
    const orders: OTCOrder[] = [];
    for (let i = 0; i < len; i++) {
      orders.push(parseOrder(result, 1 + i * ORDER_FELT_COUNT));
    }
    return orders;
  }

  /**
   * Get trade history for a trading pair with pagination.
   */
  async getTradeHistory(pairId: number, offset: number, limit: number): Promise<OTCTrade[]> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'get_trade_history',
      calldata: [pairId.toString(), offset.toString(), limit.toString()],
    });

    const len = Number(BigInt(result[0]));
    const trades: OTCTrade[] = [];
    for (let i = 0; i < len; i++) {
      trades.push(parseTrade(result, 1 + i * TRADE_FELT_COUNT));
    }
    return trades;
  }

  /**
   * Get the contract owner address.
   */
  async getOwner(): Promise<string> {
    const result = await this.obelysk.provider.callContract({
      contractAddress: this.contractAddress,
      entrypoint: 'owner',
      calldata: [],
    });
    return result[0];
  }
}
