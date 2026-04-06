#!/usr/bin/env node
/**
 * Test Obelysk SDK against real mainnet contracts
 */

// Import from built SDK
import {
  ObelyskClient,
  ObelyskPrivacy,
  parseAmount,
  formatAmount,
  MAINNET_TOKENS,
  MAINNET_PRIVACY_POOLS,
  VM31VaultClient,
  VM31BridgeClient,
  OTCOrderbookClient,
  OrderSide,
  eciesEncrypt,
  validateDenomination,
  splitIntoDenominations,
  getDenominations,
  WBTC_DENOMINATIONS,
  ETH_DENOMINATIONS,
  USDC_DENOMINATIONS,
} from '/Users/vaamx/bitsage-network/sdk/typescript/dist/obelysk/index.mjs';

import { RpcProvider } from 'starknet';

const RPC = 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_7/GUBwFqKhSgn4mwVbN6Sbn';

console.log('=== Obelysk SDK Test Suite (Mainnet Read-Only) ===\n');

// ---- Test 1: Token/Amount utilities ----
console.log('--- Test 1: Amount parsing ---');
const sageAmount = parseAmount('1000.5', 'sage');
console.log(`parseAmount('1000.5', 'sage') = ${sageAmount}`);
console.log(`formatAmount(${sageAmount}, 'sage') = ${formatAmount(sageAmount, 'sage')}`);
const usdcAmount = parseAmount('100.25', 'usdc');
console.log(`parseAmount('100.25', 'usdc') = ${usdcAmount}`);
console.log(`formatAmount(${usdcAmount}, 'usdc') = ${formatAmount(usdcAmount, 'usdc')}`);
console.log('✅ Amount utilities work\n');

// ---- Test 2: ElGamal crypto ----
console.log('--- Test 2: ElGamal encryption/decryption ---');
const privacy = new ObelyskPrivacy();
const keyPair = privacy.generateKeyPair();
console.log(`Generated key pair: pk.x = 0x${keyPair.publicKey.x.toString(16).slice(0, 16)}...`);

const amount = 42069n;
const encrypted = privacy.encrypt(amount, keyPair.publicKey);
console.log(`Encrypted ${amount}: c1.x = 0x${encrypted.c1.x.toString(16).slice(0, 16)}...`);

const decrypted = privacy.decrypt(encrypted, keyPair.privateKey, 100000n);
console.log(`Decrypted: ${decrypted}`);
if (decrypted === amount) {
  console.log('✅ ElGamal encrypt/decrypt correct\n');
} else {
  console.log('❌ ElGamal decrypt FAILED\n');
  process.exit(1);
}

// ---- Test 3: Homomorphic addition ----
console.log('--- Test 3: Homomorphic addition ---');
const enc1 = privacy.encrypt(100n, keyPair.publicKey);
const enc2 = privacy.encrypt(200n, keyPair.publicKey);
const encSum = privacy.homomorphicAdd(enc1, enc2);
const decSum = privacy.decrypt(encSum, keyPair.privateKey, 1000n);
console.log(`100 + 200 (encrypted) = ${decSum}`);
if (decSum === 300n) {
  console.log('✅ Homomorphic addition correct\n');
} else {
  console.log('❌ Homomorphic addition FAILED\n');
}

// ---- Test 4: ObelyskClient initialization ----
console.log('--- Test 4: ObelyskClient (mainnet, read-only) ---');
const client = new ObelyskClient({
  network: 'mainnet',
  rpcUrl: RPC,
});
console.log(`Network: ${client.network}`);
console.log(`SAGE token: ${client.getTokenAddress('sage')}`);
console.log(`ETH privacy pool: ${client.getPrivacyPoolAddress('eth')}`);
console.log('✅ Client initialized\n');

// ---- Test 5: Read real on-chain data ----
console.log('--- Test 5: Read mainnet privacy pool data ---');
try {
  const stats = await client.privacyPool.getPoolStats('eth');
  console.log(`ETH privacy pool deposits: ${stats.totalDeposits}, withdrawals: ${stats.totalWithdrawals}`);
  console.log(`Total deposited: ${stats.totalDeposited}, total withdrawn: ${stats.totalWithdrawn}`);

  const root = await client.privacyPool.getMerkleRoot('eth');
  console.log(`ETH privacy pool Merkle root: ${root}`);
  console.log('✅ On-chain reads work\n');
} catch (err) {
  console.log(`⚠️ On-chain read error (may be RPC issue): ${err.message}\n`);
}

// ---- Test 6: Read DarkPool epoch ----
console.log('--- Test 6: Read DarkPool epoch ---');
try {
  const epoch = await client.darkPool.getEpochInfo();
  console.log(`DarkPool epoch: ${epoch.epoch}, phase: ${epoch.phase}`);
  console.log('✅ DarkPool read works\n');
} catch (err) {
  console.log(`⚠️ DarkPool read error: ${err.message}\n`);
}

// ---- Test 7: Stealth registry lookup ----
console.log('--- Test 7: Stealth registry lookup ---');
try {
  const meta = await client.stealth.lookupRecipient(
    '0x00740f4fc2020dccdbf65770c1bdba7f34a594214e9c9b50ec10f3e684c5cebd'
  );
  console.log(`Stealth meta-address: ${meta ? 'registered' : 'not registered'}`);
  console.log('✅ Stealth lookup works\n');
} catch (err) {
  console.log(`⚠️ Stealth lookup error: ${err.message}\n`);
}

// ---- Test 8: SAGE balance check via provider ----
console.log('--- Test 8: Read SAGE balance ---');
try {
  const result = await client.provider.callContract({
    contractAddress: client.getTokenAddress('sage'),
    entrypoint: 'balanceOf',
    calldata: ['0x00740f4fc2020dccdbf65770c1bdba7f34a594214e9c9b50ec10f3e684c5cebd'],
  });
  const balance = BigInt(result[0]);
  console.log(`Deployer-v2 SAGE balance: ${formatAmount(balance, 'sage')} SAGE`);
  console.log('✅ Token balance read works\n');
} catch (err) {
  console.log(`⚠️ Balance read error: ${err.message}\n`);
}

// ---- Test 9: ProverStaking reads ----
console.log('--- Test 9: ProverStaking data ---');
try {
  const totalStaked = await client.staking.getTotalStaked();
  console.log(`Total SAGE staked: ${formatAmount(totalStaked, 'sage')} SAGE`);

  const totalSlashed = await client.staking.getTotalSlashed();
  console.log(`Total SAGE slashed: ${formatAmount(totalSlashed, 'sage')} SAGE`);

  const eligible = await client.staking.isEligible(
    '0x00740f4fc2020dccdbf65770c1bdba7f34a594214e9c9b50ec10f3e684c5cebd'
  );
  console.log(`Deployer-v2 eligible: ${eligible}`);
  console.log('✅ ProverStaking reads work\n');
} catch (err) {
  console.log(`⚠️ ProverStaking read error: ${err.message}\n`);
}

// ---- Test 10: Stealth new view methods ----
console.log('--- Test 10: Stealth registry stats ---');
try {
  const count = await client.stealth.getAnnouncementCount();
  console.log(`Stealth announcement count: ${count}`);

  const registered = await client.stealth.getRegisteredCount();
  console.log(`Registered stealth recipients: ${registered}`);

  const has = await client.stealth.hasMetaAddress(
    '0x00740f4fc2020dccdbf65770c1bdba7f34a594214e9c9b50ec10f3e684c5cebd'
  );
  console.log(`Deployer-v2 has stealth meta-address: ${has}`);
  console.log('✅ Stealth stats work\n');
} catch (err) {
  console.log(`⚠️ Stealth stats error: ${err.message}\n`);
}

// ---- Test 11: DarkPool view methods ----
console.log('--- Test 11: DarkPool views ---');
try {
  const orderCount = await client.darkPool.getOrderCount();
  console.log(`DarkPool total orders: ${orderCount}`);

  const pairs = await client.darkPool.getSupportedPairs();
  console.log(`DarkPool supported pairs: ${pairs.length}`);

  const feeInfo = await client.darkPool.getFeeInfo();
  console.log(`DarkPool fee: ${feeInfo ? feeInfo.feeBps + ' bps' : 'not yet active'}`);
  console.log('✅ DarkPool views work\n');
} catch (err) {
  console.log(`⚠️ DarkPool views error: ${err.message}\n`);
}

// ---- Test 12: Privacy pool fee + nullifier checks ----
console.log('--- Test 12: Privacy pool extended reads ---');
try {
  const feeInfo = await client.privacyPool.getFeeInfo('eth');
  console.log(`ETH pool fee: ${feeInfo.feeBps} bps, accumulated: ${feeInfo.accumulated}`);

  const nullUsed = await client.privacyPool.isNullifierUsed('eth', '0x1234');
  console.log(`Random nullifier used: ${nullUsed}`);
  console.log('✅ Privacy pool extended reads work\n');
} catch (err) {
  console.log(`⚠️ Privacy pool extended error: ${err.message}\n`);
}

// ---- Test 13: Privacy Router reads ----
console.log('--- Test 13: Privacy Router ---');
try {
  const epoch = await client.router.getCurrentEpoch();
  console.log(`Privacy Router epoch: ${epoch}`);

  const nullCount = await client.router.getNullifierCount();
  console.log(`Nullifier count: ${nullCount}`);

  const auditorCount = await client.router.getAuditorCount();
  console.log(`Auditor count: ${auditorCount}`);

  const threshold = await client.router.getAuditThreshold();
  console.log(`Audit threshold: ${threshold}`);

  const leanIMT = await client.router.isLeanIMTActive();
  console.log(`LeanIMT active: ${leanIMT}`);

  const ethSupported = await client.router.isAssetSupported(2);
  console.log(`Asset ID 2 (ETH) supported: ${ethSupported}`);
  console.log('✅ Privacy Router reads work\n');
} catch (err) {
  console.log(`⚠️ Privacy Router error: ${err.message}\n`);
}

// ---- Test 14: Shielded Swap reads ----
console.log('--- Test 14: Shielded Swap Router ---');
try {
  const swapCount = await client.swap.getSwapCount();
  console.log(`Shielded swap count: ${swapCount}`);

  const owner = await client.swap.getOwner();
  console.log(`Swap router owner: ${owner}`);

  const ekubo = await client.swap.getEkuboCore();
  console.log(`Ekubo core: ${ekubo}`);

  const ethPool = await client.swap.getPool(client.getTokenAddress('eth'));
  console.log(`ETH swap pool: ${ethPool ?? 'not registered'}`);

  const swapFee = await client.swap.getSwapFeeInfo();
  console.log(`Swap fee: ${swapFee ? swapFee.feeBps + ' bps' : 'not active'}`);
  console.log('✅ Shielded Swap reads work\n');
} catch (err) {
  console.log(`⚠️ Shielded Swap error: ${err.message}\n`);
}

// ---- Test 15: VM31 Vault on-chain reads ----
console.log('--- Test 15: VM31 Vault (on-chain) ---');
try {
  const root = await client.vm31.getMerkleRoot();
  console.log(`VM31 Merkle root: lo=${root.lo}, hi=${root.hi}`);

  const treeSize = await client.vm31.getTreeSize();
  console.log(`VM31 tree size: ${treeSize}`);

  const paused = await client.vm31.isPaused();
  console.log(`VM31 paused: ${paused}`);

  const relayer = await client.vm31.getRelayer();
  console.log(`VM31 relayer: ${relayer}`);

  const timeout = await client.vm31.getBatchTimeoutBlocks();
  console.log(`VM31 batch timeout: ${timeout} blocks`);

  // Test M31 encoding
  const encoded = VM31VaultClient.encodeAmountM31(5000000000n);
  const decoded = VM31VaultClient.decodeAmountM31(encoded.lo, encoded.hi);
  console.log(`M31 encode/decode: ${decoded} (expected 5000000000)`);
  if (decoded !== 5000000000n) throw new Error('M31 encode/decode mismatch');
  console.log('✅ VM31 Vault reads work\n');
} catch (err) {
  console.log(`⚠️ VM31 Vault error: ${err.message}\n`);
}

// ---- Test 16: VM31 Bridge reads ----
console.log('--- Test 16: VM31 Bridge ---');
try {
  const bridgeConfig = await client.bridge.getConfig();
  console.log(`Bridge relayer: ${bridgeConfig.relayer}`);
  console.log(`Bridge VM31 pool: ${bridgeConfig.vm31Pool}`);
  console.log(`Bridge CT: ${bridgeConfig.confidentialTransfer}`);

  const upgrade = await client.bridge.getPendingUpgrade();
  console.log(`Bridge pending upgrade: ${upgrade ? 'yes' : 'none'}`);

  const bridgePaused = await client.bridge.isPaused();
  console.log(`Bridge paused: ${bridgePaused}`);
  console.log('✅ VM31 Bridge reads work\n');
} catch (err) {
  console.log(`⚠️ VM31 Bridge error: ${err.message}\n`);
}

// ---- Test 17: OTC Orderbook reads ----
console.log('--- Test 17: OTC Orderbook ---');
try {
  const orderCount = await client.otc.getOrderCount();
  console.log(`OTC total orders: ${orderCount}`);

  const tradeCount = await client.otc.getTradeCount();
  console.log(`OTC total trades: ${tradeCount}`);

  const config = await client.otc.getConfig();
  console.log(`OTC maker fee: ${config.makerFeeBps} bps, taker fee: ${config.takerFeeBps} bps`);
  console.log(`OTC max orders/user: ${config.maxOrdersPerUser}, paused: ${config.paused}`);

  const owner = await client.otc.getOwner();
  console.log(`OTC owner: ${owner}`);
  console.log('✅ OTC Orderbook reads work\n');
} catch (err) {
  console.log(`⚠️ OTC Orderbook error: ${err.message}\n`);
}

// ---- Test 18: New ConfidentialTransfer reads ----
console.log('--- Test 18: ConfidentialTransfer extended ---');
try {
  const pubKey = await client.confidentialTransfer.getPublicKey(
    '0x00740f4fc2020dccdbf65770c1bdba7f34a594214e9c9b50ec10f3e684c5cebd'
  );
  console.log(`Deployer-v2 CT pubkey: ${pubKey ? 'registered' : 'not registered'}`);
  console.log('✅ ConfidentialTransfer extended reads work\n');
} catch (err) {
  console.log(`⚠️ ConfidentialTransfer extended error: ${err.message}\n`);
}

// ---- Test 19: New DarkPool reads ----
console.log('--- Test 19: DarkPool extended ---');
try {
  const traderPk = await client.darkPool.getTraderPubkey(
    '0x00740f4fc2020dccdbf65770c1bdba7f34a594214e9c9b50ec10f3e684c5cebd'
  );
  console.log(`Deployer-v2 DarkPool pubkey: ${traderPk ? 'registered' : 'not registered'}`);

  const epochResult = await client.darkPool.getEpochResult(1);
  console.log(`Epoch 1 result: ${epochResult ? (epochResult.settled ? 'settled' : 'not settled') : 'no data'}`);
  console.log('✅ DarkPool extended reads work\n');
} catch (err) {
  console.log(`⚠️ DarkPool extended error: ${err.message}\n`);
}

// ---- Test 20: Privacy Router extended reads ----
console.log('--- Test 20: Privacy Router extended ---');
try {
  const treeState = await client.router.getNullifierTreeState();
  console.log(`Nullifier tree root: ${treeState.root}, size: ${treeState.size}`);

  const hints = await client.router.getAccountHints(
    '0x00740f4fc2020dccdbf65770c1bdba7f34a594214e9c9b50ec10f3e684c5cebd'
  );
  console.log(`Account hints: ${hints ? `balance=${hints.balanceHint}` : 'none'}`);
  console.log('✅ Privacy Router extended reads work\n');
} catch (err) {
  console.log(`⚠️ Privacy Router extended error: ${err.message}\n`);
}

// ---- Test 21: Client structure verification ----
console.log('--- Test 21: Client sub-client verification ---');
const subClients = ['privacyPool', 'darkPool', 'stealth', 'confidentialTransfer', 'staking', 'router', 'swap', 'vm31', 'bridge', 'otc'];
const missing = subClients.filter(name => !client[name]);
if (missing.length === 0) {
  console.log(`All ${subClients.length} sub-clients initialized: ${subClients.join(', ')}`);
  console.log('✅ Client structure complete\n');
} else {
  console.log(`❌ Missing sub-clients: ${missing.join(', ')}\n`);
}

// ---- Test 22: Denomination validation ----
console.log('--- Test 22: Denomination validation ---');
try {
  // Valid denominations should not throw
  validateDenomination(100_000n, 0); // 0.001 BTC
  validateDenomination(1_000_000_000_000_000n, 2); // 0.001 ETH
  validateDenomination(100_000_000n, 4); // 100 USDC
  console.log('Valid denominations pass');

  // Invalid denomination should throw
  let threw = false;
  try {
    validateDenomination(123_456n, 0); // not a valid BTC denom
  } catch (e) {
    threw = true;
    console.log(`Invalid denom correctly rejected: ${e.message.slice(0, 60)}...`);
  }
  if (!threw) throw new Error('Should have thrown for invalid denomination');

  // Unknown asset should pass through
  validateDenomination(999n, 99);
  console.log('Unknown asset passes through');

  // By symbol
  validateDenomination(5_000_000n, 'wbtc'); // 0.05 BTC
  console.log('Symbol-based validation works');

  // Split into denominations
  const split = splitIntoDenominations(15_500_000n, 0); // 0.155 BTC
  console.log(`Split 15500000 sats: ${split.denominations.length} txns, remainder: ${split.remainder}`);
  const total = split.denominations.reduce((s, d) => s + d, 0n) + split.remainder;
  if (total !== 15_500_000n) throw new Error('Split sum mismatch');

  console.log(`wBTC denominations: ${WBTC_DENOMINATIONS.length} options`);
  console.log(`ETH denominations: ${ETH_DENOMINATIONS.length} options`);
  console.log(`USDC denominations: ${USDC_DENOMINATIONS.length} options`);
  console.log('✅ Denomination validation works\n');
} catch (err) {
  console.log(`❌ Denomination validation error: ${err.message}\n`);
  process.exit(1);
}

// ---- Test 23: ECIES encryption ----
console.log('--- Test 23: ECIES encryption ---');
try {
  // Generate a test X25519 keypair to use as "relayer public key"
  const { webcrypto } = await import('crypto');
  const subtle = webcrypto.subtle;
  const testKeyPair = await subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveBits'],
  );
  const pubRaw = await subtle.exportKey('raw', testKeyPair.publicKey);
  const pubHex = Array.from(new Uint8Array(pubRaw)).map(b => b.toString(16).padStart(2, '0')).join('');

  const testPayload = { type: 'deposit', amount: 100000, asset_id: 0 };
  const envelope = await eciesEncrypt(testPayload, pubHex);

  console.log(`Envelope version: ${envelope.version}`);
  console.log(`Ephemeral pubkey: ${envelope.ephemeral_pubkey.slice(0, 16)}... (${envelope.ephemeral_pubkey.length} chars)`);
  console.log(`Ciphertext: ${envelope.ciphertext.slice(0, 24)}... (${envelope.ciphertext.length} chars)`);
  console.log(`Nonce: ${envelope.nonce} (${envelope.nonce.length} chars)`);

  if (envelope.ephemeral_pubkey.length !== 64) throw new Error('Bad ephemeral pubkey length');
  if (envelope.nonce.length !== 24) throw new Error('Bad nonce length');
  if (envelope.version !== 1) throw new Error('Bad version');
  if (envelope.ciphertext.length < 20) throw new Error('Ciphertext too short');

  // Verify we can decrypt with the test private key (full round-trip)
  const ephPubBytes = new Uint8Array(envelope.ephemeral_pubkey.match(/.{2}/g).map(h => parseInt(h, 16)));
  const ephPubKey = await subtle.importKey('raw', ephPubBytes.buffer, { name: 'X25519' }, false, []);
  const sharedBits = await subtle.deriveBits(
    { name: 'X25519', public: ephPubKey },
    testKeyPair.privateKey,
    256,
  );
  const sharedKey = await subtle.importKey('raw', sharedBits, { name: 'HKDF' }, false, ['deriveKey']);
  const aesKey = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new ArrayBuffer(0), info: new TextEncoder().encode('obelysk-ecies-v1') },
    sharedKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const nonceBytes = new Uint8Array(envelope.nonce.match(/.{2}/g).map(h => parseInt(h, 16)));
  const ciphertextBytes = Buffer.from(envelope.ciphertext, 'base64');
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: nonceBytes },
    aesKey,
    ciphertextBytes,
  );
  const plaintext = new TextDecoder().decode(decrypted);
  const parsed = JSON.parse(plaintext);
  if (parsed.type !== 'deposit' || parsed.amount !== 100000) throw new Error('Decrypted payload mismatch');
  console.log(`Round-trip decrypt: ${plaintext}`);
  console.log('✅ ECIES encryption works (full round-trip verified)\n');
} catch (err) {
  console.log(`❌ ECIES error: ${err.message}\n`);
  process.exit(1);
}

console.log('=== All 23 tests complete ===');
