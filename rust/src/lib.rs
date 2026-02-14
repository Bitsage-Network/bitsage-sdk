//! # BitSage SDK
//!
//! Official Rust SDK for interacting with the BitSage Network.
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use bitsage_sdk::{BitSageClient, ClientConfig, JobType, SubmitJobRequest};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     // Create client with default config (Sepolia testnet)
//!     let client = BitSageClient::default_client()?;
//!
//!     // Submit an AI inference job
//!     let request = SubmitJobRequest::new(
//!         JobType::AiInference {
//!             model_type: "llama-7b".to_string(),
//!             batch_size: 1,
//!         },
//!         "base64_encoded_input_data".to_string(),
//!     )
//!     .with_max_cost(100)
//!     .with_priority(5);
//!
//!     let response = client.submit_job(request).await?;
//!     println!("Job submitted: {}", response.job_id);
//!
//!     // Wait for completion
//!     let result = client.jobs().wait_for_completion(
//!         response.job_id,
//!         1000,  // poll every 1s
//!         3600,  // timeout after 1 hour
//!     ).await?;
//!
//!     println!("Job completed in {}s", result.execution_time_secs);
//!     Ok(())
//! }
//! ```
//!
//! ## Features
//!
//! - **Job Management**: Submit, monitor, and cancel compute jobs
//! - **Worker Discovery**: Find available workers by capabilities
//! - **Proof Verification**: Verify ZK proofs on-chain
//! - **Staking**: Stake SAGE tokens and claim rewards
//! - **Faucet**: Claim testnet tokens (Sepolia only)

pub mod client;
pub mod error;
pub mod jobs;
pub mod proofs;
pub mod types;
pub mod workers;
pub mod zkml;
pub mod zkml_types;

// Re-export main types
pub use client::{
    BitSageClient, ClientConfig, FaucetClaimResponse, JobStatusResponse, ListJobsParams,
    ListJobsResponse, Network, WalletConfig,
};
pub use error::{SdkError, SdkResult};
pub use jobs::{JobResult, JobsClient, SubmitJobRequest, SubmitJobResponse};
pub use proofs::ProofsClient;
pub use types::{
    FaucetStatus, GpuTier, JobId, JobStatus, JobType, NetworkStats, ProofDetails,
    ProofVerificationStatus, StakeInfo, WorkerCapabilities, WorkerId, WorkerInfo, WorkerStatus,
};
pub use workers::WorkersClient;
pub use zkml::{ZkmlProverClient, ZkmlProverConfig, ZkmlVerifierClient, ZkmlVerifierConfig};
pub use zkml_types::{
    HealthResponse as ZkmlHealthResponse, LoadModelRequest as ZkmlLoadModelRequest,
    ModelInfoResponse as ZkmlModelInfoResponse, ProveResultResponse as ZkmlProveResultResponse,
    ProveStatusResponse as ZkmlProveStatusResponse, ZkmlJobStatus, ZkmlProveRequest,
};
