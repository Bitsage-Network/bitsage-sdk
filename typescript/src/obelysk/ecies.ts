/**
 * ECIES Encryption for VM31 Relayer
 *
 * X25519 ECDH + HKDF-SHA256 + AES-256-GCM
 * Compatible with the Obelysk VM31 relayer (Rust: x25519-dalek + aes-gcm + hkdf)
 *
 * Uses Web Crypto API (works in Node 20+ and all modern browsers).
 */

const HKDF_INFO = 'obelysk-ecies-v1';
const ECIES_VERSION = 1;

export interface ECIESEnvelope {
  ephemeral_pubkey: string; // hex, 64 chars (32 bytes)
  ciphertext: string;       // base64
  nonce: string;            // hex, 24 chars (12 bytes)
  version: number;          // always 1
}

/**
 * Encrypt a JSON payload for the VM31 relayer using ECIES.
 *
 * @param payload - The SubmitRequest object to encrypt
 * @param relayerPubkeyHex - The relayer's X25519 public key (hex, 64 chars)
 * @returns ECIES envelope ready to POST to /submit
 */
export async function eciesEncrypt(
  payload: unknown,
  relayerPubkeyHex: string,
): Promise<ECIESEnvelope> {
  const subtle = getCrypto();

  // 1. Parse relayer's static X25519 public key
  const relayerPubkeyBytes = hexToBytes(relayerPubkeyHex);
  if (relayerPubkeyBytes.length !== 32) {
    throw new Error(`Invalid relayer public key length: ${relayerPubkeyBytes.length} (expected 32)`);
  }

  const relayerPubkey = await subtle.importKey(
    'raw',
    relayerPubkeyBytes.buffer as ArrayBuffer,
    { name: 'X25519' },
    false,
    [],
  );

  // 2. Generate ephemeral X25519 keypair
  const ephemeralKeyPair = await subtle.generateKey(
    { name: 'X25519' } as any,
    true,
    ['deriveBits'],
  ) as CryptoKeyPair;

  // 3. ECDH shared secret (256 bits)
  const sharedBits = await subtle.deriveBits(
    { name: 'X25519', public: relayerPubkey } as any,
    ephemeralKeyPair.privateKey,
    256,
  );

  // 4. Import shared secret as HKDF key material
  const sharedKey = await subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );

  // 5. HKDF-SHA256 → AES-256-GCM key (no salt, info = "obelysk-ecies-v1")
  const aesKey = await subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new ArrayBuffer(0),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    sharedKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  // 6. Random 12-byte nonce
  const nonce = getRandomBytes(12);

  // 7. AES-256-GCM encrypt
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource },
    aesKey,
    plaintext,
  );

  // 8. Export ephemeral public key
  const ephPubRaw = await subtle.exportKey('raw', ephemeralKeyPair.publicKey);

  return {
    ephemeral_pubkey: bytesToHex(new Uint8Array(ephPubRaw)),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    nonce: bytesToHex(nonce),
    version: ECIES_VERSION,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function getCrypto(): SubtleCrypto {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    return globalThis.crypto.subtle;
  }
  // Node.js fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { webcrypto } = require('crypto');
    return webcrypto.subtle;
  } catch {
    throw new Error('ECIES requires Web Crypto API (Node 20+ or a modern browser)');
  }
}

function getRandomBytes(n: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues !== 'undefined') {
    return globalThis.crypto.getRandomValues(new Uint8Array(n));
  }
  const { randomBytes } = require('crypto');
  return new Uint8Array(randomBytes(n));
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    return btoa(String.fromCharCode(...bytes));
  }
  // Node.js fallback
  return Buffer.from(bytes).toString('base64');
}
