import {
  Account,
  RpcProvider,
  ec,
  stark,
  hash,
  CallData,
  Contract,
  uint256,
  type Calldata,
} from 'starknet';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getConfig, getKeystoreDir, getStarknetRpcUrl } from './config.js';
import { logger } from '../utils/logger.js';

// Keystore encryption parameters
const KEYSTORE_VERSION = 1;
const SCRYPT_N = 262144;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const ALGORITHM = 'aes-256-ctr';

export interface Keystore {
  version: number;
  address: string;
  crypto: {
    cipher: string;
    ciphertext: string;
    cipherparams: { iv: string };
    kdf: string;
    kdfparams: {
      n: number;
      r: number;
      p: number;
      dklen: number;
      salt: string;
    };
    mac: string;
  };
}

export interface WalletInfo {
  address: string;
  publicKey: string;
}

let cachedProvider: RpcProvider | null = null;

export function getProvider(): RpcProvider {
  if (!cachedProvider) {
    const rpcUrl = getStarknetRpcUrl();
    cachedProvider = new RpcProvider({ nodeUrl: rpcUrl });
  }
  return cachedProvider;
}

export function clearProviderCache(): void {
  cachedProvider = null;
}

export function generatePrivateKey(): string {
  return stark.randomAddress();
}

export function getPublicKey(privateKey: string): string {
  return ec.starkCurve.getStarkKey(privateKey);
}

export function computeAddress(publicKey: string): string {
  // Use OpenZeppelin account class hash for account address derivation
  const OZ_ACCOUNT_CLASS_HASH =
    '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f';

  const constructorCalldata = CallData.compile({ publicKey });

  return hash.calculateContractAddressFromHash(
    publicKey, // salt
    OZ_ACCOUNT_CLASS_HASH,
    constructorCalldata,
    0
  );
}

export function createWallet(): WalletInfo {
  const privateKey = generatePrivateKey();
  const publicKey = getPublicKey(privateKey);
  const address = computeAddress(publicKey);

  return { address, publicKey };
}

export async function createAndSaveWallet(password: string): Promise<{
  address: string;
  keystorePath: string;
}> {
  const privateKey = generatePrivateKey();
  const publicKey = getPublicKey(privateKey);
  const address = computeAddress(publicKey);

  const keystoreDir = getKeystoreDir();
  const keystorePath = join(keystoreDir, `${address.slice(0, 10)}.json`);

  const keystore = encryptKeystore(privateKey, address, password);
  writeFileSync(keystorePath, JSON.stringify(keystore, null, 2));

  return { address, keystorePath };
}

export function encryptKeystore(
  privateKey: string,
  address: string,
  password: string
): Keystore {
  const salt = randomBytes(32);
  const iv = randomBytes(16);

  const derivedKey = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(privateKey.replace('0x', ''), 'hex')),
    cipher.final(),
  ]);

  // Create MAC for verification
  const mac = hash.computeHashOnElements([
    derivedKey.toString('hex'),
    ciphertext.toString('hex'),
  ]);

  return {
    version: KEYSTORE_VERSION,
    address,
    crypto: {
      cipher: ALGORITHM,
      ciphertext: ciphertext.toString('hex'),
      cipherparams: { iv: iv.toString('hex') },
      kdf: 'scrypt',
      kdfparams: {
        n: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        dklen: KEY_LENGTH,
        salt: salt.toString('hex'),
      },
      mac,
    },
  };
}

export function decryptKeystore(keystore: Keystore, password: string): string {
  const { crypto } = keystore;

  const salt = Buffer.from(crypto.kdfparams.salt, 'hex');
  const iv = Buffer.from(crypto.cipherparams.iv, 'hex');
  const ciphertext = Buffer.from(crypto.ciphertext, 'hex');

  const derivedKey = scryptSync(password, salt, crypto.kdfparams.dklen, {
    N: crypto.kdfparams.n,
    r: crypto.kdfparams.r,
    p: crypto.kdfparams.p,
  });

  // Verify MAC
  const expectedMac = hash.computeHashOnElements([
    derivedKey.toString('hex'),
    crypto.ciphertext,
  ]);

  if (expectedMac !== crypto.mac) {
    throw new Error('Invalid password or corrupted keystore');
  }

  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
  const privateKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return '0x' + privateKey.toString('hex');
}

export function loadKeystore(path: string): Keystore {
  if (!existsSync(path)) {
    throw new Error(`Keystore not found: ${path}`);
  }
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as Keystore;
}

export function getAccount(privateKey: string, address?: string): Account {
  const provider = getProvider();
  const pubKey = getPublicKey(privateKey);
  const accountAddress = address || computeAddress(pubKey);

  return new Account(provider, accountAddress, privateKey);
}

export async function getAccountFromKeystore(
  keystorePath: string,
  password: string
): Promise<Account> {
  const keystore = loadKeystore(keystorePath);
  const privateKey = decryptKeystore(keystore, password);
  return getAccount(privateKey, keystore.address);
}

export async function getBalance(address: string, tokenAddress: string): Promise<bigint> {
  const provider = getProvider();

  const contract = new Contract(
    [
      {
        name: 'balanceOf',
        type: 'function',
        inputs: [{ name: 'account', type: 'felt' }],
        outputs: [{ name: 'balance', type: 'Uint256' }],
        state_mutability: 'view',
      },
    ],
    tokenAddress,
    provider
  );

  try {
    const result = await contract.balanceOf(address);
    return uint256.uint256ToBN(result.balance);
  } catch {
    return 0n;
  }
}

export async function waitForTransaction(
  txHash: string,
  options?: { retries?: number; interval?: number }
): Promise<boolean> {
  const provider = getProvider();
  const retries = options?.retries || 60;
  const interval = options?.interval || 2000;

  for (let i = 0; i < retries; i++) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt.execution_status === 'SUCCEEDED') {
        return true;
      }
      if (receipt.execution_status === 'REVERTED') {
        logger.error(`Transaction reverted: ${receipt.revert_reason || 'Unknown reason'}`);
        return false;
      }
    } catch {
      // Transaction not yet in a block, wait and retry
    }
    await new Promise(r => setTimeout(r, interval));
  }

  throw new Error(`Transaction ${txHash} not confirmed after ${retries} attempts`);
}

export function formatSage(amount: bigint): string {
  // SAGE has 18 decimals
  const decimals = 18n;
  const divisor = 10n ** decimals;
  const whole = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionStr = fraction.toString().padStart(Number(decimals), '0');
  const trimmed = fractionStr.replace(/0+$/, '');
  return `${whole}.${trimmed}`;
}

export function parseSage(amount: string): bigint {
  const decimals = 18;
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFraction);
}
