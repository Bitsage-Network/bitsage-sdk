//! # BitSage SDK Types
//!
//! Common types used throughout the BitSage SDK.

use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

/// Job identifier
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct JobId(Uuid);

impl JobId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn from_string(s: &str) -> Result<Self, uuid::Error> {
        Ok(Self(Uuid::parse_str(s)?))
    }

    pub fn to_string(&self) -> String {
        self.0.to_string()
    }
}

impl Default for JobId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for JobId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Worker identifier
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct WorkerId(Uuid);

impl WorkerId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn from_string(s: &str) -> Result<Self, uuid::Error> {
        Ok(Self(Uuid::parse_str(s)?))
    }

    pub fn to_string(&self) -> String {
        self.0.to_string()
    }
}

impl Default for WorkerId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for WorkerId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Job types supported by BitSage network
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum JobType {
    /// AI model inference
    AiInference {
        model_type: String,
        batch_size: u32,
    },
    /// Zero-knowledge proof generation
    ZkProof {
        circuit_type: String,
        proof_system: String,
    },
    /// Computer vision processing
    ComputerVision {
        model_name: String,
        input_format: String,
    },
    /// Data pipeline processing
    DataPipeline {
        pipeline_type: String,
        tee_required: bool,
    },
    /// 3D rendering
    Render3d {
        resolution: String,
        frames: u32,
    },
    /// Video processing
    VideoProcessing {
        codec: String,
        operation: String,
    },
    /// Custom compute job
    Custom {
        name: String,
        parallelizable: bool,
    },
}

impl JobType {
    pub fn as_str(&self) -> &'static str {
        match self {
            JobType::AiInference { .. } => "ai_inference",
            JobType::ZkProof { .. } => "zk_proof",
            JobType::ComputerVision { .. } => "computer_vision",
            JobType::DataPipeline { .. } => "data_pipeline",
            JobType::Render3d { .. } => "render_3d",
            JobType::VideoProcessing { .. } => "video_processing",
            JobType::Custom { .. } => "custom",
        }
    }
}

/// Job status
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    /// Job submitted, waiting in queue
    Pending,
    /// Job assigned to worker
    Assigned,
    /// Job currently executing
    Running,
    /// Job completed successfully
    Completed,
    /// Job failed
    Failed,
    /// Job cancelled by user
    Cancelled,
    /// Job timed out
    Timeout,
}

/// GPU tier classification for staking requirements
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GpuTier {
    /// Consumer GPUs (RTX 30xx, 40xx) - 1,000 SAGE minimum
    Consumer,
    /// Workstation GPUs (A6000, L40S) - 2,500 SAGE minimum
    Workstation,
    /// Data Center GPUs (A100) - 5,000 SAGE minimum
    DataCenter,
    /// Enterprise GPUs (H100, H200) - 10,000 SAGE minimum
    Enterprise,
    /// Frontier GPUs (B200) - 25,000 SAGE minimum
    Frontier,
}

impl GpuTier {
    /// Get minimum stake required for this tier (in SAGE tokens)
    pub fn min_stake(&self) -> u64 {
        match self {
            GpuTier::Consumer => 1_000,
            GpuTier::Workstation => 2_500,
            GpuTier::DataCenter => 5_000,
            GpuTier::Enterprise => 10_000,
            GpuTier::Frontier => 25_000,
        }
    }

    /// Get tier from GPU model name
    pub fn from_gpu_model(model: &str) -> Self {
        let model_lower = model.to_lowercase();

        if model_lower.contains("b200") {
            GpuTier::Frontier
        } else if model_lower.contains("h100") || model_lower.contains("h200") {
            GpuTier::Enterprise
        } else if model_lower.contains("a100") {
            GpuTier::DataCenter
        } else if model_lower.contains("a6000") || model_lower.contains("l40") {
            GpuTier::Workstation
        } else {
            GpuTier::Consumer
        }
    }
}

/// Worker capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerCapabilities {
    pub gpu_model: String,
    pub gpu_memory_gb: u32,
    pub cpu_cores: u32,
    pub ram_gb: u32,
    pub has_tee: bool,
    pub tee_type: Option<String>,
    pub supported_job_types: Vec<String>,
}

/// Worker information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerInfo {
    pub id: WorkerId,
    pub address: String,
    pub capabilities: WorkerCapabilities,
    pub status: WorkerStatus,
    pub reputation: u32,
    pub stake_amount: u64,
    pub gpu_tier: GpuTier,
    pub registered_at: chrono::DateTime<chrono::Utc>,
}

/// Worker status
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkerStatus {
    /// Worker is online and available
    Available,
    /// Worker is currently processing a job
    Busy,
    /// Worker is offline
    Offline,
    /// Worker is suspended (low reputation, etc.)
    Suspended,
}

/// Proof details
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofDetails {
    pub proof_hash: String,
    pub job_id: JobId,
    pub proof_type: String,
    pub verification_status: ProofVerificationStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub verified_at: Option<chrono::DateTime<chrono::Utc>>,
    pub gas_cost: Option<u64>,
}

/// Proof verification status
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProofVerificationStatus {
    Pending,
    Verified,
    Failed,
}

/// Network statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStats {
    pub total_workers: u32,
    pub active_workers: u32,
    pub total_jobs_completed: u64,
    pub jobs_in_progress: u32,
    pub total_compute_hours: f64,
    pub average_job_duration_secs: f64,
    pub network_utilization: f64,
}

/// Staking information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StakeInfo {
    pub staked_amount: u64,
    pub locked_until: Option<chrono::DateTime<chrono::Utc>>,
    pub pending_rewards: u64,
    pub total_rewards_claimed: u64,
    pub gpu_tier: GpuTier,
    pub is_slashable: bool,
}

/// Faucet status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaucetStatus {
    pub can_claim: bool,
    pub time_until_next_claim_secs: u64,
    pub last_claim_at: Option<chrono::DateTime<chrono::Utc>>,
    pub total_claimed: u64,
    pub claim_amount: u64,
}
