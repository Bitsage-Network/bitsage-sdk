/**
 * React Hooks for Confidential Swap
 *
 * Privacy-preserving token swap hooks using ElGamal encryption and STWO proofs.
 *
 * @example
 * ```tsx
 * import { useConfidentialSwap, useConfidentialOrders } from '@bitsage/sdk/react';
 *
 * function SwapPage() {
 *   const { client, keyPair, generateKeyPair, isReady } = useConfidentialSwap();
 *   const { orders, isLoading, refetch } = useConfidentialOrders();
 *
 *   const handleBuy = async (orderId: bigint) => {
 *     const result = await client?.takeOrder(orderId, 10n * 10n ** 6n, 100n * 10n ** 18n);
 *     if (result?.success) {
 *       console.log('Swap completed:', result.transactionHash);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       {!isReady && <button onClick={generateKeyPair}>Generate Keys</button>}
 *       {orders.map(order => (
 *         <div key={order.orderId.toString()}>
 *           <button onClick={() => handleBuy(order.orderId)}>Buy SAGE</button>
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    ConfidentialSwapClient,
    ObelyskPrivacy,
    ElGamalKeyPair,
    ConfidentialOrder,
    CreateOrderRequest,
    CreateOrderResponse,
    TakeOrderResponse,
    SwapHistoryEntry,
    AssetId,
    ElGamalCiphertext,
} from '../../privacy';

// =============================================================================
// TYPES
// =============================================================================

export interface UseConfidentialSwapResult {
    /** The swap client instance */
    client: ConfidentialSwapClient | null;
    /** Privacy module for direct crypto operations */
    privacy: ObelyskPrivacy;
    /** Current key pair (null if not initialized) */
    keyPair: ElGamalKeyPair | null;
    /** Whether keys are initialized */
    isReady: boolean;
    /** Generate a new key pair */
    generateKeyPair: () => ElGamalKeyPair;
    /** Import existing key pair */
    importKeyPair: (keyPair: ElGamalKeyPair) => void;
    /** Export current key pair (for secure storage) */
    exportKeyPair: () => ElGamalKeyPair | null;
    /** Clear key pair */
    clearKeyPair: () => void;
}

export interface UseConfidentialOrdersResult {
    /** List of available orders */
    orders: ConfidentialOrder[];
    /** Loading state */
    isLoading: boolean;
    /** Error if any */
    error: Error | null;
    /** Refetch orders */
    refetch: () => Promise<void>;
    /** Filter orders by asset */
    filterByAsset: (asset: AssetId) => void;
    /** Current filter */
    currentFilter: AssetId | null;
}

export interface UseCreateOrderResult {
    /** Create a new private order */
    createOrder: (request: CreateOrderRequest) => Promise<CreateOrderResponse | null>;
    /** Loading state */
    isLoading: boolean;
    /** Error if any */
    error: Error | null;
    /** Last created order */
    lastOrder: CreateOrderResponse | null;
}

export interface UseTakeOrderResult {
    /** Take an existing order */
    takeOrder: (orderId: bigint, giveAmount: bigint, wantAmount: bigint) => Promise<TakeOrderResponse | null>;
    /** Loading state */
    isLoading: boolean;
    /** Error if any */
    error: Error | null;
    /** Last take result */
    lastResult: TakeOrderResponse | null;
}

export interface UseSwapHistoryResult {
    /** Swap history entries */
    history: SwapHistoryEntry[];
    /** Loading state */
    isLoading: boolean;
    /** Error if any */
    error: Error | null;
    /** Refetch history */
    refetch: () => Promise<void>;
}

export interface UseDecryptSwapResult {
    /** Decrypt a swap's amounts */
    decryptSwap: (
        encryptedGive: ElGamalCiphertext,
        encryptedWant: ElGamalCiphertext
    ) => { giveAmount: bigint | null; wantAmount: bigint | null };
    /** Decrypt a single encrypted amount */
    decryptAmount: (encrypted: ElGamalCiphertext) => bigint | null;
    /** Check if decryption is available */
    canDecrypt: boolean;
}

export interface UseSwapCalculatorResult {
    /** Calculate SAGE amount from USD */
    calculateSageFromUsd: (usdAmount: number) => bigint;
    /** Calculate USD from SAGE amount */
    calculateUsdFromSage: (sageAmount: bigint) => number;
    /** Current SAGE price in USD */
    sagePrice: number;
    /** Asset decimals */
    decimals: Record<AssetId, number>;
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Main hook for Confidential Swap functionality
 */
export function useConfidentialSwap(config?: {
    apiUrl?: string;
    contractAddress?: string;
}): UseConfidentialSwapResult {
    const [keyPair, setKeyPair] = useState<ElGamalKeyPair | null>(null);
    const [client, setClient] = useState<ConfidentialSwapClient | null>(null);

    const privacy = useMemo(() => new ObelyskPrivacy({ apiUrl: config?.apiUrl }), [config?.apiUrl]);

    // Initialize client when key pair is set
    useEffect(() => {
        if (keyPair) {
            const newClient = new ConfidentialSwapClient({
                apiUrl: config?.apiUrl,
                contractAddress: config?.contractAddress,
            }).withKeyPair(keyPair);
            setClient(newClient);
        } else {
            setClient(null);
        }
    }, [keyPair, config?.apiUrl, config?.contractAddress]);

    const generateKeyPair = useCallback(() => {
        const newKeyPair = privacy.generateKeyPair();
        setKeyPair(newKeyPair);
        return newKeyPair;
    }, [privacy]);

    const importKeyPair = useCallback((kp: ElGamalKeyPair) => {
        setKeyPair(kp);
    }, []);

    const exportKeyPair = useCallback(() => {
        return keyPair;
    }, [keyPair]);

    const clearKeyPair = useCallback(() => {
        setKeyPair(null);
    }, []);

    return {
        client,
        privacy,
        keyPair,
        isReady: keyPair !== null,
        generateKeyPair,
        importKeyPair,
        exportKeyPair,
        clearKeyPair,
    };
}

/**
 * Hook for fetching and managing confidential orders
 */
export function useConfidentialOrders(
    client: ConfidentialSwapClient | null,
    options?: { autoRefresh?: boolean; refreshInterval?: number }
): UseConfidentialOrdersResult {
    const [orders, setOrders] = useState<ConfidentialOrder[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [currentFilter, setCurrentFilter] = useState<AssetId | null>(null);

    const fetchOrders = useCallback(async () => {
        if (!client) return;

        setIsLoading(true);
        setError(null);

        try {
            const fetchedOrders = await client.getAvailableOrders(currentFilter ?? undefined);
            setOrders(fetchedOrders);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch orders'));
        } finally {
            setIsLoading(false);
        }
    }, [client, currentFilter]);

    // Initial fetch
    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    // Auto-refresh
    useEffect(() => {
        if (!options?.autoRefresh || !client) return;

        const interval = setInterval(fetchOrders, options.refreshInterval ?? 30000);
        return () => clearInterval(interval);
    }, [options?.autoRefresh, options?.refreshInterval, fetchOrders, client]);

    const filterByAsset = useCallback((asset: AssetId) => {
        setCurrentFilter(asset);
    }, []);

    return {
        orders,
        isLoading,
        error,
        refetch: fetchOrders,
        filterByAsset,
        currentFilter,
    };
}

/**
 * Hook for creating confidential orders
 */
export function useCreateOrder(client: ConfidentialSwapClient | null): UseCreateOrderResult {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [lastOrder, setLastOrder] = useState<CreateOrderResponse | null>(null);

    const createOrder = useCallback(
        async (request: CreateOrderRequest): Promise<CreateOrderResponse | null> => {
            if (!client) {
                setError(new Error('Client not initialized'));
                return null;
            }

            setIsLoading(true);
            setError(null);

            try {
                const order = await client.createPrivateOrder(request);
                setLastOrder(order);
                return order;
            } catch (err) {
                const error = err instanceof Error ? err : new Error('Failed to create order');
                setError(error);
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        [client]
    );

    return {
        createOrder,
        isLoading,
        error,
        lastOrder,
    };
}

/**
 * Hook for taking existing orders
 */
export function useTakeOrder(client: ConfidentialSwapClient | null): UseTakeOrderResult {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [lastResult, setLastResult] = useState<TakeOrderResponse | null>(null);

    const takeOrder = useCallback(
        async (
            orderId: bigint,
            giveAmount: bigint,
            wantAmount: bigint
        ): Promise<TakeOrderResponse | null> => {
            if (!client) {
                setError(new Error('Client not initialized'));
                return null;
            }

            setIsLoading(true);
            setError(null);

            try {
                const result = await client.takeOrder(orderId, giveAmount, wantAmount);
                setLastResult(result);

                if (!result.success && result.error) {
                    setError(new Error(result.error));
                }

                return result;
            } catch (err) {
                const error = err instanceof Error ? err : new Error('Failed to take order');
                setError(error);
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        [client]
    );

    return {
        takeOrder,
        isLoading,
        error,
        lastResult,
    };
}

/**
 * Hook for fetching swap history
 */
export function useSwapHistory(
    client: ConfidentialSwapClient | null,
    address: string | null
): UseSwapHistoryResult {
    const [history, setHistory] = useState<SwapHistoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchHistory = useCallback(async () => {
        if (!client || !address) return;

        setIsLoading(true);
        setError(null);

        try {
            const fetchedHistory = await client.getSwapHistory(address);
            setHistory(fetchedHistory);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch history'));
        } finally {
            setIsLoading(false);
        }
    }, [client, address]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    return {
        history,
        isLoading,
        error,
        refetch: fetchHistory,
    };
}

/**
 * Hook for decrypting swap amounts
 */
export function useDecryptSwap(client: ConfidentialSwapClient | null): UseDecryptSwapResult {
    const decryptSwap = useCallback(
        (encryptedGive: ElGamalCiphertext, encryptedWant: ElGamalCiphertext) => {
            if (!client) {
                return { giveAmount: null, wantAmount: null };
            }
            return client.decryptSwap(encryptedGive, encryptedWant);
        },
        [client]
    );

    const decryptAmount = useCallback(
        (encrypted: ElGamalCiphertext): bigint | null => {
            if (!client) return null;
            return client.decryptBalance(encrypted);
        },
        [client]
    );

    return {
        decryptSwap,
        decryptAmount,
        canDecrypt: client !== null,
    };
}

/**
 * Hook for swap amount calculations
 */
export function useSwapCalculator(): UseSwapCalculatorResult {
    // Fixed SAGE price for adoption phase
    const sagePrice = 0.10;

    const decimals: Record<AssetId, number> = {
        [AssetId.SAGE]: 18,
        [AssetId.USDC]: 6,
        [AssetId.STRK]: 18,
        [AssetId.ETH]: 18,
        [AssetId.BTC]: 8,
    };

    const calculateSageFromUsd = useCallback(
        (usdAmount: number): bigint => {
            const sageAmount = usdAmount / sagePrice;
            return BigInt(Math.floor(sageAmount * 10 ** decimals[AssetId.SAGE]));
        },
        [sagePrice]
    );

    const calculateUsdFromSage = useCallback(
        (sageAmount: bigint): number => {
            const sage = Number(sageAmount) / 10 ** decimals[AssetId.SAGE];
            return sage * sagePrice;
        },
        [sagePrice]
    );

    return {
        calculateSageFromUsd,
        calculateUsdFromSage,
        sagePrice,
        decimals,
    };
}

/**
 * Hook for order status tracking
 */
export function useOrderStatus(
    client: ConfidentialSwapClient | null,
    orderId: bigint | null
): {
    order: ConfidentialOrder | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
} {
    const [order, setOrder] = useState<ConfidentialOrder | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchOrder = useCallback(async () => {
        if (!client || orderId === null) return;

        setIsLoading(true);
        setError(null);

        try {
            const fetchedOrder = await client.getOrder(orderId);
            setOrder(fetchedOrder);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch order'));
        } finally {
            setIsLoading(false);
        }
    }, [client, orderId]);

    useEffect(() => {
        fetchOrder();
    }, [fetchOrder]);

    return {
        order,
        isLoading,
        error,
        refetch: fetchOrder,
    };
}

/**
 * Combined hook for complete swap flow
 */
export function usePrivateSwapFlow(config?: {
    apiUrl?: string;
    contractAddress?: string;
    userAddress?: string;
}): {
    // State
    isReady: boolean;
    keyPair: ElGamalKeyPair | null;
    orders: ConfidentialOrder[];
    history: SwapHistoryEntry[];

    // Actions
    initialize: () => ElGamalKeyPair;
    fetchOrders: () => Promise<void>;
    createOrder: (request: CreateOrderRequest) => Promise<CreateOrderResponse | null>;
    takeOrder: (orderId: bigint, giveAmount: bigint, wantAmount: bigint) => Promise<TakeOrderResponse | null>;
    decryptSwap: (give: ElGamalCiphertext, want: ElGamalCiphertext) => { giveAmount: bigint | null; wantAmount: bigint | null };

    // Calculator
    calculator: UseSwapCalculatorResult;

    // Loading/Error states
    isLoadingOrders: boolean;
    isProcessing: boolean;
    error: Error | null;
} {
    const swap = useConfidentialSwap(config);
    const ordersHook = useConfidentialOrders(swap.client, { autoRefresh: true });
    const createOrderHook = useCreateOrder(swap.client);
    const takeOrderHook = useTakeOrder(swap.client);
    const historyHook = useSwapHistory(swap.client, config?.userAddress ?? null);
    const decryptHook = useDecryptSwap(swap.client);
    const calculator = useSwapCalculator();

    return {
        // State
        isReady: swap.isReady,
        keyPair: swap.keyPair,
        orders: ordersHook.orders,
        history: historyHook.history,

        // Actions
        initialize: swap.generateKeyPair,
        fetchOrders: ordersHook.refetch,
        createOrder: createOrderHook.createOrder,
        takeOrder: takeOrderHook.takeOrder,
        decryptSwap: decryptHook.decryptSwap,

        // Calculator
        calculator,

        // Loading/Error states
        isLoadingOrders: ordersHook.isLoading,
        isProcessing: createOrderHook.isLoading || takeOrderHook.isLoading,
        error: ordersHook.error || createOrderHook.error || takeOrderHook.error,
    };
}
