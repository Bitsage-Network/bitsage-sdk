//! # ZKML Prover and Verifier Clients
//!
//! Provides [`ZkmlProverClient`] for interacting with the prove-server REST API,
//! and [`ZkmlVerifierClient`] for reading on-chain verification state from Starknet.
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use bitsage_sdk::zkml::ZkmlProverClient;
//! use bitsage_sdk::zkml_types::ZkmlProveRequest;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let prover = ZkmlProverClient::default()?;
//!     let result = prover.prove("model-id", true, 600).await?;
//!     println!("Calldata: {} felts", result.calldata.len());
//!     Ok(())
//! }
//! ```

use std::sync::Arc;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use tracing::{debug, info};

use crate::error::{SdkError, SdkResult};
use crate::zkml_types::*;

/// Default prove-server URL.
const DEFAULT_PROVER_URL: &str = "http://localhost:8080";

/// Default StweMlStarkVerifier address on Starknet Sepolia.
const DEFAULT_VERIFIER_ADDRESS: &str =
    "0x005928ac548dc2719ef1b34869db2b61c2a55a4b148012fad742262a8d674fba";

/// Default Starknet Sepolia RPC URL.
const DEFAULT_RPC_URL: &str = "https://starknet-sepolia.public.blastapi.io";

/// Configuration for the ZKML prover client.
#[derive(Debug, Clone)]
pub struct ZkmlProverConfig {
    /// Base URL of the prove-server (e.g., "http://localhost:8080").
    pub prover_url: String,
    /// Request timeout.
    pub timeout: Duration,
}

impl Default for ZkmlProverConfig {
    fn default() -> Self {
        Self {
            prover_url: std::env::var("BITSAGE_PROVER_URL")
                .unwrap_or_else(|_| DEFAULT_PROVER_URL.to_string()),
            timeout: Duration::from_secs(300),
        }
    }
}

/// Async client for the BitSage ZKML prove-server REST API.
pub struct ZkmlProverClient {
    http_client: Arc<reqwest::Client>,
    prover_url: String,
}

impl ZkmlProverClient {
    /// Create a new ZKML prover client with default configuration.
    pub fn default() -> SdkResult<Self> {
        Self::new(ZkmlProverConfig::default())
    }

    /// Create a new ZKML prover client with custom configuration.
    pub fn new(config: ZkmlProverConfig) -> SdkResult<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let http_client = reqwest::Client::builder()
            .timeout(config.timeout)
            .default_headers(headers)
            .build()
            .map_err(|e| SdkError::Http(e.to_string()))?;

        Ok(Self {
            http_client: Arc::new(http_client),
            prover_url: config.prover_url,
        })
    }

    /// GET /health — Check prover server health.
    pub async fn health(&self) -> SdkResult<HealthResponse> {
        let url = format!("{}/health", self.prover_url);
        debug!("Health check: {}", url);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Health check failed: {}",
                response.status()
            )));
        }

        response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// POST /api/v1/models — Load a model for proving.
    pub async fn load_model(&self, request: LoadModelRequest) -> SdkResult<ModelInfoResponse> {
        let url = format!("{}/api/v1/models", self.prover_url);
        debug!("Loading model: {}", request.model_path);

        let response = self
            .http_client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(SdkError::Api(format!("Failed to load model: {}", error_text)));
        }

        let result: ModelInfoResponse = response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))?;

        info!("Model loaded: {}", result.model_id);
        Ok(result)
    }

    /// GET /api/v1/models/{id} — Get model info.
    pub async fn get_model(&self, model_id: &str) -> SdkResult<ModelInfoResponse> {
        let url = format!("{}/api/v1/models/{}", self.prover_url, model_id);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(SdkError::NotFound(format!("Model '{}' not found", model_id)));
        }

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to get model info: {}",
                response.status()
            )));
        }

        response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// POST /api/v1/prove — Submit a proving job.
    pub async fn submit_prove(
        &self,
        request: ZkmlProveRequest,
    ) -> SdkResult<ProveSubmitResponse> {
        let url = format!("{}/api/v1/prove", self.prover_url);
        debug!("Submitting prove job for model: {}", request.model_id);

        let response = self
            .http_client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(SdkError::Api(format!(
                "Failed to submit prove job: {}",
                error_text
            )));
        }

        let result: ProveSubmitResponse = response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))?;

        info!("Prove job submitted: {}", result.job_id);
        Ok(result)
    }

    /// GET /api/v1/prove/{id} — Get proving job status.
    pub async fn get_prove_status(&self, job_id: &str) -> SdkResult<ProveStatusResponse> {
        let url = format!("{}/api/v1/prove/{}", self.prover_url, job_id);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(SdkError::NotFound(format!("Job '{}' not found", job_id)));
        }

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to get prove status: {}",
                response.status()
            )));
        }

        response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// GET /api/v1/prove/{id}/result — Get completed proof result.
    pub async fn get_prove_result(&self, job_id: &str) -> SdkResult<ProveResultResponse> {
        let url = format!("{}/api/v1/prove/{}/result", self.prover_url, job_id);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(SdkError::NotFound(format!("Job '{}' not found", job_id)));
        }

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(SdkError::Api(format!(
                "Failed to get prove result: {}",
                error_text
            )));
        }

        response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// Submit a proving job and poll until completion.
    ///
    /// This is the high-level convenience method. It submits the job, polls
    /// for status, and returns the final result.
    ///
    /// # Arguments
    /// * `model_id` — ID of the loaded model (hex string).
    /// * `gpu` — Whether to use GPU acceleration.
    /// * `timeout_secs` — Maximum seconds to wait for completion.
    pub async fn prove(
        &self,
        model_id: &str,
        gpu: bool,
        timeout_secs: u64,
    ) -> SdkResult<ProveResultResponse> {
        let request = ZkmlProveRequest::new(model_id).with_gpu(gpu);
        let submit = self.submit_prove(request).await?;
        let job_id = submit.job_id;

        let start = std::time::Instant::now();
        let timeout = Duration::from_secs(timeout_secs);
        let poll_interval = Duration::from_secs(2);

        loop {
            if start.elapsed() > timeout {
                return Err(SdkError::Timeout(format!(
                    "Proving job {} timed out after {}s",
                    job_id, timeout_secs
                )));
            }

            let status = self.get_prove_status(&job_id).await?;

            match status.status {
                ZkmlJobStatus::Completed => {
                    return self.get_prove_result(&job_id).await;
                }
                ZkmlJobStatus::Failed => {
                    return Err(SdkError::JobFailed(format!(
                        "Proving job {} failed",
                        job_id
                    )));
                }
                _ => {
                    tokio::time::sleep(poll_interval).await;
                }
            }
        }
    }
}

/// Configuration for the ZKML verifier client.
#[derive(Debug, Clone)]
pub struct ZkmlVerifierConfig {
    /// Address of the StweMlStarkVerifier contract (hex).
    pub verifier_address: String,
    /// Starknet RPC URL.
    pub rpc_url: String,
}

impl Default for ZkmlVerifierConfig {
    fn default() -> Self {
        Self {
            verifier_address: std::env::var("ZKML_VERIFIER_ADDRESS")
                .unwrap_or_else(|_| DEFAULT_VERIFIER_ADDRESS.to_string()),
            rpc_url: std::env::var("STARKNET_RPC_URL")
                .unwrap_or_else(|_| DEFAULT_RPC_URL.to_string()),
        }
    }
}

/// Async client for reading on-chain ZKML verification state from Starknet.
///
/// Uses raw JSON-RPC `starknet_call` to read view functions on the
/// StweMlStarkVerifier contract without requiring starknet-rs account setup.
pub struct ZkmlVerifierClient {
    http_client: Arc<reqwest::Client>,
    config: ZkmlVerifierConfig,
}

impl ZkmlVerifierClient {
    /// Create with default configuration.
    pub fn default() -> SdkResult<Self> {
        Self::new(ZkmlVerifierConfig::default())
    }

    /// Create with custom configuration.
    pub fn new(config: ZkmlVerifierConfig) -> SdkResult<Self> {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| SdkError::Http(e.to_string()))?;

        Ok(Self {
            http_client: Arc::new(http_client),
            config,
        })
    }

    /// Check whether a specific proof has been verified on-chain.
    pub async fn is_proof_verified(&self, proof_hash: &str) -> SdkResult<bool> {
        let result = self
            .starknet_call("is_proof_verified", &[proof_hash])
            .await?;
        Ok(result.as_deref() == Some("0x1") || result.as_deref() == Some("1"))
    }

    /// Read how many proofs have been verified for a model.
    pub async fn get_verification_count(&self, model_id: &str) -> SdkResult<u64> {
        let result = self
            .starknet_call("get_verification_count", &[model_id])
            .await?;
        match result {
            Some(hex) => {
                let val = u64::from_str_radix(hex.trim_start_matches("0x"), 16)
                    .unwrap_or(0);
                Ok(val)
            }
            None => Ok(0),
        }
    }

    /// Read the weight commitment for a model from on-chain storage.
    pub async fn get_model_commitment(&self, model_id: &str) -> SdkResult<Option<String>> {
        self.starknet_call("get_model_commitment", &[model_id])
            .await
    }

    /// Make a raw starknet_call to the verifier contract.
    async fn starknet_call(
        &self,
        entry_point: &str,
        calldata: &[&str],
    ) -> SdkResult<Option<String>> {
        let selector = starknet_keccak(entry_point);
        let calldata_strs: Vec<String> = calldata.iter().map(|s| s.to_string()).collect();

        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "starknet_call",
            "params": [
                {
                    "contract_address": self.config.verifier_address,
                    "entry_point_selector": selector,
                    "calldata": calldata_strs,
                },
                "latest"
            ]
        });

        let response = self
            .http_client
            .post(&self.config.rpc_url)
            .json(&body)
            .send()
            .await
            .map_err(|e| SdkError::Starknet(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SdkError::Starknet(format!(
                "RPC request failed: {}",
                response.status()
            )));
        }

        #[derive(Deserialize)]
        struct RpcResponse {
            result: Option<Vec<String>>,
            error: Option<RpcError>,
        }
        #[derive(Deserialize)]
        struct RpcError {
            message: String,
        }

        let rpc: RpcResponse = response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))?;

        if let Some(err) = rpc.error {
            return Err(SdkError::Starknet(err.message));
        }

        Ok(rpc.result.and_then(|r| r.into_iter().next()))
    }
}

/// Compute sn_keccak selector for a function name (matching Starknet's convention).
fn starknet_keccak(name: &str) -> String {
    use starknet::core::utils::get_selector_from_name;
    format!("{:#x}", get_selector_from_name(name).unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = ZkmlProverConfig::default();
        assert!(!config.prover_url.is_empty());
        assert!(config.timeout.as_secs() > 0);
    }

    #[test]
    fn test_prove_request_builder() {
        let req = ZkmlProveRequest::new("0x1")
            .with_gpu(true)
            .with_input(vec![1.0, 2.0, 3.0])
            .with_security("tee");

        assert_eq!(req.model_id, "0x1");
        assert!(req.gpu);
        assert_eq!(req.security, "tee");
        assert_eq!(req.input.unwrap().len(), 3);
    }

    #[test]
    fn test_load_model_request_onnx() {
        let req = LoadModelRequest::onnx("/path/to/model.onnx")
            .with_description("test model");

        assert_eq!(req.model_path, "/path/to/model.onnx");
        assert!(req.model_dir.is_none());
        assert_eq!(req.description.as_deref(), Some("test model"));
    }

    #[test]
    fn test_load_model_request_hf() {
        let req = LoadModelRequest::hf_dir("/path/to/hf_model");

        assert!(req.model_path.is_empty());
        assert_eq!(req.model_dir.as_deref(), Some("/path/to/hf_model"));
    }

    #[test]
    fn test_verifier_config_default() {
        let config = ZkmlVerifierConfig::default();
        assert!(config.verifier_address.starts_with("0x"));
        assert!(config.rpc_url.starts_with("http"));
    }
}
