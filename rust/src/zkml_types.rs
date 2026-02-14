//! # ZKML Request/Response Types
//!
//! Types matching the prove-server REST API for ZKML proving and verification.

use serde::{Deserialize, Serialize};

/// Status of a ZKML proving job.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ZkmlJobStatus {
    Queued,
    Proving,
    Completed,
    Failed,
}

/// Request to load a model on the prover server.
#[derive(Debug, Clone, Serialize)]
pub struct LoadModelRequest {
    /// Path to ONNX model file on the server filesystem.
    pub model_path: String,
    /// Optional HuggingFace model directory (alternative to ONNX).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_dir: Option<String>,
    /// Optional human-readable description for on-chain registration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

impl LoadModelRequest {
    /// Create a request to load an ONNX model.
    pub fn onnx(path: impl Into<String>) -> Self {
        Self {
            model_path: path.into(),
            model_dir: None,
            description: None,
        }
    }

    /// Create a request to load a HuggingFace model directory.
    pub fn hf_dir(path: impl Into<String>) -> Self {
        Self {
            model_path: String::new(),
            model_dir: Some(path.into()),
            description: None,
        }
    }

    /// Set description for on-chain registration.
    pub fn with_description(mut self, desc: impl Into<String>) -> Self {
        self.description = Some(desc.into());
        self
    }
}

/// Response from loading a model.
#[derive(Debug, Clone, Deserialize)]
pub struct ModelInfoResponse {
    /// Model identifier (hex).
    pub model_id: String,
    /// Poseidon hash of weight matrices (hex).
    pub weight_commitment: String,
    /// Number of model layers.
    pub num_layers: usize,
    /// Input shape [rows, cols].
    pub input_shape: [usize; 2],
}

/// Request to submit a ZKML proving job.
#[derive(Debug, Clone, Serialize)]
pub struct ZkmlProveRequest {
    /// Model ID (must be loaded first via POST /api/v1/models).
    pub model_id: String,
    /// Flat array of f32 input values (random if omitted).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<Vec<f32>>,
    /// Use GPU acceleration.
    #[serde(default)]
    pub gpu: bool,
    /// Security level: "auto" | "tee" | "zk-only".
    #[serde(default = "default_security")]
    pub security: String,
}

fn default_security() -> String {
    "auto".to_string()
}

impl ZkmlProveRequest {
    /// Create a prove request for the given model.
    pub fn new(model_id: impl Into<String>) -> Self {
        Self {
            model_id: model_id.into(),
            input: None,
            gpu: false,
            security: "auto".to_string(),
        }
    }

    /// Enable GPU acceleration.
    pub fn with_gpu(mut self, gpu: bool) -> Self {
        self.gpu = gpu;
        self
    }

    /// Set input tensor values.
    pub fn with_input(mut self, input: Vec<f32>) -> Self {
        self.input = Some(input);
        self
    }

    /// Set security level.
    pub fn with_security(mut self, security: impl Into<String>) -> Self {
        self.security = security.into();
        self
    }
}

/// Response from submitting a prove job.
#[derive(Debug, Clone, Deserialize)]
pub struct ProveSubmitResponse {
    /// Job identifier.
    pub job_id: String,
    /// Initial status.
    pub status: ZkmlJobStatus,
}

/// Status of a proving job.
#[derive(Debug, Clone, Deserialize)]
pub struct ProveStatusResponse {
    /// Job identifier.
    pub job_id: String,
    /// Current status.
    pub status: ZkmlJobStatus,
    /// Progress in basis points (0-10000).
    pub progress_bps: u16,
    /// Elapsed seconds since submission.
    pub elapsed_secs: f64,
}

/// Completed proof result.
#[derive(Debug, Clone, Deserialize)]
pub struct ProveResultResponse {
    /// Combined felt252 calldata for on-chain verify_model().
    pub calldata: Vec<String>,
    /// Poseidon(inputs || outputs).
    pub io_commitment: String,
    /// Poseidon hash of weight matrices.
    pub weight_commitment: String,
    /// Running Poseidon hash of intermediate layer values.
    pub layer_chain_commitment: String,
    /// Estimated gas for on-chain verification.
    pub estimated_gas: u64,
    /// Number of matmul sumcheck proofs.
    pub num_matmul_proofs: usize,
    /// Number of proven layers.
    pub num_layers: usize,
    /// Proving time in milliseconds.
    pub prove_time_ms: u64,
    /// TEE attestation hash (null if zk-only).
    pub tee_attestation_hash: Option<String>,
}

/// Health check response from the prover server.
#[derive(Debug, Clone, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub uptime_secs: f64,
    pub gpu_available: bool,
    pub tee_available: bool,
    pub device_name: String,
    pub loaded_models: usize,
    pub active_jobs: usize,
}
