#!/usr/bin/env node
/**
 * DarkPool 10K SAGE Deposit Script
 *
 * Deposits 10,000 SAGE into the DarkPool contract using ElGamal encryption
 * and AE hints for O(1) balance decryption.
 *
 * Usage:
 *   DEPLOYER_PRIVKEY=0x... node scripts/darkpool-deposit-500k-sage.mjs
 *
 * Requires: Node 20+, starknet.js
 */

import { Account, RpcProvider, CallData, hash } from 'starknet';

// ── Config ──────────────────────────────────────────────────────────────────
const RPC_URL = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_7/GUBwFqKhSgn4mwVbN6Sbn';
const DEPLOYER_ADDRESS = '0x00740f4fc2020dccdbf65770c1bdba7f34a594214e9c9b50ec10f3e684c5cebd';
const DARKPOOL_ADDRESS = '0x0230b5822556f0d9afca7b02f01e37cb9cf2a7e8d590a9020e9bbca183ea7727';
const SAGE_TOKEN = '0x0098d563900789f934e610b67482ae58793a2efc373ba3a45af94cdbf931c799';
const SAGE_ASSET_ID = '0x1';

// 10,000 SAGE in wei (18 decimals)
const AMOUNT = 10_000n * 10n ** 18n;

// ── STARK curve constants ───────────────────────────────────────────────────
const FIELD_PRIME = 0x800000000000011000000000000000000000000000000000000000000000001n;
const CURVE_ORDER = 0x800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2fn;
const GENERATOR_G = {
  x: 0x1ef15c18599971b7beced415a40f0c7deacfd9b0d1819e03d723d8bc943cfcan,
  y: 0x5668060aa49730b7be4801df46ec62de53ecd11abe43a32873000c36e8dc1f0n,
};
const GENERATOR_H = {
  x: 0x73bd2c1b04d08e15c7a92d041c72cae8e6aa9fbcc95afd9b48ebe4efb4d8a20n,
  y: 0x1bd58b91aecc8b8a4bdb51a90b83d7d5a23aa1253ad62ff02d75f5463fc1c89n,
};

// ── EC Math (minimal, for deposit only) ─────────────────────────────────────
function mod(a, m) {
  const r = a % m;
  return r < 0n ? r + m : r;
}

function invMod(a, m) {
  let [old_r, r] = [mod(a, m), m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, m);
}

function ecAdd(p1, p2) {
  if (!p1) return p2;
  if (!p2) return p1;
  if (p1.x === p2.x && p1.y === p2.y) {
    const num = mod(3n * p1.x * p1.x + 1n, FIELD_PRIME);
    const den = invMod(2n * p1.y, FIELD_PRIME);
    const lam = mod(num * den, FIELD_PRIME);
    const x3 = mod(lam * lam - 2n * p1.x, FIELD_PRIME);
    const y3 = mod(lam * (p1.x - x3) - p1.y, FIELD_PRIME);
    return { x: x3, y: y3 };
  }
  if (p1.x === p2.x) return null;
  const lam = mod((p2.y - p1.y) * invMod(p2.x - p1.x, FIELD_PRIME), FIELD_PRIME);
  const x3 = mod(lam * lam - p1.x - p2.x, FIELD_PRIME);
  const y3 = mod(lam * (p1.x - x3) - p1.y, FIELD_PRIME);
  return { x: x3, y: y3 };
}

function ecMul(k, p) {
  k = mod(k, CURVE_ORDER);
  let result = null;
  let addend = p;
  while (k > 0n) {
    if (k & 1n) result = ecAdd(result, addend);
    addend = ecAdd(addend, addend);
    k >>= 1n;
  }
  return result;
}

function randomScalar() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let val = 0n;
  for (const b of bytes) val = (val << 8n) | BigInt(b);
  return (val % (CURVE_ORDER - 2n)) + 1n;
}

// ── ElGamal + AE Hint ──────────────────────────────────────────────────────
function elgamalEncrypt(amount, publicKey) {
  const r = randomScalar();
  const c1 = ecMul(r, GENERATOR_G);
  const mH = ecMul(amount, GENERATOR_H);
  const rPK = ecMul(r, publicKey);
  const c2 = ecAdd(mH, rPK);
  return { c1, c2, randomness: r };
}

function createAEHint(amount, sharedSecret) {
  const encryptedAmount = mod(amount + sharedSecret, FIELD_PRIME);
  const mac = BigInt(hash.computePoseidonHash(sharedSecret.toString(), encryptedAmount.toString()));
  return { encryptedAmount, mac };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const privKey = process.env.DEPLOYER_PRIVKEY;
  if (!privKey) {
    console.error('ERROR: Set DEPLOYER_PRIVKEY environment variable');
    process.exit(1);
  }

  console.log('=== DarkPool 10K SAGE Deposit ===');
  console.log(`Network:  mainnet`);
  console.log(`Deployer: ${DEPLOYER_ADDRESS}`);
  console.log(`DarkPool: ${DARKPOOL_ADDRESS}`);
  console.log(`Amount:   10,000 SAGE`);
  console.log();

  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account(provider, DEPLOYER_ADDRESS, privKey);

  // Step 1: Generate ElGamal keypair for this deposit
  console.log('1. Generating ElGamal keypair...');
  const privacyKey = randomScalar();
  const publicKey = ecMul(privacyKey, GENERATOR_G);
  console.log(`   PK.x = 0x${publicKey.x.toString(16).slice(0, 16)}...`);

  // Step 2: Encrypt the deposit amount
  console.log('2. Encrypting deposit amount...');
  const encrypted = elgamalEncrypt(AMOUNT, publicKey);
  console.log('   ElGamal ciphertext generated');

  // Step 3: Create AE hint for O(1) decryption
  console.log('3. Creating AE hint...');
  const nonce = randomScalar();
  const sharedSecret = BigInt(hash.computePoseidonHash(
    privacyKey.toString(),
    nonce.toString()
  ));
  const { encryptedAmount, mac } = createAEHint(AMOUNT, sharedSecret);
  console.log('   AE hint generated');

  // Step 4: Build multicall (approve + deposit)
  console.log('4. Building transaction...');
  const amountLow = AMOUNT & ((1n << 128n) - 1n);
  const amountHigh = AMOUNT >> 128n;

  const calls = [
    {
      contractAddress: SAGE_TOKEN,
      entrypoint: 'approve',
      calldata: CallData.compile({
        spender: DARKPOOL_ADDRESS,
        amount: { low: amountLow.toString(), high: amountHigh.toString() },
      }),
    },
    {
      contractAddress: DARKPOOL_ADDRESS,
      entrypoint: 'deposit',
      calldata: CallData.compile({
        asset: SAGE_ASSET_ID,
        amount: { low: amountLow.toString(), high: amountHigh.toString() },
        encrypted_amount: {
          c1_x: encrypted.c1.x.toString(),
          c1_y: encrypted.c1.y.toString(),
          c2_x: encrypted.c2.x.toString(),
          c2_y: encrypted.c2.y.toString(),
        },
        ae_hint: {
          encrypted_amount: encryptedAmount.toString(),
          nonce: nonce.toString(),
          mac: mac.toString(),
        },
      }),
    },
  ];

  // Step 5: Execute
  console.log('5. Submitting transaction...');
  const result = await account.execute(calls);
  console.log(`   TX hash: ${result.transaction_hash}`);

  console.log('6. Waiting for confirmation...');
  await provider.waitForTransaction(result.transaction_hash);
  console.log('   ✓ Confirmed!');

  // Save the privacy key for later use (decrypting balance)
  console.log();
  console.log('=== IMPORTANT: Save this privacy key ===');
  console.log(`Privacy key: 0x${privacyKey.toString(16)}`);
  console.log('You need this to decrypt your DarkPool balance.');
  console.log();
  console.log('Done.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
