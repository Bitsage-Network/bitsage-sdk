/**
 * VM31 Deposit Denomination Whitelists
 *
 * Privacy gap #7 mitigation: deposits must use standard denominations
 * to prevent exact-amount correlation attacks.
 *
 * Only deposits are restricted — withdrawals and transfers are unrestricted.
 */

/** wBTC denominations (8 decimals) */
export const WBTC_DENOMINATIONS: readonly bigint[] = [
  50_000n,      // 0.0005 BTC
  100_000n,     // 0.001 BTC
  500_000n,     // 0.005 BTC
  1_000_000n,   // 0.01 BTC
  5_000_000n,   // 0.05 BTC
  10_000_000n,  // 0.1 BTC
];

/** SAGE denominations (18 decimals) */
export const SAGE_DENOMINATIONS: readonly bigint[] = [
  10_000_000_000_000_000n,     // 0.01 SAGE
  50_000_000_000_000_000n,     // 0.05 SAGE
  100_000_000_000_000_000n,    // 0.1 SAGE
  500_000_000_000_000_000n,    // 0.5 SAGE
  1_000_000_000_000_000_000n,  // 1 SAGE
  5_000_000_000_000_000_000n,  // 5 SAGE
];

/** ETH denominations (18 decimals) */
export const ETH_DENOMINATIONS: readonly bigint[] = [
  1_000_000_000_000_000n,    // 0.001 ETH
  5_000_000_000_000_000n,    // 0.005 ETH
  10_000_000_000_000_000n,   // 0.01 ETH
  50_000_000_000_000_000n,   // 0.05 ETH
  100_000_000_000_000_000n,  // 0.1 ETH
  500_000_000_000_000_000n,  // 0.5 ETH
];

/** STRK denominations (18 decimals) */
export const STRK_DENOMINATIONS: readonly bigint[] = [
  50_000_000_000_000_000n,     // 0.05 STRK
  100_000_000_000_000_000n,    // 0.1 STRK
  500_000_000_000_000_000n,    // 0.5 STRK
  1_000_000_000_000_000_000n,  // 1 STRK
  5_000_000_000_000_000_000n,  // 5 STRK
];

/** USDC denominations (6 decimals) */
export const USDC_DENOMINATIONS: readonly bigint[] = [
  1_000_000n,    // 1 USDC
  5_000_000n,    // 5 USDC
  10_000_000n,   // 10 USDC
  50_000_000n,   // 50 USDC
  100_000_000n,  // 100 USDC
  500_000_000n,  // 500 USDC
];

/** All denomination lists by VM31 asset ID */
export const VM31_DENOMINATIONS: Record<number, readonly bigint[]> = {
  0: WBTC_DENOMINATIONS,
  1: SAGE_DENOMINATIONS,
  2: ETH_DENOMINATIONS,
  3: STRK_DENOMINATIONS,
  4: USDC_DENOMINATIONS,
};

/** Denomination lists by token symbol */
export const DENOMINATION_BY_SYMBOL: Record<string, readonly bigint[]> = {
  wbtc: WBTC_DENOMINATIONS,
  sage: SAGE_DENOMINATIONS,
  eth: ETH_DENOMINATIONS,
  strk: STRK_DENOMINATIONS,
  usdc: USDC_DENOMINATIONS,
};

/**
 * Validate that a deposit amount is a standard denomination.
 * Throws if the amount is not in the whitelist.
 * Unknown assets pass through (forward-compatible).
 *
 * @param amount - Amount in base units (e.g., wei, satoshis)
 * @param assetIdOrSymbol - VM31 asset ID (0-4) or token symbol
 */
export function validateDenomination(amount: bigint, assetIdOrSymbol: number | string): void {
  let denoms: readonly bigint[] | undefined;
  if (typeof assetIdOrSymbol === 'number') {
    denoms = VM31_DENOMINATIONS[assetIdOrSymbol];
  } else {
    denoms = DENOMINATION_BY_SYMBOL[assetIdOrSymbol.toLowerCase()];
  }
  if (!denoms) return; // Unknown asset — no restriction
  if (!denoms.includes(amount)) {
    throw new Error(
      `Deposit must use a standard denomination for asset ${assetIdOrSymbol}. ` +
      `Got ${amount}. Valid: [${denoms.join(', ')}]`
    );
  }
}

/**
 * Split an amount into the fewest standard denominations (greedy, largest first).
 * Useful for automatically batching a deposit into multiple denomination-safe transactions.
 *
 * @returns denominations array and any remainder that can't be represented
 */
export function splitIntoDenominations(
  amount: bigint,
  assetIdOrSymbol: number | string,
): { denominations: bigint[]; remainder: bigint } {
  let denoms: readonly bigint[] | undefined;
  if (typeof assetIdOrSymbol === 'number') {
    denoms = VM31_DENOMINATIONS[assetIdOrSymbol];
  } else {
    denoms = DENOMINATION_BY_SYMBOL[assetIdOrSymbol.toLowerCase()];
  }
  if (!denoms) return { denominations: [amount], remainder: 0n };

  const sorted = [...denoms].sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
  const result: bigint[] = [];
  let remaining = amount;

  for (const denom of sorted) {
    while (remaining >= denom) {
      result.push(denom);
      remaining -= denom;
    }
  }

  return { denominations: result, remainder: remaining };
}

/**
 * Get valid denominations for an asset.
 * Returns undefined for unknown assets.
 */
export function getDenominations(assetIdOrSymbol: number | string): readonly bigint[] | undefined {
  if (typeof assetIdOrSymbol === 'number') {
    return VM31_DENOMINATIONS[assetIdOrSymbol];
  }
  return DENOMINATION_BY_SYMBOL[assetIdOrSymbol.toLowerCase()];
}
