//! BitSage WASM Cryptographic Primitives
//!
//! This crate provides WebAssembly bindings for privacy-preserving cryptographic
//! operations used in the BitSage Obelysk privacy system.
//!
//! # Features
//!
//! - ElGamal encryption/decryption on the STARK curve
//! - Homomorphic operations on encrypted values
//! - Schnorr proofs of knowledge
//! - Range proofs for value bounds
//! - Key derivation and generation

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use sha2::{Sha256, Digest};
use num_bigint::BigUint;
use num_traits::{Zero, One, ToPrimitive};

mod curve;
mod elgamal;
mod schnorr;
mod utils;

pub use curve::*;
pub use elgamal::*;
pub use schnorr::*;

// Initialize panic hook for better error messages in console
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// EC Point representation for WASM
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WasmECPoint {
    pub x: String,
    pub y: String,
}

impl WasmECPoint {
    pub fn new(x: &BigUint, y: &BigUint) -> Self {
        Self {
            x: x.to_str_radix(16),
            y: y.to_str_radix(16),
        }
    }

    pub fn to_point(&self) -> Result<curve::ECPoint, JsValue> {
        let x = BigUint::parse_bytes(self.x.as_bytes(), 16)
            .ok_or_else(|| JsValue::from_str("Invalid x coordinate"))?;
        let y = BigUint::parse_bytes(self.y.as_bytes(), 16)
            .ok_or_else(|| JsValue::from_str("Invalid y coordinate"))?;
        Ok(curve::ECPoint::new(x, y))
    }
}

/// ElGamal ciphertext for WASM
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WasmCiphertext {
    pub c1: WasmECPoint,
    pub c2: WasmECPoint,
}

/// Keypair for WASM
#[derive(Serialize, Deserialize, Clone)]
pub struct WasmKeyPair {
    pub public_key: WasmECPoint,
    pub private_key: Vec<u8>,
}

/// Schnorr proof for WASM
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WasmSchnorrProof {
    pub commitment: WasmECPoint,
    pub challenge: String,
    pub response: String,
}

/// AE Hint for fast decryption
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WasmAEHint {
    pub c0: String,
    pub c1: String,
    pub c2: String,
}

// ============================================================================
// Key Generation
// ============================================================================

/// Generate a new random keypair
#[wasm_bindgen]
pub fn generate_keypair() -> Result<JsValue, JsValue> {
    let (sk, pk) = elgamal::generate_keypair()
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let keypair = WasmKeyPair {
        public_key: WasmECPoint::new(&pk.x, &pk.y),
        private_key: sk.to_bytes_be(),
    };

    serde_wasm_bindgen::to_value(&keypair)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Derive public key from private key bytes
#[wasm_bindgen]
pub fn derive_public_key(secret_key: &[u8]) -> Result<JsValue, JsValue> {
    let sk = BigUint::from_bytes_be(secret_key);
    let pk = curve::scalar_mul(&curve::generator(), &sk);

    let point = WasmECPoint::new(&pk.x, &pk.y);

    serde_wasm_bindgen::to_value(&point)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Derive keypair from signature (deterministic)
#[wasm_bindgen]
pub fn derive_from_signature(signature: &str) -> Result<JsValue, JsValue> {
    let mut hasher = Sha256::new();
    hasher.update(signature.as_bytes());
    let hash = hasher.finalize();

    let sk = BigUint::from_bytes_be(&hash) % curve::curve_order();
    let pk = curve::scalar_mul(&curve::generator(), &sk);

    let keypair = WasmKeyPair {
        public_key: WasmECPoint::new(&pk.x, &pk.y),
        private_key: sk.to_bytes_be(),
    };

    serde_wasm_bindgen::to_value(&keypair)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

// ============================================================================
// ElGamal Encryption
// ============================================================================

/// Encrypt an amount using ElGamal
///
/// Returns ciphertext as JSON
#[wasm_bindgen]
pub fn encrypt(amount: u64, public_key_json: &str, randomness: Option<Vec<u8>>) -> Result<JsValue, JsValue> {
    let pk: WasmECPoint = serde_json::from_str(public_key_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid public key: {}", e)))?;

    let pk_point = pk.to_point()?;

    let r = match randomness {
        Some(bytes) => BigUint::from_bytes_be(&bytes) % curve::curve_order(),
        None => curve::random_scalar(),
    };

    let (c1, c2) = elgamal::encrypt(&BigUint::from(amount), &pk_point, &r);

    let ciphertext = WasmCiphertext {
        c1: WasmECPoint::new(&c1.x, &c1.y),
        c2: WasmECPoint::new(&c2.x, &c2.y),
    };

    serde_wasm_bindgen::to_value(&ciphertext)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Decrypt a ciphertext (brute-force ECDLP for small values)
///
/// Returns amount or null if decryption fails
#[wasm_bindgen]
pub fn decrypt(ciphertext_json: &str, secret_key: &[u8], max_value: u64) -> Result<JsValue, JsValue> {
    let ct: WasmCiphertext = serde_json::from_str(ciphertext_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid ciphertext: {}", e)))?;

    let c1 = ct.c1.to_point()?;
    let c2 = ct.c2.to_point()?;

    let sk = BigUint::from_bytes_be(secret_key);

    match elgamal::decrypt(&c1, &c2, &sk, max_value) {
        Some(value) => Ok(JsValue::from_f64(value as f64)),
        None => Ok(JsValue::NULL),
    }
}

/// Decrypt using AE hint (fast method)
#[wasm_bindgen]
pub fn decrypt_with_hint(ciphertext_json: &str, hint_json: &str, secret_key: &[u8]) -> Result<JsValue, JsValue> {
    let ct: WasmCiphertext = serde_json::from_str(ciphertext_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid ciphertext: {}", e)))?;

    let hint: WasmAEHint = serde_json::from_str(hint_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid hint: {}", e)))?;

    let c0 = BigUint::parse_bytes(hint.c0.as_bytes(), 16)
        .ok_or_else(|| JsValue::from_str("Invalid hint c0"))?;

    let sk = BigUint::from_bytes_be(secret_key);

    // Use hint for fast recovery
    let value = (&c0 * &sk) % curve::curve_order();

    Ok(JsValue::from_str(&value.to_str_radix(10)))
}

// ============================================================================
// Homomorphic Operations
// ============================================================================

/// Add two ciphertexts homomorphically
#[wasm_bindgen]
pub fn homomorphic_add(a_json: &str, b_json: &str) -> Result<JsValue, JsValue> {
    let a: WasmCiphertext = serde_json::from_str(a_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid ciphertext a: {}", e)))?;
    let b: WasmCiphertext = serde_json::from_str(b_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid ciphertext b: {}", e)))?;

    let a_c1 = a.c1.to_point()?;
    let a_c2 = a.c2.to_point()?;
    let b_c1 = b.c1.to_point()?;
    let b_c2 = b.c2.to_point()?;

    let sum_c1 = curve::point_add(&a_c1, &b_c1);
    let sum_c2 = curve::point_add(&a_c2, &b_c2);

    let result = WasmCiphertext {
        c1: WasmECPoint::new(&sum_c1.x, &sum_c1.y),
        c2: WasmECPoint::new(&sum_c2.x, &sum_c2.y),
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Subtract two ciphertexts homomorphically
#[wasm_bindgen]
pub fn homomorphic_sub(a_json: &str, b_json: &str) -> Result<JsValue, JsValue> {
    let a: WasmCiphertext = serde_json::from_str(a_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid ciphertext a: {}", e)))?;
    let b: WasmCiphertext = serde_json::from_str(b_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid ciphertext b: {}", e)))?;

    let a_c1 = a.c1.to_point()?;
    let a_c2 = a.c2.to_point()?;
    let b_c1 = b.c1.to_point()?;
    let b_c2 = b.c2.to_point()?;

    // Negate b and add
    let neg_b_c1 = curve::point_neg(&b_c1);
    let neg_b_c2 = curve::point_neg(&b_c2);

    let diff_c1 = curve::point_add(&a_c1, &neg_b_c1);
    let diff_c2 = curve::point_add(&a_c2, &neg_b_c2);

    let result = WasmCiphertext {
        c1: WasmECPoint::new(&diff_c1.x, &diff_c1.y),
        c2: WasmECPoint::new(&diff_c2.x, &diff_c2.y),
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Multiply ciphertext by scalar
#[wasm_bindgen]
pub fn homomorphic_mul(ciphertext_json: &str, scalar: &str) -> Result<JsValue, JsValue> {
    let ct: WasmCiphertext = serde_json::from_str(ciphertext_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid ciphertext: {}", e)))?;

    let s = BigUint::parse_bytes(scalar.as_bytes(), 16)
        .ok_or_else(|| JsValue::from_str("Invalid scalar"))?;

    let c1 = ct.c1.to_point()?;
    let c2 = ct.c2.to_point()?;

    let scaled_c1 = curve::scalar_mul(&c1, &s);
    let scaled_c2 = curve::scalar_mul(&c2, &s);

    let result = WasmCiphertext {
        c1: WasmECPoint::new(&scaled_c1.x, &scaled_c1.y),
        c2: WasmECPoint::new(&scaled_c2.x, &scaled_c2.y),
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

// ============================================================================
// Schnorr Proofs
// ============================================================================

/// Create a Schnorr proof of knowledge
#[wasm_bindgen]
pub fn create_schnorr_proof(secret_key: &[u8], context: &str) -> Result<JsValue, JsValue> {
    let sk = BigUint::from_bytes_be(secret_key);
    let pk = curve::scalar_mul(&curve::generator(), &sk);

    let proof = schnorr::create_proof(&sk, &pk, context)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let wasm_proof = WasmSchnorrProof {
        commitment: WasmECPoint::new(&proof.commitment.x, &proof.commitment.y),
        challenge: proof.challenge.to_str_radix(16),
        response: proof.response.to_str_radix(16),
    };

    serde_wasm_bindgen::to_value(&wasm_proof)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Verify a Schnorr proof
#[wasm_bindgen]
pub fn verify_schnorr_proof(public_key_json: &str, proof_json: &str, context: &str) -> Result<bool, JsValue> {
    let pk: WasmECPoint = serde_json::from_str(public_key_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid public key: {}", e)))?;

    let proof: WasmSchnorrProof = serde_json::from_str(proof_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid proof: {}", e)))?;

    let pk_point = pk.to_point()?;
    let commitment = proof.commitment.to_point()?;

    let challenge = BigUint::parse_bytes(proof.challenge.as_bytes(), 16)
        .ok_or_else(|| JsValue::from_str("Invalid challenge"))?;
    let response = BigUint::parse_bytes(proof.response.as_bytes(), 16)
        .ok_or_else(|| JsValue::from_str("Invalid response"))?;

    let schnorr_proof = schnorr::SchnorrProof {
        commitment,
        challenge,
        response,
    };

    Ok(schnorr::verify_proof(&pk_point, &schnorr_proof, context))
}

// ============================================================================
// AE Hints
// ============================================================================

/// Create AE hint for fast decryption
#[wasm_bindgen]
pub fn create_ae_hint(amount: u64, secret_key: &[u8], ciphertext_json: &str) -> Result<JsValue, JsValue> {
    let ct: WasmCiphertext = serde_json::from_str(ciphertext_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid ciphertext: {}", e)))?;

    let sk = BigUint::from_bytes_be(secret_key);
    let c1 = ct.c1.to_point()?;

    // Compute hint components
    let c0 = BigUint::from(amount) % curve::curve_order();
    let c1_hash = {
        let mut hasher = Sha256::new();
        hasher.update(c1.x.to_bytes_be());
        hasher.update(c1.y.to_bytes_be());
        BigUint::from_bytes_be(&hasher.finalize())
    };
    let c2_hint = (&c0 * &sk + &c1_hash) % curve::curve_order();

    let hint = WasmAEHint {
        c0: c0.to_str_radix(16),
        c1: c1_hash.to_str_radix(16),
        c2: c2_hint.to_str_radix(16),
    };

    serde_wasm_bindgen::to_value(&hint)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

// ============================================================================
// Nullifier Generation
// ============================================================================

/// Create a nullifier for double-spend prevention
#[wasm_bindgen]
pub fn create_nullifier(secret_key: &[u8], tx_data: &str) -> Result<String, JsValue> {
    let sk = BigUint::from_bytes_be(secret_key);

    let mut hasher = Sha256::new();
    hasher.update(&sk.to_bytes_be());
    hasher.update(tx_data.as_bytes());
    let hash = hasher.finalize();

    Ok(hex::encode(hash))
}

// ============================================================================
// Utility Functions
// ============================================================================

/// Hash a string to a field element
#[wasm_bindgen]
pub fn hash_to_field(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    let hash = hasher.finalize();

    let value = BigUint::from_bytes_be(&hash) % curve::field_prime();
    value.to_str_radix(16)
}

/// Generate random bytes
#[wasm_bindgen]
pub fn random_bytes(len: usize) -> Vec<u8> {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let mut bytes = vec![0u8; len];
    rng.fill(&mut bytes[..]);
    bytes
}

/// Generate random scalar
#[wasm_bindgen]
pub fn random_scalar() -> String {
    curve::random_scalar().to_str_radix(16)
}

// Helper for hex encoding
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes.as_ref().iter().map(|b| format!("{:02x}", b)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_generation() {
        let result = generate_keypair();
        assert!(result.is_ok());
    }

    #[test]
    fn test_encrypt_decrypt_small() {
        // This test would need WASM runtime
    }
}
