//! ElGamal Encryption
//!
//! ElGamal encryption on the STARK curve for privacy-preserving operations.
//!
//! The encryption scheme:
//! - Key generation: sk = random scalar, pk = sk * G
//! - Encrypt(m, pk): Choose random r, compute C1 = r*G, C2 = m*G + r*pk
//! - Decrypt(C1, C2, sk): M = C2 - sk*C1, then solve ECDLP for m
//!
//! For efficient decryption of small values, we use baby-step giant-step ECDLP.

use num_bigint::BigUint;
use num_traits::{Zero, One, ToPrimitive};
use std::collections::HashMap;

use crate::curve::{
    ECPoint, generator, random_scalar, scalar_mul, point_add, point_neg,
    curve_order, field_prime, is_on_curve,
};

/// Encryption error types
#[derive(Debug)]
pub enum ElGamalError {
    InvalidKey,
    InvalidCiphertext,
    DecryptionFailed,
}

impl std::fmt::Display for ElGamalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ElGamalError::InvalidKey => write!(f, "Invalid key"),
            ElGamalError::InvalidCiphertext => write!(f, "Invalid ciphertext"),
            ElGamalError::DecryptionFailed => write!(f, "Decryption failed"),
        }
    }
}

impl std::error::Error for ElGamalError {}

/// Generate a new ElGamal keypair
///
/// Returns (secret_key, public_key)
pub fn generate_keypair() -> Result<(BigUint, ECPoint), ElGamalError> {
    let sk = random_scalar();
    let pk = scalar_mul(&generator(), &sk);

    if !is_on_curve(&pk) {
        return Err(ElGamalError::InvalidKey);
    }

    Ok((sk, pk))
}

/// Encrypt a message (represented as a scalar)
///
/// Returns (C1, C2) where C1 = r*G and C2 = m*G + r*pk
pub fn encrypt(message: &BigUint, public_key: &ECPoint, randomness: &BigUint) -> (ECPoint, ECPoint) {
    let g = generator();

    // C1 = r * G
    let c1 = scalar_mul(&g, randomness);

    // M = m * G (encode message as curve point)
    let m_point = scalar_mul(&g, message);

    // r * pk
    let r_pk = scalar_mul(public_key, randomness);

    // C2 = M + r * pk
    let c2 = point_add(&m_point, &r_pk);

    (c1, c2)
}

/// Encrypt with fresh randomness
pub fn encrypt_fresh(message: &BigUint, public_key: &ECPoint) -> (ECPoint, ECPoint, BigUint) {
    let r = random_scalar();
    let (c1, c2) = encrypt(message, public_key, &r);
    (c1, c2, r)
}

/// Decrypt a ciphertext
///
/// Uses baby-step giant-step to solve ECDLP for small values.
/// Returns None if the message is too large.
pub fn decrypt(c1: &ECPoint, c2: &ECPoint, secret_key: &BigUint, max_value: u64) -> Option<u64> {
    // sk * C1
    let sk_c1 = scalar_mul(c1, secret_key);

    // M = C2 - sk*C1
    let m_point = point_add(c2, &point_neg(&sk_c1));

    // Now solve ECDLP: find m such that M = m * G
    baby_step_giant_step(&m_point, max_value)
}

/// Baby-step giant-step algorithm for ECDLP
///
/// Finds x such that P = x * G, where 0 <= x < max_value
fn baby_step_giant_step(target: &ECPoint, max_value: u64) -> Option<u64> {
    if target.is_identity() {
        return Some(0);
    }

    let g = generator();

    // m = ceil(sqrt(max_value))
    let m = ((max_value as f64).sqrt().ceil() as u64).max(1);

    // Baby step: compute table of i*G for i = 0..m
    let mut table: HashMap<(String, String), u64> = HashMap::new();
    let mut current = ECPoint::infinity();

    for i in 0..m {
        if !current.is_identity() {
            let key = (current.x.to_str_radix(16), current.y.to_str_radix(16));
            table.insert(key, i);
        } else if i == 0 {
            table.insert(("0".to_string(), "0".to_string()), 0);
        }
        current = point_add(&current, &g);
    }

    // Giant step: compute target - j*m*G for j = 0..m
    // m*G
    let m_g = scalar_mul(&g, &BigUint::from(m));
    let neg_m_g = point_neg(&m_g);

    let mut gamma = target.clone();

    for j in 0..m {
        if gamma.is_identity() {
            // Found: x = j * m
            return Some(j * m);
        }

        let key = (gamma.x.to_str_radix(16), gamma.y.to_str_radix(16));
        if let Some(&i) = table.get(&key) {
            // Found: target = i*G + j*m*G = (i + j*m)*G
            let result = i + j * m;
            if result < max_value {
                return Some(result);
            }
        }

        // gamma = target - (j+1)*m*G
        gamma = point_add(&gamma, &neg_m_g);
    }

    None
}

/// Re-randomize a ciphertext
///
/// Given ciphertext (C1, C2) encrypting m under pk,
/// returns a new ciphertext also encrypting m but with different randomness.
pub fn rerandomize(
    c1: &ECPoint,
    c2: &ECPoint,
    public_key: &ECPoint,
) -> (ECPoint, ECPoint, BigUint) {
    let r = random_scalar();
    let g = generator();

    // New C1 = old_C1 + r*G
    let new_c1 = point_add(c1, &scalar_mul(&g, &r));

    // New C2 = old_C2 + r*pk
    let new_c2 = point_add(c2, &scalar_mul(public_key, &r));

    (new_c1, new_c2, r)
}

/// Add two ciphertexts homomorphically
///
/// If (C1a, C2a) encrypts m1 and (C1b, C2b) encrypts m2,
/// the result encrypts m1 + m2.
pub fn homomorphic_add(
    c1a: &ECPoint, c2a: &ECPoint,
    c1b: &ECPoint, c2b: &ECPoint,
) -> (ECPoint, ECPoint) {
    let c1 = point_add(c1a, c1b);
    let c2 = point_add(c2a, c2b);
    (c1, c2)
}

/// Subtract two ciphertexts homomorphically
pub fn homomorphic_sub(
    c1a: &ECPoint, c2a: &ECPoint,
    c1b: &ECPoint, c2b: &ECPoint,
) -> (ECPoint, ECPoint) {
    let c1 = point_add(c1a, &point_neg(c1b));
    let c2 = point_add(c2a, &point_neg(c2b));
    (c1, c2)
}

/// Multiply a ciphertext by a scalar homomorphically
///
/// If (C1, C2) encrypts m, the result encrypts k*m.
pub fn homomorphic_scalar_mul(
    c1: &ECPoint, c2: &ECPoint,
    scalar: &BigUint,
) -> (ECPoint, ECPoint) {
    let new_c1 = scalar_mul(c1, scalar);
    let new_c2 = scalar_mul(c2, scalar);
    (new_c1, new_c2)
}

/// Create an encryption of zero (for use in re-randomization)
pub fn encrypt_zero(public_key: &ECPoint, randomness: &BigUint) -> (ECPoint, ECPoint) {
    let g = generator();

    // C1 = r * G
    let c1 = scalar_mul(&g, randomness);

    // C2 = r * pk (M = 0*G = infinity)
    let c2 = scalar_mul(public_key, randomness);

    (c1, c2)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_zero() {
        let (sk, pk) = generate_keypair().unwrap();
        let message = BigUint::zero();

        let (c1, c2, _) = encrypt_fresh(&message, &pk);
        let decrypted = decrypt(&c1, &c2, &sk, 1000).unwrap();

        assert_eq!(decrypted, 0);
    }

    #[test]
    fn test_encrypt_decrypt_small() {
        let (sk, pk) = generate_keypair().unwrap();
        let message = BigUint::from(42u32);

        let (c1, c2, _) = encrypt_fresh(&message, &pk);
        let decrypted = decrypt(&c1, &c2, &sk, 1000).unwrap();

        assert_eq!(decrypted, 42);
    }

    #[test]
    fn test_homomorphic_add() {
        let (sk, pk) = generate_keypair().unwrap();

        let m1 = BigUint::from(10u32);
        let m2 = BigUint::from(20u32);

        let (c1a, c2a, _) = encrypt_fresh(&m1, &pk);
        let (c1b, c2b, _) = encrypt_fresh(&m2, &pk);

        let (c1_sum, c2_sum) = homomorphic_add(&c1a, &c2a, &c1b, &c2b);

        let decrypted = decrypt(&c1_sum, &c2_sum, &sk, 1000).unwrap();
        assert_eq!(decrypted, 30);
    }

    #[test]
    fn test_rerandomize() {
        let (sk, pk) = generate_keypair().unwrap();
        let message = BigUint::from(100u32);

        let (c1, c2, _) = encrypt_fresh(&message, &pk);
        let (new_c1, new_c2, _) = rerandomize(&c1, &c2, &pk);

        // Ciphertexts should be different
        assert!(c1.x != new_c1.x || c1.y != new_c1.y);

        // But decrypt to same value
        let decrypted = decrypt(&new_c1, &new_c2, &sk, 1000).unwrap();
        assert_eq!(decrypted, 100);
    }
}
