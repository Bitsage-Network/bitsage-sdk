//! Utility functions for WASM crypto operations

use sha2::{Sha256, Digest};
use num_bigint::BigUint;

/// Hash arbitrary data to a field element
pub fn hash_to_field(data: &[u8], modulus: &BigUint) -> BigUint {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let hash = hasher.finalize();
    BigUint::from_bytes_be(&hash) % modulus
}

/// Hash multiple values together
pub fn hash_concat(values: &[&[u8]], modulus: &BigUint) -> BigUint {
    let mut hasher = Sha256::new();
    for value in values {
        hasher.update(value);
    }
    let hash = hasher.finalize();
    BigUint::from_bytes_be(&hash) % modulus
}

/// Convert bytes to hex string
pub fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Convert hex string to bytes
pub fn hex_to_bytes(hex: &str) -> Option<Vec<u8>> {
    let hex = hex.strip_prefix("0x").unwrap_or(hex);

    if hex.len() % 2 != 0 {
        return None;
    }

    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok())
        .collect()
}

/// Zero-pad bytes to specified length
pub fn pad_bytes(bytes: &[u8], length: usize) -> Vec<u8> {
    if bytes.len() >= length {
        return bytes.to_vec();
    }

    let mut result = vec![0u8; length - bytes.len()];
    result.extend_from_slice(bytes);
    result
}

/// BigUint to 32-byte array (big-endian)
pub fn biguint_to_bytes32(value: &BigUint) -> [u8; 32] {
    let bytes = value.to_bytes_be();
    let mut result = [0u8; 32];

    let offset = 32usize.saturating_sub(bytes.len());
    let copy_len = bytes.len().min(32);

    result[offset..offset + copy_len].copy_from_slice(&bytes[bytes.len() - copy_len..]);
    result
}

/// Constant-time comparison (prevents timing attacks)
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bytes_to_hex() {
        let bytes = [0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef];
        assert_eq!(bytes_to_hex(&bytes), "0123456789abcdef");
    }

    #[test]
    fn test_hex_to_bytes() {
        let hex = "0123456789abcdef";
        let bytes = hex_to_bytes(hex).unwrap();
        assert_eq!(bytes, vec![0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]);
    }

    #[test]
    fn test_hex_with_prefix() {
        let hex = "0x1234";
        let bytes = hex_to_bytes(hex).unwrap();
        assert_eq!(bytes, vec![0x12, 0x34]);
    }

    #[test]
    fn test_constant_time_eq() {
        let a = [1, 2, 3, 4];
        let b = [1, 2, 3, 4];
        let c = [1, 2, 3, 5];

        assert!(constant_time_eq(&a, &b));
        assert!(!constant_time_eq(&a, &c));
    }
}
