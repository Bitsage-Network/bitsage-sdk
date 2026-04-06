#!/usr/bin/env node
/**
 * Seed Mainnet Activity — Issue #8
 *
 * Creates initial on-chain activity across all Obelysk subsystems:
 *   1. ConfidentialTransfer: register + fund (small SAGE amount)
 *   2. PrivacyPool: deposit into SAGE pool (standard denomination)
 *   3. ProverStaking: stake 1000 SAGE
 *   4. StealthRegistry: register meta-address
 *
 * Usage:
 *   DEPLOYER_PRIVKEY=0x... node scripts/seed-mainnet-activity.mjs [--dry-run]
 *
 * Requires: Node 20+, starknet.js
 */

import { Account, RpcProvider, CallData, hash } from 'starknet';

// ── Config ──────────────────────────────────────────────────────────────────
const RPC_URL = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_7/GUBwFqKhSgn4mwVbN6Sbn';
const DEPLOYER_ADDRESS = '0x00740f4fc2020dccdbf65770c1bdba7f34a594214e9c9b50ec10f3e684c5cebd';

const CONTRACTS = {
  sage_token:              '0x0098d563900789f934e610b67482ae58793a2efc373ba3a45af94cdbf931c799',
  confidential_transfer:   '0x0673685bdb01fbf57c390ec2c0d893e7c77316cdea315b0fbfbc85b9a9a979d2',
  privacy_pool_sage:       '0x0224977344d123eb5c20fd088f15b62d0541f8282f4a23dd87bdf9839aac724f',
  prover_staking:          '0x07d2ecff4a4d7ca6c75df367d8dbc7cc12ea583f88813f7020832a7cf7f293e3',
  stealth_registry:        '0x077ee4c38201b4e45b643f4af56ff6daf780260e9c8a281f3536fb711afcaea8',
  dark_pool:               '0x0230b5822556f0d9afca7b02f01e37cb9cf2a7e8d590a9020e9bbca183ea7727',
};

// ── STARK curve constants ───────────────────────────────────────────────────
const FIELD_PRIME = 0x800000000000011000000000000000000000000000000000000000000000001n;
const CURVE_ORDER = 0x800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2fn;
const G = {
  x: 0x1ef15c18599971b7beced415a40f0c7deacfd9b0d1819e03d723d8bc943cfcan,
  y: 0x5668060aa49730b7be4801df46ec62de53ecd11abe43a32873000c36e8dc1f0n,
};
const H = {
  x: 0x73bd2c1b04d08e15c7a92d041c72cae8e6aa9fbcc95afd9b48ebe4efb4d8a20n,
  y: 0x1bd58b91aecc8b8a4bdb51a90b83d7d5a23aa1253ad62ff02d75f5463fc1c89n,
};

// ── EC Math ─────────────────────────────────────────────────────────────────
function mod(a, m) { const r = a % m; return r < 0n ? r + m : r; }
function invMod(a, m) {
  let [old_r, r] = [mod(a, m), m], [old_s, s] = [1n, 0n];
  while (r !== 0n) { const q = old_r / r; [old_r, r] = [r, old_r - q * r]; [old_s, s] = [s, old_s - q * s]; }
  return mod(old_s, m);
}
function ecAdd(p1, p2) {
  if (!p1) return p2; if (!p2) return p1;
  if (p1.x === p2.x && p1.y === p2.y) {
    const lam = mod((3n * p1.x * p1.x + 1n) * invMod(2n * p1.y, FIELD_PRIME), FIELD_PRIME);
    const x3 = mod(lam * lam - 2n * p1.x, FIELD_PRIME);
    return { x: x3, y: mod(lam * (p1.x - x3) - p1.y, FIELD_PRIME) };
  }
  if (p1.x === p2.x) return null;
  const lam = mod((p2.y - p1.y) * invMod(p2.x - p1.x, FIELD_PRIME), FIELD_PRIME);
  const x3 = mod(lam * lam - p1.x - p2.x, FIELD_PRIME);
  return { x: x3, y: mod(lam * (p1.x - x3) - p1.y, FIELD_PRIME) };
}
function ecMul(k, p) {
  k = mod(k, CURVE_ORDER); let result = null, addend = p;
  while (k > 0n) { if (k & 1n) result = ecAdd(result, addend); addend = ecAdd(addend, addend); k >>= 1n; }
  return result;
}
function randomScalar() {
  const bytes = new Uint8Array(32); globalThis.crypto.getRandomValues(bytes);
  let val = 0n; for (const b of bytes) val = (val << 8n) | BigInt(b);
  return (val % (CURVE_ORDER - 2n)) + 1n;
}
function elgamalEncrypt(amount, publicKey) {
  const r = randomScalar();
  return { c1: ecMul(r, G), c2: ecAdd(ecMul(amount, H), ecMul(r, publicKey)), randomness: r };
}
function createSchnorrProof(r, c1) {
  const k = randomScalar();
  const commitment = ecMul(k, G);
  const challenge = BigInt(hash.computePoseidonHashOnElements([
    commitment.x.toString(), commitment.y.toString(), c1.x.toString(), c1.y.toString(),
  ]));
  return { commitment, challenge, response: mod(k - challenge * r, CURVE_ORDER) };
}
function createAEHint(amount, sharedSecret) {
  const encryptedAmount = mod(amount + sharedSecret, FIELD_PRIME);
  const mac = BigInt(hash.computePoseidonHash(sharedSecret.toString(), encryptedAmount.toString()));
  return { encryptedAmount, mac };
}

const DRY_RUN = process.argv.includes('--dry-run');
const u256 = (v) => ({ low: (v & ((1n << 128n) - 1n)).toString(), high: (v >> 128n).toString() });

// ── Steps ───────────────────────────────────────────────────────────────────

async function step1_confidentialTransferRegisterAndFund(account) {
  console.log('\n── Step 1: ConfidentialTransfer — Register + Fund ──');
  const privKey = randomScalar();
  const pubKey = ecMul(privKey, G);
  console.log(`  Privacy PK.x = 0x${pubKey.x.toString(16).slice(0, 16)}...`);

  const amount = 100n * 10n ** 18n; // 100 SAGE
  const encrypted = elgamalEncrypt(amount, pubKey);
  const proof = createSchnorrProof(encrypted.randomness, encrypted.c1);

  const nonce = randomScalar();
  const sharedSecret = BigInt(hash.computePoseidonHash(privKey.toString(), nonce.toString()));
  const { encryptedAmount, mac } = createAEHint(amount, sharedSecret);

  const calls = [
    // Register public key
    {
      contractAddress: CONTRACTS.confidential_transfer,
      entrypoint: 'register',
      calldata: [pubKey.x.toString(), pubKey.y.toString()],
    },
    // Approve SAGE
    {
      contractAddress: CONTRACTS.sage_token,
      entrypoint: 'approve',
      calldata: CallData.compile({ spender: CONTRACTS.confidential_transfer, amount: u256(amount) }),
    },
    // Fund CT account
    {
      contractAddress: CONTRACTS.confidential_transfer,
      entrypoint: 'fund',
      calldata: [
        amount.toString(),
        encrypted.c1.x.toString(), encrypted.c1.y.toString(),
        encrypted.c2.x.toString(), encrypted.c2.y.toString(),
        proof.commitment.x.toString(), proof.commitment.y.toString(),
        proof.challenge.toString(), proof.response.toString(),
        encryptedAmount.toString(), nonce.toString(), mac.toString(),
      ],
    },
  ];

  if (DRY_RUN) { console.log(`  [DRY RUN] Would submit ${calls.length} calls`); return privKey; }
  const result = await account.execute(calls);
  console.log(`  TX: ${result.transaction_hash}`);
  await account.getTransactionReceipt(result.transaction_hash).catch(() => {});
  return privKey;
}

async function step2_privacyPoolDeposit(account) {
  console.log('\n── Step 2: Privacy Pool SAGE — Deposit 1000 SAGE ──');
  const amount = 1_000n * 10n ** 18n; // Standard denomination
  const privKey = randomScalar();
  const pubKey = ecMul(privKey, G);

  const encrypted = elgamalEncrypt(amount, pubKey);
  const proof = createSchnorrProof(encrypted.randomness, encrypted.c1);

  const nonce = randomScalar();
  const sharedSecret = BigInt(hash.computePoseidonHash(privKey.toString(), nonce.toString()));
  const { encryptedAmount, mac } = createAEHint(amount, sharedSecret);

  // Pedersen commitment for the pool
  const blinding = randomScalar();
  const commitment = ecAdd(ecMul(amount, G), ecMul(blinding, H));

  const calls = [
    {
      contractAddress: CONTRACTS.sage_token,
      entrypoint: 'approve',
      calldata: CallData.compile({ spender: CONTRACTS.privacy_pool_sage, amount: u256(amount) }),
    },
    {
      contractAddress: CONTRACTS.privacy_pool_sage,
      entrypoint: 'deposit',
      calldata: [
        amount.toString(),
        encrypted.c1.x.toString(), encrypted.c1.y.toString(),
        encrypted.c2.x.toString(), encrypted.c2.y.toString(),
        proof.commitment.x.toString(), proof.commitment.y.toString(),
        proof.challenge.toString(), proof.response.toString(),
        encryptedAmount.toString(), nonce.toString(), mac.toString(),
        commitment.x.toString(), commitment.y.toString(),
        blinding.toString(),
      ],
    },
  ];

  if (DRY_RUN) { console.log(`  [DRY RUN] Would submit ${calls.length} calls`); return; }
  const result = await account.execute(calls);
  console.log(`  TX: ${result.transaction_hash}`);
}

async function step3_proverStake(account) {
  console.log('\n── Step 3: ProverStaking — Stake 1000 SAGE ──');
  const amount = 1_000n * 10n ** 18n;

  const calls = [
    {
      contractAddress: CONTRACTS.sage_token,
      entrypoint: 'approve',
      calldata: CallData.compile({ spender: CONTRACTS.prover_staking, amount: u256(amount) }),
    },
    {
      contractAddress: CONTRACTS.prover_staking,
      entrypoint: 'stake',
      calldata: CallData.compile({ amount: u256(amount) }),
    },
  ];

  if (DRY_RUN) { console.log(`  [DRY RUN] Would submit ${calls.length} calls`); return; }
  const result = await account.execute(calls);
  console.log(`  TX: ${result.transaction_hash}`);
}

async function step4_stealthRegister(account) {
  console.log('\n── Step 4: Stealth Registry — Register Meta-Address ──');
  const spendKey = randomScalar();
  const viewKey = randomScalar();
  const spendPub = ecMul(spendKey, G);
  const viewPub = ecMul(viewKey, G);

  const calls = [
    {
      contractAddress: CONTRACTS.stealth_registry,
      entrypoint: 'register_meta_address',
      calldata: [
        spendPub.x.toString(), spendPub.y.toString(),
        viewPub.x.toString(), viewPub.y.toString(),
      ],
    },
  ];

  if (DRY_RUN) { console.log(`  [DRY RUN] Would submit 1 call`); return; }
  const result = await account.execute(calls);
  console.log(`  TX: ${result.transaction_hash}`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const privKey = process.env.DEPLOYER_PRIVKEY;
  if (!privKey) { console.error('ERROR: Set DEPLOYER_PRIVKEY'); process.exit(1); }

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       Obelysk Mainnet — Seed Activity           ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Deployer: ${DEPLOYER_ADDRESS}`);
  if (DRY_RUN) console.log('MODE: DRY RUN (no transactions will be sent)');

  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account(provider, DEPLOYER_ADDRESS, privKey);

  // Run steps sequentially (each depends on SAGE balance)
  await step1_confidentialTransferRegisterAndFund(account);
  await step2_privacyPoolDeposit(account);
  await step3_proverStake(account);
  await step4_stealthRegister(account);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('All seed activity complete!');
  console.log('Total SAGE used: ~2,100 SAGE');
  console.log('  - 100 SAGE → ConfidentialTransfer');
  console.log('  - 1,000 SAGE → Privacy Pool');
  console.log('  - 1,000 SAGE → ProverStaking');
  console.log('  - 0 SAGE → Stealth Registry (no deposit needed)');
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
