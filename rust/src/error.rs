//! # SDK Error Types
//!
//! Error types for the BitSage SDK.

use thiserror::Error;

/// SDK Result type
pub type SdkResult<T> = Result<T, SdkError>;

/// SDK Error type
#[derive(Error, Debug)]
pub enum SdkError {
    /// Configuration error
    #[error("Configuration error: {0}")]
    Config(String),

    /// HTTP client error
    #[error("HTTP error: {0}")]
    Http(String),

    /// API error
    #[error("API error: {0}")]
    Api(String),

    /// Resource not found
    #[error("Not found: {0}")]
    NotFound(String),

    /// Deserialization error
    #[error("Deserialization error: {0}")]
    Deserialization(String),

    /// Serialization error
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// Timeout error
    #[error("Timeout: {0}")]
    Timeout(String),

    /// Job failed
    #[error("Job failed: {0}")]
    JobFailed(String),

    /// Job cancelled
    #[error("Job cancelled: {0}")]
    JobCancelled(String),

    /// Job timeout
    #[error("Job timeout: {0}")]
    JobTimeout(String),

    /// Authentication error
    #[error("Authentication error: {0}")]
    Auth(String),

    /// Rate limit exceeded
    #[error("Rate limit exceeded: {0}")]
    RateLimit(String),

    /// Insufficient funds
    #[error("Insufficient funds: {0}")]
    InsufficientFunds(String),

    /// Starknet error
    #[error("Starknet error: {0}")]
    Starknet(String),
}
