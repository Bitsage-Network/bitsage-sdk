//! Schnorr Proofs
//!
//! Zero-knowledge Schnorr proofs of knowledge for discrete logarithm.
//!
//! Given a public key P = x*G, the prover can demonstrate knowledge
//! of the secret key x without revealing it.
//!
//! Protocol (Fiat-Shamir heuristic):
//! 1. Prover: Generate random k, compute R = k*G
//! 2. Compute challenge c = H(R || P || context)
//! 3. Compute response s = k + c*x (mod n)
//! 4. Verifier: Check s*G == R + c*P

use num_bigint::BigUint;
use num_traits::{Zero, One};
use sha2::{Sha256, Digest};

use crate::curve::{
    ECPoint, generator, random_scalar, scalar_mul, point_add, curve_order,
};

/// Schnorr proof structure
#[derive(Clone, Debug)]
pub struct SchnorrProof {
    /// Commitment R = k*G
    pub commitment: ECPoint,
    /// Challenge c = H(R || P || context)
    pub challenge: BigUint,
    /// Response s = k + c*x
    pub response: BigUint,
}

/// Schnorr proof error
#[derive(Debug)]
pub enum SchnorrError {
    InvalidProof,
    InvalidInput,
}

impl std::fmt::Display for SchnorrError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SchnorrError::InvalidProof => write!(f, "Invalid Schnorr proof"),
            SchnorrError::InvalidInput => write!(f, "Invalid input"),
        }
    }
}

impl std::error::Error for SchnorrError {}

/// Create a Schnorr proof of knowledge of discrete log
///
/// Proves knowledge of x such that P = x*G
pub fn create_proof(
    secret_key: &BigUint,
    public_key: &ECPoint,
    context: &str,
) -> Result<SchnorrProof, SchnorrError> {
    let n = curve_order();
    let g = generator();

    // Generate random nonce k
    let k = random_scalar();

    // Commitment R = k * G
    let commitment = scalar_mul(&g, &k);

    // Challenge c = H(R || P || context)
    let challenge = compute_challenge(&commitment, public_key, context);

    // Response s = k + c * x (mod n)
    let cx = (&challenge * secret_key) % &n;
    let response = (&k + &cx) % &n;

    Ok(SchnorrProof {
        commitment,
        challenge,
        response,
    })
}

/// Verify a Schnorr proof
///
/// Checks that s*G == R + c*P
pub fn verify_proof(
    public_key: &ECPoint,
    proof: &SchnorrProof,
    context: &str,
) -> bool {
    let g = generator();

    // Recompute challenge
    let expected_challenge = compute_challenge(&proof.commitment, public_key, context);

    // Check challenge matches
    if proof.challenge != expected_challenge {
        return false;
    }

    // Compute s * G
    let s_g = scalar_mul(&g, &proof.response);

    // Compute R + c * P
    let c_p = scalar_mul(public_key, &proof.challenge);
    let r_plus_cp = point_add(&proof.commitment, &c_p);

    // Verify s*G == R + c*P
    s_g.x == r_plus_cp.x && s_g.y == r_plus_cp.y
}

/// Compute Fiat-Shamir challenge
fn compute_challenge(
    commitment: &ECPoint,
    public_key: &ECPoint,
    context: &str,
) -> BigUint {
    let mut hasher = Sha256::new();

    // Hash commitment point
    hasher.update(&commitment.x.to_bytes_be());
    hasher.update(&commitment.y.to_bytes_be());

    // Hash public key
    hasher.update(&public_key.x.to_bytes_be());
    hasher.update(&public_key.y.to_bytes_be());

    // Hash context
    hasher.update(context.as_bytes());

    let hash = hasher.finalize();

    // Convert hash to scalar
    BigUint::from_bytes_be(&hash) % curve_order()
}

/// Batch verify multiple Schnorr proofs
///
/// More efficient than verifying individually due to multi-scalar multiplication.
pub fn batch_verify(
    proofs: &[(ECPoint, SchnorrProof, String)],
) -> bool {
    // For simplicity, just verify individually
    // A proper implementation would use batch multi-scalar multiplication
    for (public_key, proof, context) in proofs {
        if !verify_proof(public_key, proof, context) {
            return false;
        }
    }
    true
}

/// Create a linked Schnorr proof (for same key across multiple statements)
///
/// Proves knowledge of x such that P1 = x*G1 and P2 = x*G2
pub fn create_linked_proof(
    secret_key: &BigUint,
    base1: &ECPoint,
    result1: &ECPoint,
    base2: &ECPoint,
    result2: &ECPoint,
    context: &str,
) -> Result<LinkedSchnorrProof, SchnorrError> {
    let n = curve_order();

    // Generate random nonce k
    let k = random_scalar();

    // Commitments R1 = k * G1, R2 = k * G2
    let commitment1 = scalar_mul(base1, &k);
    let commitment2 = scalar_mul(base2, &k);

    // Challenge c = H(R1 || R2 || P1 || P2 || context)
    let challenge = compute_linked_challenge(
        &commitment1, &commitment2,
        result1, result2,
        context,
    );

    // Response s = k + c * x (mod n)
    let cx = (&challenge * secret_key) % &n;
    let response = (&k + &cx) % &n;

    Ok(LinkedSchnorrProof {
        commitment1,
        commitment2,
        challenge,
        response,
    })
}

/// Linked Schnorr proof structure
#[derive(Clone, Debug)]
pub struct LinkedSchnorrProof {
    pub commitment1: ECPoint,
    pub commitment2: ECPoint,
    pub challenge: BigUint,
    pub response: BigUint,
}

/// Verify a linked Schnorr proof
pub fn verify_linked_proof(
    base1: &ECPoint,
    result1: &ECPoint,
    base2: &ECPoint,
    result2: &ECPoint,
    proof: &LinkedSchnorrProof,
    context: &str,
) -> bool {
    // Recompute challenge
    let expected_challenge = compute_linked_challenge(
        &proof.commitment1, &proof.commitment2,
        result1, result2,
        context,
    );

    if proof.challenge != expected_challenge {
        return false;
    }

    // Verify s * G1 == R1 + c * P1
    let s_g1 = scalar_mul(base1, &proof.response);
    let c_p1 = scalar_mul(result1, &proof.challenge);
    let r1_plus_cp1 = point_add(&proof.commitment1, &c_p1);

    if s_g1.x != r1_plus_cp1.x || s_g1.y != r1_plus_cp1.y {
        return false;
    }

    // Verify s * G2 == R2 + c * P2
    let s_g2 = scalar_mul(base2, &proof.response);
    let c_p2 = scalar_mul(result2, &proof.challenge);
    let r2_plus_cp2 = point_add(&proof.commitment2, &c_p2);

    s_g2.x == r2_plus_cp2.x && s_g2.y == r2_plus_cp2.y
}

fn compute_linked_challenge(
    commitment1: &ECPoint,
    commitment2: &ECPoint,
    result1: &ECPoint,
    result2: &ECPoint,
    context: &str,
) -> BigUint {
    let mut hasher = Sha256::new();

    hasher.update(&commitment1.x.to_bytes_be());
    hasher.update(&commitment1.y.to_bytes_be());
    hasher.update(&commitment2.x.to_bytes_be());
    hasher.update(&commitment2.y.to_bytes_be());
    hasher.update(&result1.x.to_bytes_be());
    hasher.update(&result1.y.to_bytes_be());
    hasher.update(&result2.x.to_bytes_be());
    hasher.update(&result2.y.to_bytes_be());
    hasher.update(context.as_bytes());

    let hash = hasher.finalize();
    BigUint::from_bytes_be(&hash) % curve_order()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::curve::generator;

    #[test]
    fn test_schnorr_proof_valid() {
        let sk = random_scalar();
        let pk = scalar_mul(&generator(), &sk);

        let proof = create_proof(&sk, &pk, "test").unwrap();
        assert!(verify_proof(&pk, &proof, "test"));
    }

    #[test]
    fn test_schnorr_proof_wrong_context() {
        let sk = random_scalar();
        let pk = scalar_mul(&generator(), &sk);

        let proof = create_proof(&sk, &pk, "test").unwrap();
        assert!(!verify_proof(&pk, &proof, "wrong"));
    }

    #[test]
    fn test_schnorr_proof_wrong_key() {
        let sk = random_scalar();
        let pk = scalar_mul(&generator(), &sk);

        let proof = create_proof(&sk, &pk, "test").unwrap();

        // Different key
        let wrong_pk = scalar_mul(&generator(), &random_scalar());
        assert!(!verify_proof(&wrong_pk, &proof, "test"));
    }

    #[test]
    fn test_batch_verify() {
        let mut proofs = Vec::new();

        for _ in 0..5 {
            let sk = random_scalar();
            let pk = scalar_mul(&generator(), &sk);
            let context = "batch_test".to_string();
            let proof = create_proof(&sk, &pk, &context).unwrap();
            proofs.push((pk, proof, context));
        }

        assert!(batch_verify(&proofs));
    }
}
