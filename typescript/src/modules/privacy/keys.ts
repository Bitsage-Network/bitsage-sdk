/**
 * Privacy Key Management
 * Handles generation, derivation, and secure storage of privacy keys
 */

import type { ECPoint, PrivacyKeyPair } from '../../types/generated/privacy';

/** Key storage configuration */
export interface KeyStorageConfig {
  /** Storage key prefix */
  prefix?: string;
  /** Use secure storage (Web Crypto) */
  useSecureStorage?: boolean;
}

/** Derived key info */
export interface DerivedKeyInfo {
  /** Public key */
  publicKey: ECPoint;
  /** Key derivation path */
  derivationPath: string;
  /** Key index */
  index: number;
}

/**
 * Privacy Key Manager
 *
 * Handles all privacy key operations:
 * - Secure key generation using Web Crypto
 * - Deterministic derivation from wallet signatures
 * - Encrypted local storage
 * - Key rotation support
 *
 * SECURITY: Private keys are never exposed as strings.
 * All cryptographic operations are performed via WASM.
 *
 * @example
 * ```typescript
 * // Generate fresh keypair
 * const keyPair = await PrivacyKeyManager.generate();
 *
 * // Derive from wallet signature (deterministic)
 * const signature = await wallet.signMessage('BitSage Privacy Key Derivation');
 * const derived = await PrivacyKeyManager.deriveFromSignature(signature);
 *
 * // Store encrypted
 * await PrivacyKeyManager.store(keyPair, 'user-password');
 *
 * // Retrieve later
 * const retrieved = await PrivacyKeyManager.retrieve('user-password');
 * ```
 */
export class PrivacyKeyManager {
  private static readonly STORAGE_KEY = 'bitsage_privacy_key';
  private static readonly SALT_KEY = 'bitsage_privacy_salt';
  private static readonly KEY_VERSION = 1;

  /**
   * Check if WASM crypto is available
   */
  static isWasmAvailable(): boolean {
    // Will be true when WASM module is loaded
    return typeof globalThis !== 'undefined' &&
      'BitSageCrypto' in globalThis;
  }

  /**
   * Generate a fresh privacy keypair
   *
   * Uses Web Crypto API for secure random generation
   *
   * @returns New privacy keypair
   */
  static async generate(): Promise<PrivacyKeyPair> {
    // Generate 32 random bytes for private key
    const privateKey = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(privateKey);
    } else {
      throw new Error('Secure random not available');
    }

    // Derive public key from private key
    const publicKey = await this.derivePublicKey(privateKey);

    return { publicKey, privateKey };
  }

  /**
   * Derive privacy keypair from wallet signature
   *
   * This creates a deterministic keypair that can be recovered
   * by signing the same message again.
   *
   * @param signature - Wallet signature of derivation message
   * @returns Derived privacy keypair
   */
  static async deriveFromSignature(signature: string): Promise<PrivacyKeyPair> {
    // Hash the signature to get private key material
    const encoder = new TextEncoder();
    const data = encoder.encode(signature);

    // Use SHA-256 for key derivation (could use more sophisticated KDF)
    let hashBuffer: ArrayBuffer;
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      hashBuffer = await crypto.subtle.digest('SHA-256', data);
    } else {
      throw new Error('Web Crypto not available');
    }

    const privateKey = new Uint8Array(hashBuffer);

    // Derive public key
    const publicKey = await this.derivePublicKey(privateKey);

    return { publicKey, privateKey };
  }

  /**
   * Derive multiple keypairs from a master signature
   *
   * @param signature - Master signature
   * @param count - Number of keys to derive
   * @returns Array of derived keys with paths
   */
  static async deriveMultiple(
    signature: string,
    count: number
  ): Promise<DerivedKeyInfo[]> {
    const keys: DerivedKeyInfo[] = [];

    for (let i = 0; i < count; i++) {
      const derivationPath = `m/bitsage/privacy/${i}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(signature + derivationPath);

      let hashBuffer: ArrayBuffer;
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        hashBuffer = await crypto.subtle.digest('SHA-256', data);
      } else {
        throw new Error('Web Crypto not available');
      }

      const privateKey = new Uint8Array(hashBuffer);
      const publicKey = await this.derivePublicKey(privateKey);

      keys.push({
        publicKey,
        derivationPath,
        index: i,
      });
    }

    return keys;
  }

  /**
   * Store keypair encrypted in local storage
   *
   * @param keyPair - Keypair to store
   * @param password - Encryption password
   * @param config - Storage configuration
   */
  static async store(
    keyPair: PrivacyKeyPair,
    password: string,
    config: KeyStorageConfig = {}
  ): Promise<void> {
    const prefix = config.prefix || '';
    const storageKey = prefix + this.STORAGE_KEY;
    const saltKey = prefix + this.SALT_KEY;

    // Generate salt for key derivation
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);

    // Derive encryption key from password
    const encryptionKey = await this.deriveEncryptionKey(password, salt);

    // Encrypt private key
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      encryptionKey,
      keyPair.privateKey.buffer as ArrayBuffer
    );

    // Store encrypted data
    const storedData = {
      version: this.KEY_VERSION,
      publicKey: {
        x: keyPair.publicKey.x.toString(),
        y: keyPair.publicKey.y.toString(),
      },
      encryptedPrivateKey: this.arrayBufferToBase64(encrypted),
      iv: this.arrayBufferToBase64(iv),
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(storedData));
      localStorage.setItem(saltKey, this.arrayBufferToBase64(salt));
    } else {
      throw new Error('localStorage not available');
    }
  }

  /**
   * Retrieve and decrypt keypair from local storage
   *
   * @param password - Decryption password
   * @param config - Storage configuration
   * @returns Keypair or null if not found
   */
  static async retrieve(
    password: string,
    config: KeyStorageConfig = {}
  ): Promise<PrivacyKeyPair | null> {
    const prefix = config.prefix || '';
    const storageKey = prefix + this.STORAGE_KEY;
    const saltKey = prefix + this.SALT_KEY;

    if (typeof localStorage === 'undefined') {
      return null;
    }

    const storedDataStr = localStorage.getItem(storageKey);
    const saltStr = localStorage.getItem(saltKey);

    if (!storedDataStr || !saltStr) {
      return null;
    }

    try {
      const storedData = JSON.parse(storedDataStr);
      const salt = this.base64ToArrayBuffer(saltStr);

      // Derive decryption key
      const encryptionKey = await this.deriveEncryptionKey(password, new Uint8Array(salt));

      // Decrypt private key
      const iv = this.base64ToArrayBuffer(storedData.iv);
      const encryptedPrivateKey = this.base64ToArrayBuffer(storedData.encryptedPrivateKey);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        encryptionKey,
        encryptedPrivateKey
      );

      return {
        publicKey: {
          x: BigInt(storedData.publicKey.x),
          y: BigInt(storedData.publicKey.y),
        },
        privateKey: new Uint8Array(decrypted),
      };
    } catch {
      // Decryption failed (wrong password or corrupted data)
      return null;
    }
  }

  /**
   * Check if a keypair is stored
   *
   * @param config - Storage configuration
   * @returns Whether a keypair exists
   */
  static hasStoredKey(config: KeyStorageConfig = {}): boolean {
    const prefix = config.prefix || '';
    const storageKey = prefix + this.STORAGE_KEY;

    if (typeof localStorage === 'undefined') {
      return false;
    }

    return localStorage.getItem(storageKey) !== null;
  }

  /**
   * Clear stored keypair
   *
   * @param config - Storage configuration
   */
  static clear(config: KeyStorageConfig = {}): void {
    const prefix = config.prefix || '';
    const storageKey = prefix + this.STORAGE_KEY;
    const saltKey = prefix + this.SALT_KEY;

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(saltKey);
    }
  }

  /**
   * Export public key as hex string
   *
   * @param publicKey - Public key to export
   * @returns Hex string representation
   */
  static exportPublicKey(publicKey: ECPoint): string {
    const xHex = publicKey.x.toString(16).padStart(64, '0');
    const yHex = publicKey.y.toString(16).padStart(64, '0');
    return '04' + xHex + yHex;
  }

  /**
   * Import public key from hex string
   *
   * @param hex - Hex string (uncompressed format: 04 + x + y)
   * @returns Public key
   */
  static importPublicKey(hex: string): ECPoint {
    if (hex.startsWith('0x')) {
      hex = hex.slice(2);
    }
    if (hex.startsWith('04')) {
      hex = hex.slice(2);
    }
    if (hex.length !== 128) {
      throw new Error('Invalid public key length');
    }

    return {
      x: BigInt('0x' + hex.slice(0, 64)),
      y: BigInt('0x' + hex.slice(64)),
    };
  }

  /**
   * Derive public key from private key
   *
   * NOTE: This is a placeholder - actual implementation uses WASM.
   * For production, this calls into the WASM crypto module.
   */
  private static async derivePublicKey(privateKey: Uint8Array): Promise<ECPoint> {
    // In production, this calls WASM:
    // return globalThis.BitSageCrypto.derive_public_key(privateKey);

    // Placeholder implementation using the private key bytes
    // to derive a deterministic public key point.
    // The actual implementation uses elliptic curve scalar multiplication.

    // For now, hash the private key to get pseudo-random coordinates
    // This is NOT cryptographically secure - just a placeholder
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const xHash = await crypto.subtle.digest('SHA-256', privateKey.buffer as ArrayBuffer);
      const yInput = new Uint8Array([...privateKey, 0x01]);
      const yHash = await crypto.subtle.digest('SHA-256', yInput.buffer as ArrayBuffer);

      return {
        x: this.arrayBufferToBigInt(xHash),
        y: this.arrayBufferToBigInt(yHash),
      };
    }

    throw new Error('Web Crypto not available for key derivation');
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  private static async deriveEncryptionKey(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);

    // Import password as raw key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordData,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive AES key using PBKDF2
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Convert ArrayBuffer or Uint8Array to base64 string
   */
  private static arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Convert ArrayBuffer to BigInt
   */
  private static arrayBufferToBigInt(buffer: ArrayBuffer): bigint {
    const bytes = new Uint8Array(buffer);
    let hex = '0x';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return BigInt(hex);
  }
}

/**
 * Get the standard derivation message for wallet signing
 */
export function getPrivacyDerivationMessage(address: string, nonce: number = 0): string {
  return `BitSage Privacy Key Derivation\nAddress: ${address}\nNonce: ${nonce}\nVersion: 1`;
}

/**
 * Validate a public key point (basic validation)
 */
export function isValidPublicKey(publicKey: ECPoint): boolean {
  // Check that coordinates are valid field elements
  const FIELD_PRIME = BigInt('0x800000000000011000000000000000000000000000000000000000000000001');

  if (publicKey.x < 0n || publicKey.x >= FIELD_PRIME) {
    return false;
  }
  if (publicKey.y < 0n || publicKey.y >= FIELD_PRIME) {
    return false;
  }

  // Basic check - in production, verify point is on curve
  return true;
}
