/**
 * Shared cryptographic primitives for Obelysk protocol clients.
 *
 * Re-exports core EC math from privacy module + adds protocol-specific helpers.
 * All obelysk clients import from here instead of duplicating EC math.
 */
import { hash } from 'starknet';
import {
  FIELD_PRIME,
  CURVE_ORDER,
  GENERATOR_G,
  GENERATOR_H,
  type ECPoint,
  ecAdd as _ecAdd,
  ecMul as _ecMul,
  randomScalar as _randomScalar,
  invMod,
} from '../privacy';

// Re-export constants and types
export { FIELD_PRIME, CURVE_ORDER, GENERATOR_G, GENERATOR_H };
export type { ECPoint };

/** Modular reduction (always positive) */
export function mod(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

/** Modular inverse via extended Euclidean algorithm */
export const modInverse = invMod;

/** EC point addition on STARK curve */
export const ecAdd = _ecAdd;

/** EC scalar multiplication on STARK curve */
export const ecMul = _ecMul;

/** Cryptographically secure random scalar in [1, CURVE_ORDER) */
export const randomScalar = _randomScalar;

/** Pedersen commitment: C = value * G + blinding * H */
export function pedersenCommit(value: bigint, blinding: bigint): ECPoint {
  return ecAdd(
    ecMul(mod(value, CURVE_ORDER), GENERATOR_G),
    ecMul(mod(blinding, CURVE_ORDER), GENERATOR_H),
  );
}

/** ElGamal encrypt: (r*G, amount*H + r*PK) */
export function elgamalEncrypt(amount: bigint, publicKey: ECPoint) {
  const r = randomScalar();
  const c1 = ecMul(r, GENERATOR_G);
  const mH = ecMul(amount, GENERATOR_H);
  const rPK = ecMul(r, publicKey);
  const c2 = ecAdd(mH, rPK);
  return { c1, c2, randomness: r };
}

/** Schnorr proof of knowledge of r such that c1 = r*G */
export function createEncryptionProof(r: bigint, c1: ECPoint): { commitment: ECPoint; challenge: bigint; response: bigint } {
  const k = randomScalar();
  const commitment = ecMul(k, GENERATOR_G);
  const challenge = BigInt(hash.computePoseidonHashOnElements([
    commitment.x.toString(),
    commitment.y.toString(),
    c1.x.toString(),
    c1.y.toString(),
  ]));
  const response = mod(k - challenge * r, CURVE_ORDER);
  return { commitment, challenge, response };
}

/** Generate AE hint for O(1) decryption */
export function createAEHint(amount: bigint, sharedSecret: bigint): { encryptedAmount: bigint; mac: bigint } {
  const encryptedAmount = mod(amount + sharedSecret, FIELD_PRIME);
  const mac = BigInt(hash.computePoseidonHash(sharedSecret.toString(), encryptedAmount.toString()));
  return { encryptedAmount, mac };
}

/** Hash for commitment (Poseidon of point coordinates) */
export function commitmentToHash(point: ECPoint): string {
  return hash.computePoseidonHash(point.x.toString(), point.y.toString());
}

/** Derive nullifier from secret */
export function deriveNullifier(nullifierSecret: bigint, commitmentHash: string): string {
  return hash.computePoseidonHash(nullifierSecret.toString(), commitmentHash);
}
