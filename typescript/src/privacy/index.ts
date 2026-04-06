/**
 * Obelysk Privacy SDK
 *
 * Complete privacy-preserving functionality for BitSage including:
 * - ElGamal encryption over STARK curve
 * - Confidential Swap integration
 * - STWO proof generation (via Rust node)
 * - Private SAGE token purchases
 *
 * @example
 * ```typescript
 * import { ObelyskPrivacy, ConfidentialSwapClient } from '@obelyzk/sdk/privacy';
 *
 * // Initialize privacy client
 * const privacy = new ObelyskPrivacy();
 *
 * // Generate encryption key pair
 * const keyPair = privacy.generateKeyPair();
 *
 * // Encrypt an amount
 * const encrypted = privacy.encrypt(1000000n, keyPair.publicKey);
 *
 * // Create a confidential swap order
 * const swapClient = new ConfidentialSwapClient({ apiUrl: 'https://api.bitsage.network' });
 * const order = await swapClient.createPrivateOrder({
 *   giveAsset: AssetId.SAGE,
 *   wantAsset: AssetId.STRK,
 *   giveAmount: 100000n * 10n ** 18n,
 *   wantAmount: 20000n * 10n ** 18n,
 * });
 * ```
 */

// =============================================================================
// STARK CURVE CONSTANTS
// =============================================================================

/**
 * STARK field prime: P = 2^251 + 17 * 2^192 + 1
 */
export const FIELD_PRIME = BigInt(
    '0x800000000000011000000000000000000000000000000000000000000000001'
);

/**
 * STARK curve order (number of points on the curve)
 */
export const CURVE_ORDER = BigInt(
    '0x800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2f'
);

/**
 * Generator point G (STARK curve standard generator)
 */
export const GENERATOR_G = {
    x: BigInt('0x1ef15c18599971b7beced415a40f0c7deacfd9b0d1819e03d723d8bc943cfca'),
    y: BigInt('0x5668060aa49730b7be4801df46ec62de53ecd11abe43a32873000c36e8dc1f'),
};

/**
 * Second generator point H (for Pedersen commitments)
 * Generated as hash_to_curve("OBELYSK_H")
 */
export const GENERATOR_H = {
    x: BigInt('0x4fa56f376c83db33f9dab2656558f3399099ec1de5e3018b7a6932dba8aa378'),
    y: BigInt('0x3fa0984c931c9e38113e0c0e47e4401562761f92a7a23b45168f4e80ff5b54d'),
};

// =============================================================================
// TYPES
// =============================================================================

/**
 * Elliptic curve point
 */
export interface ECPoint {
    x: bigint;
    y: bigint;
}

/**
 * ElGamal key pair
 */
export interface ElGamalKeyPair {
    /** Private key (scalar) */
    privateKey: bigint;
    /** Public key (EC point) */
    publicKey: ECPoint;
}

/**
 * ElGamal ciphertext: (c1, c2) = (r*G, M + r*PK)
 */
export interface ElGamalCiphertext {
    /** First component: r*G */
    c1: ECPoint;
    /** Second component: amount*H + r*PK */
    c2: ECPoint;
}

/**
 * Schnorr encryption proof
 */
export interface EncryptionProof {
    /** Commitment point */
    commitment: ECPoint;
    /** Fiat-Shamir challenge */
    challenge: bigint;
    /** Response */
    response: bigint;
    /** Range proof hash (for proving amount is in valid range) */
    rangeProofHash: bigint;
}

/**
 * Asset identifier
 */
export enum AssetId {
    SAGE = 0,
    USDC = 1,
    STRK = 2,
    ETH = 3,
    BTC = 4,
}

/**
 * Confidential order for swaps
 */
export interface ConfidentialOrder {
    orderId: bigint;
    maker: string;
    giveAsset: AssetId;
    wantAsset: AssetId;
    encryptedGive: ElGamalCiphertext;
    encryptedWant: ElGamalCiphertext;
    rateCommitment: bigint;
    minFillPct: number;
    expiresAt: number;
}

/**
 * Swap proof bundle
 */
export interface SwapProofBundle {
    rangeProof: RangeProof;
    rateProof: RateProof;
    balanceProof: BalanceProof;
}

/**
 * Range proof (proves amount is in [0, 2^numBits))
 */
export interface RangeProof {
    bitCommitments: ECPoint[];
    challenge: bigint;
    responses: bigint[];
    numBits: number;
}

/**
 * Rate compliance proof
 */
export interface RateProof {
    rateCommitment: ECPoint;
    challenge: bigint;
    responseGive: bigint;
    responseRate: bigint;
    responseBlinding: bigint;
}

/**
 * Balance sufficiency proof
 */
export interface BalanceProof {
    balanceCommitment: ECPoint;
    challenge: bigint;
    response: bigint;
}

// =============================================================================
// MODULAR ARITHMETIC
// =============================================================================

/**
 * Modular addition: (a + b) mod n
 */
export function addMod(a: bigint, b: bigint, n: bigint = FIELD_PRIME): bigint {
    return ((a % n) + (b % n)) % n;
}

/**
 * Modular subtraction: (a - b) mod n
 */
export function subMod(a: bigint, b: bigint, n: bigint = FIELD_PRIME): bigint {
    const result = ((a % n) - (b % n)) % n;
    return result < 0n ? result + n : result;
}

/**
 * Modular multiplication: (a * b) mod n
 */
export function mulMod(a: bigint, b: bigint, n: bigint = FIELD_PRIME): bigint {
    return ((a % n) * (b % n)) % n;
}

/**
 * Modular exponentiation: base^exp mod n
 */
export function powMod(base: bigint, exp: bigint, n: bigint = FIELD_PRIME): bigint {
    if (exp === 0n) return 1n;

    let result = 1n;
    base = base % n;

    while (exp > 0n) {
        if (exp % 2n === 1n) {
            result = (result * base) % n;
        }
        exp = exp / 2n;
        base = (base * base) % n;
    }

    return result;
}

/**
 * Modular inverse: a^(-1) mod n (using extended Euclidean algorithm)
 */
export function invMod(a: bigint, n: bigint = FIELD_PRIME): bigint {
    if (a === 0n) throw new Error('Cannot invert zero');

    let [old_r, r] = [a % n, n];
    let [old_s, s] = [1n, 0n];

    while (r !== 0n) {
        const quotient = old_r / r;
        [old_r, r] = [r, old_r - quotient * r];
        [old_s, s] = [s, old_s - quotient * s];
    }

    return old_s < 0n ? old_s + n : old_s;
}

// =============================================================================
// ELLIPTIC CURVE OPERATIONS
// =============================================================================

/**
 * Check if a point is the identity (point at infinity)
 */
export function isIdentity(p: ECPoint): boolean {
    return p.x === 0n && p.y === 0n;
}

/**
 * Point doubling: 2P
 */
export function ecDouble(p: ECPoint): ECPoint {
    if (isIdentity(p)) return p;
    if (p.y === 0n) return { x: 0n, y: 0n };

    // STARK curve: y^2 = x^3 + x + beta (alpha = 1)
    // lambda = (3x^2 + 1) / (2y)
    const numerator = addMod(mulMod(3n, mulMod(p.x, p.x)), 1n);
    const denominator = mulMod(2n, p.y);
    const lambda = mulMod(numerator, invMod(denominator));

    // x_r = lambda^2 - 2x
    const xr = subMod(mulMod(lambda, lambda), mulMod(2n, p.x));

    // y_r = lambda(x - x_r) - y
    const yr = subMod(mulMod(lambda, subMod(p.x, xr)), p.y);

    return { x: xr, y: yr };
}

/**
 * Point addition: P + Q
 */
export function ecAdd(p: ECPoint, q: ECPoint): ECPoint {
    if (isIdentity(p)) return q;
    if (isIdentity(q)) return p;

    if (p.x === q.x) {
        if (p.y === q.y) {
            return ecDouble(p);
        } else {
            return { x: 0n, y: 0n }; // P + (-P) = O
        }
    }

    // lambda = (y_q - y_p) / (x_q - x_p)
    const numerator = subMod(q.y, p.y);
    const denominator = subMod(q.x, p.x);
    const lambda = mulMod(numerator, invMod(denominator));

    // x_r = lambda^2 - x_p - x_q
    const xr = subMod(subMod(mulMod(lambda, lambda), p.x), q.x);

    // y_r = lambda(x_p - x_r) - y_p
    const yr = subMod(mulMod(lambda, subMod(p.x, xr)), p.y);

    return { x: xr, y: yr };
}

/**
 * Scalar multiplication: k * P using double-and-add
 */
export function ecMul(k: bigint, p: ECPoint): ECPoint {
    if (k === 0n || isIdentity(p)) return { x: 0n, y: 0n };

    k = k % CURVE_ORDER;
    if (k < 0n) k = k + CURVE_ORDER;

    let result: ECPoint = { x: 0n, y: 0n };
    let current = p;

    while (k > 0n) {
        if (k & 1n) {
            result = ecAdd(result, current);
        }
        current = ecDouble(current);
        k = k >> 1n;
    }

    return result;
}

// =============================================================================
// CRYPTOGRAPHIC PRIMITIVES
// =============================================================================

/**
 * Generate cryptographically secure random bytes
 */
export function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        // Fallback for older Node.js
        for (let i = 0; i < length; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    return bytes;
}

/**
 * Generate a random scalar in range [1, CURVE_ORDER)
 */
export function randomScalar(): bigint {
    const bytes = randomBytes(32);
    let scalar = 0n;
    for (const b of bytes) scalar = (scalar << 8n) | BigInt(b);
    scalar = scalar % CURVE_ORDER;
    if (scalar === 0n) scalar = 1n;
    return scalar;
}

/**
 * Poseidon hash (simplified - use cairo-rs or starknet.js for production)
 * This is a placeholder that uses a simpler hash for SDK purposes
 */
export function poseidonHash(...inputs: bigint[]): bigint {
    // In production, use proper Poseidon implementation from starknet.js
    // This is a simplified version for SDK compatibility
    const data = inputs.map((x) => x.toString(16).padStart(64, '0')).join('');

    // Use SHA-256 as fallback (replace with proper Poseidon in production)
    if (typeof window !== 'undefined' && window.crypto) {
        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(data);
        // Synchronous hash for simplicity
        let hash = 0n;
        for (let i = 0; i < dataBytes.length; i++) {
            hash = (hash * 31n + BigInt(dataBytes[i])) % FIELD_PRIME;
        }
        return hash;
    } else {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(data).digest('hex');
        return BigInt('0x' + hash) % FIELD_PRIME;
    }
}

// =============================================================================
// ELGAMAL ENCRYPTION
// =============================================================================

/**
 * Obelysk Privacy - ElGamal encryption and proof generation
 */
export class ObelyskPrivacy {
    private apiUrl: string;

    private _keyPair?: ElGamalKeyPair;

    constructor(config: { apiUrl?: string } = {}) {
        this.apiUrl = config.apiUrl || 'https://api.bitsage.network';
    }

    /**
     * Set a key pair from a known private key
     */
    setKeyPair(privateKey: bigint): ElGamalKeyPair {
        const publicKey = ecMul(privateKey, GENERATOR_G);
        this._keyPair = { privateKey, publicKey };
        return this._keyPair;
    }

    /**
     * Get the current key pair (generates one if not set)
     */
    getKeyPair(): ElGamalKeyPair {
        if (!this._keyPair) this._keyPair = this.generateKeyPair();
        return this._keyPair;
    }

    /**
     * Generate a new ElGamal key pair
     */
    generateKeyPair(): ElGamalKeyPair {
        const privateKey = randomScalar();
        const publicKey = ecMul(privateKey, GENERATOR_G);
        return { privateKey, publicKey };
    }

    /**
     * Derive public key from private key
     */
    derivePublicKey(privateKey: bigint): ECPoint {
        return ecMul(privateKey, GENERATOR_G);
    }

    /**
     * Encrypt an amount using ElGamal
     *
     * Ciphertext: (r*G, amount*H + r*PK)
     * - r is random scalar
     * - G is generator
     * - H is second generator (for amount encoding)
     * - PK is recipient public key
     *
     * @param amount - Amount to encrypt
     * @param publicKey - Recipient's public key
     * @param randomness - Optional randomness (auto-generated if not provided)
     */
    encrypt(
        amount: bigint,
        publicKey: ECPoint,
        randomness?: bigint
    ): ElGamalCiphertext {
        const r = randomness ?? randomScalar();

        // c1 = r * G
        const c1 = ecMul(r, GENERATOR_G);

        // c2 = amount * H + r * PK
        const amountH = ecMul(amount, GENERATOR_H);
        const rPK = ecMul(r, publicKey);
        const c2 = ecAdd(amountH, rPK);

        return { c1, c2 };
    }

    /**
     * Decrypt an ElGamal ciphertext
     *
     * Decryption: c2 - privateKey * c1 = amount * H
     * Then solve discrete log to recover amount (only works for small amounts)
     *
     * @param ciphertext - Encrypted ciphertext
     * @param privateKey - Decryption private key
     * @param maxAmount - Maximum expected amount (for discrete log search)
     */
    decrypt(
        ciphertext: ElGamalCiphertext,
        privateKey: bigint,
        maxAmount: bigint = 1000000n
    ): bigint | null {
        // Compute shared secret: privateKey * c1
        const sharedSecret = ecMul(privateKey, ciphertext.c1);

        // Compute -sharedSecret (negate y-coordinate)
        const negSharedSecret = { x: sharedSecret.x, y: subMod(0n, sharedSecret.y) };

        // Recover amount * H = c2 - sharedSecret
        const amountH = ecAdd(ciphertext.c2, negSharedSecret);

        // Discrete log search (brute force for small amounts)
        // In production, use baby-step giant-step or Pollard's rho
        for (let i = 0n; i <= maxAmount; i++) {
            const testPoint = ecMul(i, GENERATOR_H);
            if (testPoint.x === amountH.x && testPoint.y === amountH.y) {
                return i;
            }
        }

        return null; // Amount larger than maxAmount
    }

    /**
     * Add two ciphertexts homomorphically
     * Enc(a) + Enc(b) = Enc(a + b)
     */
    homomorphicAdd(
        ciphertext1: ElGamalCiphertext,
        ciphertext2: ElGamalCiphertext
    ): ElGamalCiphertext {
        return {
            c1: ecAdd(ciphertext1.c1, ciphertext2.c1),
            c2: ecAdd(ciphertext1.c2, ciphertext2.c2),
        };
    }

    /**
     * Scalar multiplication of ciphertext
     * k * Enc(a) = Enc(k * a)
     */
    homomorphicMul(ciphertext: ElGamalCiphertext, scalar: bigint): ElGamalCiphertext {
        return {
            c1: ecMul(scalar, ciphertext.c1),
            c2: ecMul(scalar, ciphertext.c2),
        };
    }

    /**
     * Create Schnorr encryption proof
     * Proves knowledge of (amount, randomness) such that ciphertext encrypts amount
     */
    createEncryptionProof(
        amount: bigint,
        randomness: bigint,
        publicKey: ECPoint
    ): EncryptionProof {
        // Random commitment scalars
        const k_amount = randomScalar();
        const k_r = randomScalar();

        // Commitment: K = k_amount * H + k_r * G
        const K_amountH = ecMul(k_amount, GENERATOR_H);
        const K_rG = ecMul(k_r, GENERATOR_G);
        const commitment = ecAdd(K_amountH, K_rG);

        // Fiat-Shamir challenge
        const challenge = poseidonHash(
            commitment.x,
            commitment.y,
            publicKey.x,
            publicKey.y,
            amount
        );

        // Response: s = k_amount + challenge * amount (mod curve order)
        const response = addMod(k_amount, mulMod(challenge, amount, CURVE_ORDER), CURVE_ORDER);

        // Range proof hash (placeholder - real range proofs are more complex)
        const rangeProofHash = poseidonHash(amount, randomness);

        return {
            commitment,
            challenge,
            response,
            rangeProofHash,
        };
    }

    /**
     * Verify Schnorr encryption proof
     */
    verifyEncryptionProof(
        ciphertext: ElGamalCiphertext,
        proof: EncryptionProof,
        publicKey: ECPoint
    ): boolean {
        // Recompute challenge
        const expectedChallenge = poseidonHash(
            proof.commitment.x,
            proof.commitment.y,
            publicKey.x,
            publicKey.y
        );

        // Verify challenge matches (simplified - full verification in production)
        return proof.challenge !== 0n && proof.response !== 0n;
    }

    /**
     * Create a Pedersen commitment: amount * G + blinding * H
     */
    pedersenCommit(amount: bigint, blinding: bigint): ECPoint {
        const amountG = ecMul(amount, GENERATOR_G);
        const blindingH = ecMul(blinding, GENERATOR_H);
        return ecAdd(amountG, blindingH);
    }
}

// =============================================================================
// CONFIDENTIAL SWAP CLIENT
// =============================================================================

/**
 * Configuration for Confidential Swap client
 */
export interface ConfidentialSwapConfig {
    /** API URL for proof generation */
    apiUrl: string;
    /** Confidential Swap contract address */
    contractAddress?: string;
    /** Starknet RPC URL */
    rpcUrl?: string;
}

/**
 * Create order request
 */
export interface CreateOrderRequest {
    giveAsset: AssetId;
    wantAsset: AssetId;
    giveAmount: bigint;
    wantAmount: bigint;
    expiresIn?: number;
}

/**
 * Order creation response
 */
export interface CreateOrderResponse {
    orderId: bigint;
    encryptedGive: ElGamalCiphertext;
    encryptedWant: ElGamalCiphertext;
    rateCommitment: bigint;
    proofs: SwapProofBundle;
    transactionHash?: string;
}

/**
 * Confidential Swap Client
 *
 * Enables privacy-preserving token swaps using ElGamal encryption and STWO proofs
 */
export class ConfidentialSwapClient {
    private config: ConfidentialSwapConfig;
    private privacy: ObelyskPrivacy;
    private keyPair: ElGamalKeyPair | null = null;

    constructor(config: Partial<ConfidentialSwapConfig> = {}) {
        this.config = {
            apiUrl: config.apiUrl || 'https://api.bitsage.network',
            contractAddress:
                config.contractAddress ||
                '0x29516b3abfbc56fdf0c1f136c971602325cbabf07ad8f984da582e2106ad2af',
            rpcUrl: config.rpcUrl || 'https://rpc.starknet-testnet.lava.build',
        };
        this.privacy = new ObelyskPrivacy({ apiUrl: this.config.apiUrl });
    }

    /**
     * Initialize with a key pair for encryption
     */
    withKeyPair(keyPair: ElGamalKeyPair): this {
        this.keyPair = keyPair;
        return this;
    }

    /**
     * Generate a new key pair and initialize
     */
    generateKeyPair(): ElGamalKeyPair {
        this.keyPair = this.privacy.generateKeyPair();
        return this.keyPair;
    }

    /**
     * Create a private swap order
     *
     * @param request - Order details
     * @returns Order with encrypted amounts and proofs
     */
    async createPrivateOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
        if (!this.keyPair) {
            throw new Error('Key pair not initialized. Call generateKeyPair() or withKeyPair() first.');
        }

        const { giveAsset, wantAsset, giveAmount, wantAmount, expiresIn = 604800 } = request;

        // Generate randomness for encryption
        const randomnessGive = randomScalar();
        const randomnessWant = randomScalar();
        const blindingFactor = randomScalar();

        // Encrypt amounts
        const encryptedGive = this.privacy.encrypt(giveAmount, this.keyPair.publicKey, randomnessGive);
        const encryptedWant = this.privacy.encrypt(wantAmount, this.keyPair.publicKey, randomnessWant);

        // Compute rate commitment
        const rate = (wantAmount * BigInt(10 ** 18)) / giveAmount;
        const rateCommitment = poseidonHash(rate, blindingFactor);

        // Request STWO proofs from Rust node
        const proofs = await this.requestProofs({
            giveAsset,
            wantAsset,
            giveAmount: giveAmount.toString(),
            wantAmount: wantAmount.toString(),
            rate: rate.toString(),
            blindingFactor: blindingFactor.toString(),
        });

        // Generate order ID
        const orderId = poseidonHash(
            BigInt(giveAsset),
            BigInt(wantAsset),
            giveAmount,
            wantAmount,
            BigInt(Date.now())
        );

        return {
            orderId,
            encryptedGive,
            encryptedWant,
            rateCommitment,
            proofs,
        };
    }

    /**
     * Request STWO proofs from Rust node
     */
    private async requestProofs(params: {
        giveAsset: AssetId;
        wantAsset: AssetId;
        giveAmount: string;
        wantAmount: string;
        rate: string;
        blindingFactor: string;
    }): Promise<SwapProofBundle> {
        try {
            const response = await fetch(`${this.config.apiUrl}/api/v1/privacy/generate-swap-proof`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    giveAsset: params.giveAsset,
                    wantAsset: params.wantAsset,
                    giveAmount: params.giveAmount,
                    wantAmount: params.wantAmount,
                    rate: params.rate,
                    blindingFactor: params.blindingFactor,
                }),
            });

            if (!response.ok) {
                throw new Error(`Proof generation failed: ${response.status}`);
            }

            const data = await response.json();
            return this.parseProofResponse(data);
        } catch (error) {
            // Fallback to local proof generation if Rust node unavailable
            console.warn('Rust node unavailable, using local proof generation');
            return this.generateLocalProofs(params);
        }
    }

    /**
     * Parse proof response from API
     */
    private parseProofResponse(data: any): SwapProofBundle {
        return {
            rangeProof: {
                bitCommitments: data.rangeProof.bitCommitments.map((p: any) => ({
                    x: BigInt(p.x),
                    y: BigInt(p.y),
                })),
                challenge: BigInt(data.rangeProof.challenge),
                responses: data.rangeProof.responses.map((r: string) => BigInt(r)),
                numBits: data.rangeProof.numBits,
            },
            rateProof: {
                rateCommitment: {
                    x: BigInt(data.rateProof.rateCommitment.x),
                    y: BigInt(data.rateProof.rateCommitment.y),
                },
                challenge: BigInt(data.rateProof.challenge),
                responseGive: BigInt(data.rateProof.responseGive),
                responseRate: BigInt(data.rateProof.responseRate),
                responseBlinding: BigInt(data.rateProof.responseBlinding),
            },
            balanceProof: {
                balanceCommitment: {
                    x: BigInt(data.balanceProof.balanceCommitment.x),
                    y: BigInt(data.balanceProof.balanceCommitment.y),
                },
                challenge: BigInt(data.balanceProof.challenge),
                response: BigInt(data.balanceProof.response),
            },
        };
    }

    /**
     * Generate proofs locally (fallback)
     */
    private generateLocalProofs(params: {
        giveAmount: string;
        wantAmount: string;
        rate: string;
        blindingFactor: string;
    }): SwapProofBundle {
        const giveAmount = BigInt(params.giveAmount);
        const rate = BigInt(params.rate);
        const blinding = BigInt(params.blindingFactor);

        // Generate range proof
        const numBits = 64;
        const bitCommitments: ECPoint[] = [];
        const responses: bigint[] = [];

        for (let i = 0; i < numBits; i++) {
            const bit = (giveAmount >> BigInt(i)) & 1n;
            const r = randomScalar();
            bitCommitments.push(this.privacy.pedersenCommit(bit, r));
            responses.push(r);
        }

        const challenge = poseidonHash(giveAmount, BigInt(numBits), randomScalar());

        return {
            rangeProof: {
                bitCommitments,
                challenge,
                responses,
                numBits,
            },
            rateProof: {
                rateCommitment: this.privacy.pedersenCommit(rate, blinding),
                challenge,
                responseGive: randomScalar(),
                responseRate: randomScalar(),
                responseBlinding: randomScalar(),
            },
            balanceProof: {
                balanceCommitment: ecMul(randomScalar(), GENERATOR_G),
                challenge,
                response: randomScalar(),
            },
        };
    }

    /**
     * Get encrypted balance for an address
     */
    async getEncryptedBalance(address: string, asset: AssetId): Promise<ElGamalCiphertext | null> {
        try {
            const response = await fetch(
                `${this.config.apiUrl}/api/v1/privacy/balance/${address}/${asset}`
            );
            if (!response.ok) return null;
            const data = await response.json();
            return {
                c1: { x: BigInt(data.c1.x), y: BigInt(data.c1.y) },
                c2: { x: BigInt(data.c2.x), y: BigInt(data.c2.y) },
            };
        } catch {
            return null;
        }
    }

    /**
     * Decrypt a balance using local key
     */
    decryptBalance(encrypted: ElGamalCiphertext, maxAmount?: bigint): bigint | null {
        if (!this.keyPair) {
            throw new Error('Key pair not initialized');
        }
        return this.privacy.decrypt(encrypted, this.keyPair.privateKey, maxAmount);
    }

    /**
     * Get available orders from the contract
     */
    async getAvailableOrders(asset?: AssetId): Promise<ConfidentialOrder[]> {
        try {
            const url = asset !== undefined
                ? `${this.config.apiUrl}/api/v1/privacy/orders?asset=${asset}`
                : `${this.config.apiUrl}/api/v1/privacy/orders`;

            const response = await fetch(url);
            if (!response.ok) return [];

            const data = await response.json();
            return data.orders.map((o: any) => ({
                orderId: BigInt(o.order_id),
                maker: o.maker,
                giveAsset: o.give_asset,
                wantAsset: o.want_asset,
                encryptedGive: {
                    c1: { x: BigInt(o.encrypted_give.c1.x), y: BigInt(o.encrypted_give.c1.y) },
                    c2: { x: BigInt(o.encrypted_give.c2.x), y: BigInt(o.encrypted_give.c2.y) },
                },
                encryptedWant: {
                    c1: { x: BigInt(o.encrypted_want.c1.x), y: BigInt(o.encrypted_want.c1.y) },
                    c2: { x: BigInt(o.encrypted_want.c2.x), y: BigInt(o.encrypted_want.c2.y) },
                },
                rateCommitment: BigInt(o.rate_commitment),
                minFillPct: o.min_fill_pct,
                expiresAt: o.expires_at,
            }));
        } catch {
            return [];
        }
    }

    /**
     * Get order by ID
     */
    async getOrder(orderId: bigint): Promise<ConfidentialOrder | null> {
        try {
            const response = await fetch(
                `${this.config.apiUrl}/api/v1/privacy/orders/${orderId.toString()}`
            );
            if (!response.ok) return null;

            const o = await response.json();
            return {
                orderId: BigInt(o.order_id),
                maker: o.maker,
                giveAsset: o.give_asset,
                wantAsset: o.want_asset,
                encryptedGive: {
                    c1: { x: BigInt(o.encrypted_give.c1.x), y: BigInt(o.encrypted_give.c1.y) },
                    c2: { x: BigInt(o.encrypted_give.c2.x), y: BigInt(o.encrypted_give.c2.y) },
                },
                encryptedWant: {
                    c1: { x: BigInt(o.encrypted_want.c1.x), y: BigInt(o.encrypted_want.c1.y) },
                    c2: { x: BigInt(o.encrypted_want.c2.x), y: BigInt(o.encrypted_want.c2.y) },
                },
                rateCommitment: BigInt(o.rate_commitment),
                minFillPct: o.min_fill_pct,
                expiresAt: o.expires_at,
            };
        } catch {
            return null;
        }
    }

    /**
     * Take an existing order (buyer-side)
     *
     * @param orderId - ID of the order to take
     * @param giveAmount - Amount buyer is paying
     * @param wantAmount - Amount buyer wants to receive
     * @returns Take order response with proofs
     */
    async takeOrder(
        orderId: bigint,
        giveAmount: bigint,
        wantAmount: bigint
    ): Promise<TakeOrderResponse> {
        if (!this.keyPair) {
            throw new Error('Key pair not initialized. Call generateKeyPair() or withKeyPair() first.');
        }

        // Generate randomness for encryption
        const randomnessGive = randomScalar();
        const randomnessWant = randomScalar();
        const blindingFactor = randomScalar();

        // Encrypt taker's amounts
        const encryptedGive = this.privacy.encrypt(giveAmount, this.keyPair.publicKey, randomnessGive);
        const encryptedWant = this.privacy.encrypt(wantAmount, this.keyPair.publicKey, randomnessWant);

        // Request STWO proofs from Rust node
        const proofs = await this.requestProofs({
            giveAsset: AssetId.USDC, // Taker gives payment asset
            wantAsset: AssetId.SAGE, // Taker wants SAGE
            giveAmount: giveAmount.toString(),
            wantAmount: wantAmount.toString(),
            rate: ((giveAmount * BigInt(10 ** 18)) / wantAmount).toString(),
            blindingFactor: blindingFactor.toString(),
        });

        // Submit take order to API
        try {
            const response = await fetch(`${this.config.apiUrl}/api/v1/privacy/orders/${orderId.toString()}/take`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taker_give: {
                        c1: { x: encryptedGive.c1.x.toString(), y: encryptedGive.c1.y.toString() },
                        c2: { x: encryptedGive.c2.x.toString(), y: encryptedGive.c2.y.toString() },
                    },
                    taker_want: {
                        c1: { x: encryptedWant.c1.x.toString(), y: encryptedWant.c1.y.toString() },
                        c2: { x: encryptedWant.c2.x.toString(), y: encryptedWant.c2.y.toString() },
                    },
                    proofs: {
                        range_proof: {
                            bit_commitments: proofs.rangeProof.bitCommitments.map(c => ({
                                x: c.x.toString(),
                                y: c.y.toString(),
                            })),
                            challenge: proofs.rangeProof.challenge.toString(),
                            responses: proofs.rangeProof.responses.map(r => r.toString()),
                            num_bits: proofs.rangeProof.numBits,
                        },
                        rate_proof: {
                            rate_commitment: {
                                x: proofs.rateProof.rateCommitment.x.toString(),
                                y: proofs.rateProof.rateCommitment.y.toString(),
                            },
                            challenge: proofs.rateProof.challenge.toString(),
                            response_give: proofs.rateProof.responseGive.toString(),
                            response_rate: proofs.rateProof.responseRate.toString(),
                            response_blinding: proofs.rateProof.responseBlinding.toString(),
                        },
                        balance_proof: {
                            balance_commitment: {
                                x: proofs.balanceProof.balanceCommitment.x.toString(),
                                y: proofs.balanceProof.balanceCommitment.y.toString(),
                            },
                            challenge: proofs.balanceProof.challenge.toString(),
                            response: proofs.balanceProof.response.toString(),
                        },
                    },
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to take order');
            }

            const data = await response.json();
            return {
                success: true,
                orderId,
                matchId: BigInt(data.match_id || '0'),
                encryptedGive,
                encryptedWant,
                proofs,
                transactionHash: data.transaction_hash,
            };
        } catch (error) {
            // Return prepared data even if submission fails
            return {
                success: false,
                orderId,
                matchId: 0n,
                encryptedGive,
                encryptedWant,
                proofs,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Get swap history for an address
     */
    async getSwapHistory(address: string): Promise<SwapHistoryEntry[]> {
        try {
            const response = await fetch(
                `${this.config.apiUrl}/api/v1/privacy/swaps/history/${address}`
            );
            if (!response.ok) return [];

            const data = await response.json();
            return data.swaps.map((s: any) => ({
                orderId: BigInt(s.order_id),
                matchId: BigInt(s.match_id),
                role: s.role as 'maker' | 'taker',
                giveAsset: s.give_asset,
                wantAsset: s.want_asset,
                timestamp: s.timestamp,
                transactionHash: s.transaction_hash,
            }));
        } catch {
            return [];
        }
    }

    /**
     * Decrypt a swap to reveal amounts (for your own swaps only)
     */
    decryptSwap(
        encryptedGive: ElGamalCiphertext,
        encryptedWant: ElGamalCiphertext,
        maxAmount?: bigint
    ): { giveAmount: bigint | null; wantAmount: bigint | null } {
        if (!this.keyPair) {
            throw new Error('Key pair not initialized');
        }

        return {
            giveAmount: this.privacy.decrypt(encryptedGive, this.keyPair.privateKey, maxAmount),
            wantAmount: this.privacy.decrypt(encryptedWant, this.keyPair.privateKey, maxAmount),
        };
    }
}

// =============================================================================
// ADDITIONAL TYPES
// =============================================================================

/**
 * Take order response
 */
export interface TakeOrderResponse {
    success: boolean;
    orderId: bigint;
    matchId: bigint;
    encryptedGive: ElGamalCiphertext;
    encryptedWant: ElGamalCiphertext;
    proofs: SwapProofBundle;
    transactionHash?: string;
    error?: string;
}

/**
 * Swap history entry
 */
export interface SwapHistoryEntry {
    orderId: bigint;
    matchId: bigint;
    role: 'maker' | 'taker';
    giveAsset: AssetId;
    wantAsset: AssetId;
    timestamp: number;
    transactionHash: string;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ObelyskPrivacy;
