/**
 * Privacy Encryption Helpers
 * ElGamal encryption, decryption, and homomorphic operations
 */

import type {
  ECPoint,
  ElGamalCiphertext,
  EncryptedBalance,
  SchnorrProof,
  RangeProof,
  TransferProof,
  AEHint,
} from '../../types/generated/privacy';

/** STARK curve parameters (placeholder - actual values from WASM) */
const CURVE = {
  // STARK curve prime (P)
  P: BigInt('0x800000000000011000000000000000000000000000000000000000000000001'),
  // Generator point G
  G: {
    x: BigInt('0x1'),
    y: BigInt('0x1ce8ed278dc58f31aad4fa1b15f08ad358f1cf4cb08e7127cc11c6ce61d27bf'),
  },
  // Order of the curve (N)
  N: BigInt('0x800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2f'),
};

/**
 * Encryption helper class
 *
 * Provides utilities for:
 * - ElGamal encryption/decryption
 * - Homomorphic operations (add encrypted values)
 * - Proof generation helpers
 *
 * NOTE: Most cryptographic operations should use WASM in production.
 * These TypeScript implementations are for prototyping and fallback.
 */
export class EncryptionHelper {
  /**
   * Encrypt an amount using ElGamal
   *
   * @param amount - Amount to encrypt (plaintext)
   * @param publicKey - Recipient's public key
   * @param randomness - Random value for encryption (optional)
   * @returns ElGamal ciphertext
   */
  static encrypt(
    amount: bigint,
    publicKey: ECPoint,
    randomness?: bigint
  ): ElGamalCiphertext {
    // Generate random r if not provided
    const r = randomness ?? this.generateRandomScalar();

    // C1 = r * G
    const c1 = this.scalarMul(CURVE.G, r);

    // M = amount * G (encode amount as curve point)
    const m = this.scalarMul(CURVE.G, amount);

    // C2 = M + r * PK
    const rPK = this.scalarMul(publicKey, r);
    const c2 = this.pointAdd(m, rPK);

    return { c1, c2 };
  }

  /**
   * Decrypt a ciphertext using private key
   *
   * NOTE: This performs ECDLP which is only feasible for small values.
   * In production, use AE hints for fast decryption.
   *
   * @param ciphertext - ElGamal ciphertext
   * @param privateKey - Decryption private key
   * @param maxValue - Maximum expected value (for baby-step giant-step)
   * @returns Decrypted amount or null if ECDLP fails
   */
  static decrypt(
    ciphertext: ElGamalCiphertext,
    privateKey: Uint8Array,
    maxValue: bigint = 10n ** 12n
  ): bigint | null {
    // sk * C1
    const sk = this.privateKeyToScalar(privateKey);
    const skC1 = this.scalarMul(ciphertext.c1, sk);

    // M = C2 - sk * C1
    const negSkC1 = this.pointNeg(skC1);
    const m = this.pointAdd(ciphertext.c2, negSkC1);

    // Solve ECDLP: find v such that M = v * G
    // This uses baby-step giant-step algorithm
    return this.solveECDLP(m, maxValue);
  }

  /**
   * Decrypt using AE hint (fast method)
   *
   * @param ciphertext - ElGamal ciphertext
   * @param hint - AE hint for fast decryption
   * @param privateKey - Private key
   * @returns Decrypted amount
   */
  static decryptWithHint(
    ciphertext: ElGamalCiphertext,
    hint: AEHint,
    privateKey: Uint8Array
  ): bigint {
    // Use hint to recover plaintext without ECDLP
    // hint.c0, c1, c2 encode the decryption path
    const sk = this.privateKeyToScalar(privateKey);

    // Simplified: hint allows direct recovery
    // In production, this is a more complex operation
    const v = (hint.c0 * sk + hint.c1) % CURVE.N;
    return v;
  }

  /**
   * Add two encrypted values homomorphically
   *
   * @param a - First ciphertext
   * @param b - Second ciphertext
   * @returns Sum ciphertext (encrypts a + b)
   */
  static homomorphicAdd(
    a: ElGamalCiphertext,
    b: ElGamalCiphertext
  ): ElGamalCiphertext {
    // (C1a, C2a) + (C1b, C2b) = (C1a + C1b, C2a + C2b)
    return {
      c1: this.pointAdd(a.c1, b.c1),
      c2: this.pointAdd(a.c2, b.c2),
    };
  }

  /**
   * Subtract encrypted values homomorphically
   *
   * @param a - First ciphertext
   * @param b - Second ciphertext
   * @returns Difference ciphertext (encrypts a - b)
   */
  static homomorphicSub(
    a: ElGamalCiphertext,
    b: ElGamalCiphertext
  ): ElGamalCiphertext {
    // (C1a, C2a) - (C1b, C2b) = (C1a - C1b, C2a - C2b)
    return {
      c1: this.pointAdd(a.c1, this.pointNeg(b.c1)),
      c2: this.pointAdd(a.c2, this.pointNeg(b.c2)),
    };
  }

  /**
   * Multiply encrypted value by scalar
   *
   * @param ciphertext - Input ciphertext
   * @param scalar - Scalar multiplier
   * @returns Scaled ciphertext (encrypts amount * scalar)
   */
  static homomorphicMul(
    ciphertext: ElGamalCiphertext,
    scalar: bigint
  ): ElGamalCiphertext {
    return {
      c1: this.scalarMul(ciphertext.c1, scalar),
      c2: this.scalarMul(ciphertext.c2, scalar),
    };
  }

  /**
   * Create zero ciphertext (encrypts 0)
   *
   * @param publicKey - Public key for encryption
   * @param randomness - Optional randomness
   * @returns Ciphertext encrypting zero
   */
  static encryptZero(publicKey: ECPoint, randomness?: bigint): ElGamalCiphertext {
    return this.encrypt(0n, publicKey, randomness);
  }

  /**
   * Re-randomize a ciphertext (changes randomness without changing plaintext)
   *
   * @param ciphertext - Input ciphertext
   * @param publicKey - Public key
   * @param newRandomness - New random value
   * @returns Re-randomized ciphertext
   */
  static reRandomize(
    ciphertext: ElGamalCiphertext,
    publicKey: ECPoint,
    newRandomness?: bigint
  ): ElGamalCiphertext {
    // Add encryption of zero with new randomness
    const zero = this.encryptZero(publicKey, newRandomness);
    return this.homomorphicAdd(ciphertext, zero);
  }

  /**
   * Create an empty encrypted balance
   *
   * @param publicKey - Account public key
   * @returns Empty encrypted balance
   */
  static createEmptyBalance(publicKey: ECPoint): EncryptedBalance {
    const zero = this.encryptZero(publicKey);
    return {
      ciphertext: zero,
      pending_in: zero,
      pending_out: zero,
      epoch: 0,
    };
  }

  /**
   * Compute balance after settling pending operations
   *
   * @param balance - Current encrypted balance
   * @returns Settled balance ciphertext
   */
  static settleBalance(balance: EncryptedBalance): ElGamalCiphertext {
    // new_balance = current + pending_in - pending_out
    const withPendingIn = this.homomorphicAdd(balance.ciphertext, balance.pending_in);
    return this.homomorphicSub(withPendingIn, balance.pending_out);
  }

  /**
   * Generate a random scalar in the curve order
   */
  static generateRandomScalar(): bigint {
    const bytes = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      // Fallback for Node.js without Web Crypto
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    let scalar = this.bytesToBigInt(bytes);
    // Reduce modulo curve order
    scalar = scalar % CURVE.N;
    if (scalar === 0n) scalar = 1n;
    return scalar;
  }

  /**
   * Generate AE hint for fast decryption
   *
   * @param amount - Plaintext amount
   * @param privateKey - Private key
   * @param ciphertext - Corresponding ciphertext
   * @returns AE hint
   */
  static generateAEHint(
    amount: bigint,
    privateKey: Uint8Array,
    ciphertext: ElGamalCiphertext
  ): AEHint {
    const sk = this.privateKeyToScalar(privateKey);

    // Compute hint components
    // c0 encodes the amount relationship
    // c1, c2 encode recovery information
    const c0 = amount % CURVE.N;
    const c1 = (c0 * sk) % CURVE.N;
    const c2 = this.hashPoint(ciphertext.c1);

    return { c0, c1, c2 };
  }

  // =========================================================================
  // Proof Generation Helpers
  // =========================================================================

  /**
   * Create a Schnorr proof of knowledge of discrete log
   *
   * Proves knowledge of x such that P = x * G
   *
   * @param privateKey - Secret x
   * @param publicPoint - Public P = x * G
   * @param context - Context string for challenge
   * @returns Schnorr proof
   */
  static createSchnorrProof(
    privateKey: Uint8Array,
    publicPoint: ECPoint,
    context: string
  ): SchnorrProof {
    const x = this.privateKeyToScalar(privateKey);

    // Generate random nonce k
    const k = this.generateRandomScalar();

    // Commitment R = k * G
    const commitment = this.scalarMul(CURVE.G, k);

    // Challenge c = H(R || P || context)
    const challenge = this.computeChallenge(commitment, publicPoint, context);

    // Response s = k + c * x (mod N)
    const response = (k + challenge * x) % CURVE.N;

    return { commitment, challenge, response };
  }

  /**
   * Verify a Schnorr proof
   *
   * @param proof - Schnorr proof
   * @param publicPoint - Claimed public point
   * @param context - Context string
   * @returns Whether proof is valid
   */
  static verifySchnorrProof(
    proof: SchnorrProof,
    publicPoint: ECPoint,
    context: string
  ): boolean {
    // Recompute challenge
    const expectedChallenge = this.computeChallenge(
      proof.commitment,
      publicPoint,
      context
    );

    if (proof.challenge !== expectedChallenge) {
      return false;
    }

    // Verify s * G = R + c * P
    const sG = this.scalarMul(CURVE.G, proof.response);
    const cP = this.scalarMul(publicPoint, proof.challenge);
    const RcP = this.pointAdd(proof.commitment, cP);

    return this.pointEquals(sG, RcP);
  }

  /**
   * Create a nullifier for a transfer
   *
   * @param privateKey - Sender's private key
   * @param txData - Transaction data
   * @returns Nullifier
   */
  static createNullifier(privateKey: Uint8Array, txData: string): bigint {
    const sk = this.privateKeyToScalar(privateKey);
    const txHash = this.hashString(txData);
    // Nullifier = H(sk || txHash)
    return this.hashBigInt(sk, txHash);
  }

  // =========================================================================
  // Low-level Curve Operations
  // =========================================================================

  /**
   * Scalar multiplication: P = k * G
   *
   * NOTE: Placeholder - use WASM in production
   */
  static scalarMul(point: ECPoint, scalar: bigint): ECPoint {
    // Double-and-add algorithm (simplified placeholder)
    // In production, this uses optimized WASM implementation

    // For now, return a deterministic pseudo-point
    // based on the inputs (NOT cryptographically secure)
    const hash1 = this.hashBigInt(point.x, scalar);
    const hash2 = this.hashBigInt(point.y, scalar);

    return {
      x: hash1 % CURVE.P,
      y: hash2 % CURVE.P,
    };
  }

  /**
   * Point addition: P = P1 + P2
   *
   * NOTE: Placeholder - use WASM in production
   */
  static pointAdd(p1: ECPoint, p2: ECPoint): ECPoint {
    // Simplified placeholder
    const hash1 = this.hashBigInt(p1.x + p2.x, p1.y);
    const hash2 = this.hashBigInt(p1.y + p2.y, p2.x);

    return {
      x: hash1 % CURVE.P,
      y: hash2 % CURVE.P,
    };
  }

  /**
   * Point negation: -P
   */
  static pointNeg(point: ECPoint): ECPoint {
    return {
      x: point.x,
      y: (CURVE.P - point.y) % CURVE.P,
    };
  }

  /**
   * Check if two points are equal
   */
  static pointEquals(p1: ECPoint, p2: ECPoint): boolean {
    return p1.x === p2.x && p1.y === p2.y;
  }

  /**
   * Check if point is the identity (point at infinity)
   */
  static isIdentity(point: ECPoint): boolean {
    return point.x === 0n && point.y === 0n;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private static privateKeyToScalar(privateKey: Uint8Array): bigint {
    return this.bytesToBigInt(privateKey) % CURVE.N;
  }

  private static bytesToBigInt(bytes: Uint8Array): bigint {
    let hex = '0x';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return BigInt(hex);
  }

  private static computeChallenge(
    commitment: ECPoint,
    publicPoint: ECPoint,
    context: string
  ): bigint {
    const data = `${commitment.x}|${commitment.y}|${publicPoint.x}|${publicPoint.y}|${context}`;
    return this.hashString(data);
  }

  private static hashString(str: string): bigint {
    // Simple hash function - in production use proper cryptographic hash
    let hash = 0n;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5n) - hash + BigInt(str.charCodeAt(i))) & ((1n << 256n) - 1n);
    }
    return hash % CURVE.N;
  }

  private static hashBigInt(...values: bigint[]): bigint {
    const str = values.map(v => v.toString(16)).join('|');
    return this.hashString(str);
  }

  private static hashPoint(point: ECPoint): bigint {
    return this.hashBigInt(point.x, point.y);
  }

  /**
   * Solve ECDLP using baby-step giant-step
   * Only works for small values
   */
  private static solveECDLP(point: ECPoint, maxValue: bigint): bigint | null {
    // Simplified - in production use lookup table or AE hints
    // This is placeholder that just returns null
    // Real implementation would use baby-step giant-step
    return null;
  }
}

/**
 * Create a transfer proof
 *
 * @param sender - Sender's keypair
 * @param recipient - Recipient's public key
 * @param amount - Transfer amount
 * @param senderBalance - Sender's current balance
 * @returns Transfer proof and new ciphertexts
 */
export function createTransferProof(
  senderPrivateKey: Uint8Array,
  senderPublicKey: ECPoint,
  recipientPublicKey: ECPoint,
  amount: bigint,
  _senderBalance: EncryptedBalance
): {
  proof: TransferProof;
  senderNewBalance: ElGamalCiphertext;
  recipientAmount: ElGamalCiphertext;
  nullifier: bigint;
} {
  // Generate randomness for encryptions
  const r1 = EncryptionHelper.generateRandomScalar();
  const r2 = EncryptionHelper.generateRandomScalar();

  // Encrypt amount for recipient
  const recipientAmount = EncryptionHelper.encrypt(amount, recipientPublicKey, r1);

  // Encrypt negative amount for sender (subtraction)
  const senderDebit = EncryptionHelper.encrypt(amount, senderPublicKey, r2);
  const senderNewBalance = EncryptionHelper.homomorphicSub(
    _senderBalance.ciphertext,
    senderDebit
  );

  // Create proofs
  const txContext = `transfer:${amount}:${Date.now()}`;
  const nullifier = EncryptionHelper.createNullifier(senderPrivateKey, txContext);

  const senderProof = EncryptionHelper.createSchnorrProof(
    senderPrivateKey,
    senderPublicKey,
    `sender:${txContext}`
  );

  // Placeholder for receiver proof and range proof
  const receiverProof: SchnorrProof = {
    commitment: { x: 0n, y: 0n },
    challenge: 0n,
    response: 0n,
  };

  const balanceProof: RangeProof = {
    commitment: { x: 0n, y: 0n },
    proof_hash: 0n,
    bit_commitments: [],
  };

  const proof: TransferProof = {
    sender_proof: senderProof,
    receiver_proof: receiverProof,
    balance_proof: balanceProof,
    nullifier,
  };

  return {
    proof,
    senderNewBalance,
    recipientAmount,
    nullifier,
  };
}

/**
 * Verify a transfer proof
 *
 * @param proof - Transfer proof
 * @param senderPublicKey - Sender's public key
 * @returns Whether proof is valid
 */
export function verifyTransferProof(
  proof: TransferProof,
  senderPublicKey: ECPoint,
  _context: string
): boolean {
  // Verify sender's Schnorr proof
  const senderValid = EncryptionHelper.verifySchnorrProof(
    proof.sender_proof,
    senderPublicKey,
    `sender:${_context}`
  );

  if (!senderValid) {
    return false;
  }

  // In production, also verify:
  // - Range proof (amount is positive and within bounds)
  // - Receiver proof (correct encryption)
  // - Nullifier hasn't been used

  return true;
}
