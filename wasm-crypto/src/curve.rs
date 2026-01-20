//! STARK Curve Operations
//!
//! Elliptic curve arithmetic for the STARK curve used in Starknet.
//! The curve equation is: y² = x³ + α*x + β over F_p
//!
//! Parameters:
//! - Prime p = 0x800000000000011000000000000000000000000000000000000000000000001
//! - Generator G
//! - Order n (the number of points on the curve)

use num_bigint::BigUint;
use num_traits::{Zero, One, ToPrimitive};
use num_integer::Integer;
use rand::Rng;

lazy_static::lazy_static! {
    /// STARK curve field prime
    pub static ref FIELD_PRIME: BigUint = BigUint::parse_bytes(
        b"800000000000011000000000000000000000000000000000000000000000001",
        16
    ).unwrap();

    /// STARK curve order
    pub static ref CURVE_ORDER: BigUint = BigUint::parse_bytes(
        b"800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2f",
        16
    ).unwrap();

    /// STARK curve coefficient alpha
    pub static ref ALPHA: BigUint = BigUint::one();

    /// STARK curve coefficient beta
    pub static ref BETA: BigUint = BigUint::parse_bytes(
        b"6f21413efbe40de150e596d72f7a8c5609ad26c15c915c1f4cdfcb99cee9e89",
        16
    ).unwrap();

    /// Generator point G (x coordinate)
    pub static ref GEN_X: BigUint = BigUint::parse_bytes(
        b"1ef15c18599971b7beced415a40f0c7deacfd9b0d1819e03d723d8bc943cfca",
        16
    ).unwrap();

    /// Generator point G (y coordinate)
    pub static ref GEN_Y: BigUint = BigUint::parse_bytes(
        b"5668060aa49730b7be4801df46ec62de53ecd11abe43a32873000c36e8dc1f",
        16
    ).unwrap();
}

/// A point on the elliptic curve
#[derive(Clone, Debug, PartialEq)]
pub struct ECPoint {
    pub x: BigUint,
    pub y: BigUint,
    /// True if this is the point at infinity
    pub is_infinity: bool,
}

impl ECPoint {
    /// Create a new point
    pub fn new(x: BigUint, y: BigUint) -> Self {
        Self {
            x,
            y,
            is_infinity: false,
        }
    }

    /// Create the point at infinity (identity element)
    pub fn infinity() -> Self {
        Self {
            x: BigUint::zero(),
            y: BigUint::zero(),
            is_infinity: true,
        }
    }

    /// Check if point is at infinity
    pub fn is_identity(&self) -> bool {
        self.is_infinity
    }
}

/// Get the field prime
pub fn field_prime() -> BigUint {
    FIELD_PRIME.clone()
}

/// Get the curve order
pub fn curve_order() -> BigUint {
    CURVE_ORDER.clone()
}

/// Get the generator point
pub fn generator() -> ECPoint {
    ECPoint::new(GEN_X.clone(), GEN_Y.clone())
}

/// Generate a random scalar in [1, n-1]
pub fn random_scalar() -> BigUint {
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 32];
    rng.fill(&mut bytes);
    let scalar = BigUint::from_bytes_be(&bytes);
    // Reduce modulo curve order and ensure non-zero
    let reduced = &scalar % &*CURVE_ORDER;
    if reduced.is_zero() {
        BigUint::one()
    } else {
        reduced
    }
}

/// Modular inverse using extended Euclidean algorithm
fn mod_inverse(a: &BigUint, modulus: &BigUint) -> Option<BigUint> {
    if a.is_zero() {
        return None;
    }

    // Extended GCD
    let (gcd, x, _) = extended_gcd(a, modulus);

    if gcd != BigUint::one() {
        return None;
    }

    // x might be negative, convert to positive
    Some(x % modulus)
}

/// Extended Euclidean algorithm
fn extended_gcd(a: &BigUint, b: &BigUint) -> (BigUint, BigUint, BigUint) {
    if a.is_zero() {
        return (b.clone(), BigUint::zero(), BigUint::one());
    }

    let (gcd, x1, y1) = extended_gcd(&(b % a), a);

    // Update x and y
    let x = &y1 - &(&(b / a) * &x1);
    let y = x1;

    (gcd, x, y)
}

/// Point addition on the curve
pub fn point_add(p1: &ECPoint, p2: &ECPoint) -> ECPoint {
    // Handle identity cases
    if p1.is_identity() {
        return p2.clone();
    }
    if p2.is_identity() {
        return p1.clone();
    }

    // Check if points are additive inverses
    if p1.x == p2.x && (&FIELD_PRIME - &p1.y) % &*FIELD_PRIME == p2.y {
        return ECPoint::infinity();
    }

    let lambda = if p1 == p2 {
        // Point doubling: λ = (3x² + α) / 2y
        let numerator = (&(&BigUint::from(3u32) * &p1.x * &p1.x) + &*ALPHA) % &*FIELD_PRIME;
        let denominator = (&BigUint::from(2u32) * &p1.y) % &*FIELD_PRIME;
        let denom_inv = mod_inverse(&denominator, &FIELD_PRIME)
            .expect("Denominator should be invertible");
        (&numerator * &denom_inv) % &*FIELD_PRIME
    } else {
        // Point addition: λ = (y2 - y1) / (x2 - x1)
        let dy = if p2.y >= p1.y {
            &p2.y - &p1.y
        } else {
            &*FIELD_PRIME - &(&p1.y - &p2.y)
        };
        let dx = if p2.x >= p1.x {
            &p2.x - &p1.x
        } else {
            &*FIELD_PRIME - &(&p1.x - &p2.x)
        };
        let dx_inv = mod_inverse(&dx, &FIELD_PRIME)
            .expect("Denominator should be invertible");
        (&dy * &dx_inv) % &*FIELD_PRIME
    };

    // x3 = λ² - x1 - x2
    let x3 = {
        let lambda_sq = (&lambda * &lambda) % &*FIELD_PRIME;
        let sum_x = (&p1.x + &p2.x) % &*FIELD_PRIME;
        if lambda_sq >= sum_x {
            (&lambda_sq - &sum_x) % &*FIELD_PRIME
        } else {
            (&*FIELD_PRIME - &(&sum_x - &lambda_sq)) % &*FIELD_PRIME
        }
    };

    // y3 = λ(x1 - x3) - y1
    let y3 = {
        let dx = if p1.x >= x3 {
            &p1.x - &x3
        } else {
            &*FIELD_PRIME - &(&x3 - &p1.x)
        };
        let product = (&lambda * &dx) % &*FIELD_PRIME;
        if product >= p1.y {
            (&product - &p1.y) % &*FIELD_PRIME
        } else {
            (&*FIELD_PRIME - &(&p1.y - &product)) % &*FIELD_PRIME
        }
    };

    ECPoint::new(x3, y3)
}

/// Point negation: -P = (x, -y)
pub fn point_neg(p: &ECPoint) -> ECPoint {
    if p.is_identity() {
        return ECPoint::infinity();
    }
    ECPoint::new(
        p.x.clone(),
        (&*FIELD_PRIME - &p.y) % &*FIELD_PRIME,
    )
}

/// Scalar multiplication: k * P using double-and-add
pub fn scalar_mul(p: &ECPoint, k: &BigUint) -> ECPoint {
    if k.is_zero() || p.is_identity() {
        return ECPoint::infinity();
    }

    // Reduce k modulo curve order
    let k = k % &*CURVE_ORDER;
    if k.is_zero() {
        return ECPoint::infinity();
    }

    let mut result = ECPoint::infinity();
    let mut temp = p.clone();

    // Get bits of k
    let bits = k.bits();
    for i in 0..bits {
        if k.bit(i) {
            result = point_add(&result, &temp);
        }
        temp = point_add(&temp, &temp);
    }

    result
}

/// Check if a point is on the curve
pub fn is_on_curve(p: &ECPoint) -> bool {
    if p.is_identity() {
        return true;
    }

    // Check y² = x³ + αx + β (mod p)
    let y_sq = (&p.y * &p.y) % &*FIELD_PRIME;
    let x_cubed = (&p.x * &p.x * &p.x) % &*FIELD_PRIME;
    let alpha_x = (&*ALPHA * &p.x) % &*FIELD_PRIME;
    let rhs = (&x_cubed + &alpha_x + &*BETA) % &*FIELD_PRIME;

    y_sq == rhs
}

/// Point subtraction: P - Q = P + (-Q)
pub fn point_sub(p1: &ECPoint, p2: &ECPoint) -> ECPoint {
    point_add(p1, &point_neg(p2))
}

/// Compare two points for equality
pub fn point_eq(p1: &ECPoint, p2: &ECPoint) -> bool {
    if p1.is_identity() && p2.is_identity() {
        return true;
    }
    if p1.is_identity() || p2.is_identity() {
        return false;
    }
    p1.x == p2.x && p1.y == p2.y
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generator_on_curve() {
        let g = generator();
        assert!(is_on_curve(&g));
    }

    #[test]
    fn test_point_add_identity() {
        let g = generator();
        let inf = ECPoint::infinity();

        let result = point_add(&g, &inf);
        assert_eq!(result.x, g.x);
        assert_eq!(result.y, g.y);
    }

    #[test]
    fn test_scalar_mul_identity() {
        let g = generator();
        let result = scalar_mul(&g, &BigUint::zero());
        assert!(result.is_identity());
    }

    #[test]
    fn test_scalar_mul_one() {
        let g = generator();
        let result = scalar_mul(&g, &BigUint::one());
        assert_eq!(result.x, g.x);
        assert_eq!(result.y, g.y);
    }

    #[test]
    fn test_point_negate() {
        let g = generator();
        let neg_g = point_neg(&g);
        let sum = point_add(&g, &neg_g);
        assert!(sum.is_identity());
    }
}
