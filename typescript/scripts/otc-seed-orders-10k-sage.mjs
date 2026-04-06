#!/usr/bin/env node
/**
 * OTC Orderbook — Seed 10K SAGE Liquidity
 *
 * Places a SAGE/USDC sell limit order (pair 0) and a SAGE/STRK sell limit order (pair 1)
 * to seed the orderbook with initial liquidity.
 *
 * Splits 10K SAGE across two orders:
 *   - 5,000 SAGE sell @ 0.10 USDC (pair 0: SAGE/USDC)
 *   - 5,000 SAGE sell @ 2.50 STRK (pair 1: SAGE/STRK)
 *
 * Usage:
 *   DEPLOYER_PRIVKEY=0x... node scripts/otc-seed-orders-10k-sage.mjs [--dry-run]
 *
 * Requires: Node 20+, starknet.js
 */

import { Account, RpcProvider, CallData } from 'starknet';

// ── Config ──────────────────────────────────────────────────────────────────
const RPC_URL = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_7/GUBwFqKhSgn4mwVbN6Sbn';
const DEPLOYER_ADDRESS = '0x00740f4fc2020dccdbf65770c1bdba7f34a594214e9c9b50ec10f3e684c5cebd';
const OTC_ORDERBOOK = '0x04165f8fe590e94d7f12e77af72577123b24cbd01101a62b53c3e119fb8bb119';
const SAGE_TOKEN = '0x0098d563900789f934e610b67482ae58793a2efc373ba3a45af94cdbf931c799';

const DRY_RUN = process.argv.includes('--dry-run');

// ── Amounts ─────────────────────────────────────────────────────────────────
const SAGE_PER_ORDER = 5_000n * 10n ** 18n; // 5,000 SAGE each
const TOTAL_SAGE = 10_000n * 10n ** 18n;    // 10,000 SAGE total

// Prices (u256) — always 18-decimal fixed-point regardless of quote token:
// Pair 0 (SAGE/USDC): 0.10 = 100_000_000_000_000_000 (1e17)
// Pair 1 (SAGE/STRK): 2.50 = 2_500_000_000_000_000_000 (2.5e18)
const PRICE_SAGE_USDC = 100_000_000_000_000_000n;    // $0.10 (18-decimal)
const PRICE_SAGE_STRK = 2_500_000_000_000_000_000n;  // 2.5 STRK (18-decimal)

const U128_MASK = (1n << 128n) - 1n;
function u256(v) { return { low: (v & U128_MASK).toString(), high: (v >> 128n).toString() }; }

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const privKey = process.env.DEPLOYER_PRIVKEY;
  if (!privKey) { console.error('ERROR: Set DEPLOYER_PRIVKEY'); process.exit(1); }

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   OTC Orderbook — Seed 10K SAGE Liquidity       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Deployer:  ${DEPLOYER_ADDRESS}`);
  console.log(`Orderbook: ${OTC_ORDERBOOK}`);
  if (DRY_RUN) console.log('MODE: DRY RUN');

  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account(provider, DEPLOYER_ADDRESS, privKey);

  // Step 1: Approve 10K SAGE for the OTC orderbook
  console.log('\n1. Approving 10,000 SAGE for OTC Orderbook...');
  const approveTx = {
    contractAddress: SAGE_TOKEN,
    entrypoint: 'approve',
    calldata: CallData.compile({
      spender: OTC_ORDERBOOK,
      amount: u256(TOTAL_SAGE),
    }),
  };

  if (!DRY_RUN) {
    const approveResult = await account.execute([approveTx]);
    console.log(`   TX: ${approveResult.transaction_hash}`);
    await provider.waitForTransaction(approveResult.transaction_hash);
    console.log('   ✓ Approved');
  } else {
    console.log('   [DRY RUN] Would approve 10,000 SAGE');
  }

  // Step 2: Place sell limit order on SAGE/USDC (pair 0)
  console.log('\n2. Placing sell limit order: 5,000 SAGE @ $0.10 USDC (pair 0)...');
  const order1 = {
    contractAddress: OTC_ORDERBOOK,
    entrypoint: 'place_limit_order',
    calldata: [
      '0',  // pairId = 0 (SAGE/USDC)
      '1',  // side = Sell
      u256(PRICE_SAGE_USDC).low, u256(PRICE_SAGE_USDC).high,  // price
      u256(SAGE_PER_ORDER).low, u256(SAGE_PER_ORDER).high,    // amount
      '0',  // expiresIn = default (7 days)
    ],
  };

  if (!DRY_RUN) {
    const result1 = await account.execute([order1]);
    console.log(`   TX: ${result1.transaction_hash}`);
    await provider.waitForTransaction(result1.transaction_hash);
    console.log('   ✓ Order placed');
  } else {
    console.log('   [DRY RUN] Would place sell order');
  }

  // Step 3: Place sell limit order on SAGE/STRK (pair 1)
  console.log('\n3. Placing sell limit order: 5,000 SAGE @ 2.5 STRK (pair 1)...');
  const order2 = {
    contractAddress: OTC_ORDERBOOK,
    entrypoint: 'place_limit_order',
    calldata: [
      '1',  // pairId = 1 (SAGE/STRK)
      '1',  // side = Sell
      u256(PRICE_SAGE_STRK).low, u256(PRICE_SAGE_STRK).high,  // price
      u256(SAGE_PER_ORDER).low, u256(SAGE_PER_ORDER).high,    // amount
      '0',  // expiresIn = default
    ],
  };

  if (!DRY_RUN) {
    const result2 = await account.execute([order2]);
    console.log(`   TX: ${result2.transaction_hash}`);
    await provider.waitForTransaction(result2.transaction_hash);
    console.log('   ✓ Order placed');
  } else {
    console.log('   [DRY RUN] Would place sell order');
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('Done! Two sell orders placed:');
  console.log('  • Pair 0 (SAGE/USDC): 5,000 SAGE @ $0.10');
  console.log('  • Pair 1 (SAGE/STRK): 5,000 SAGE @ 2.5 STRK');
  console.log('Total SAGE used: 10,000');
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
