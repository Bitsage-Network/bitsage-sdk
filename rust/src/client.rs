//! # BitSage SDK Client
//!
//! Main client for interacting with the BitSage Network.

use crate::error::{SdkError, SdkResult};
use crate::jobs::{JobsClient, SubmitJobRequest, SubmitJobResponse};
use crate::proofs::ProofsClient;
use crate::types::*;
use crate::workers::WorkersClient;

use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use starknet::core::types::FieldElement;
use starknet::signers::{LocalWallet, SigningKey};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, info};

/// Client configuration
#[derive(Debug, Clone)]
pub struct ClientConfig {
    /// Base URL for BitSage API (e.g., "https://api.bitsage.network")
    pub api_url: String,
    /// Starknet RPC URL
    pub starknet_rpc_url: String,
    /// Request timeout
    pub timeout: Duration,
    /// Network (mainnet, sepolia, etc.)
    pub network: Network,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            api_url: "https://api.bitsage.network".to_string(),
            starknet_rpc_url: "https://starknet-sepolia.public.blastapi.io".to_string(),
            timeout: Duration::from_secs(30),
            network: Network::Sepolia,
        }
    }
}

/// Network selection
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Network {
    Mainnet,
    Sepolia,
    Local,
}

impl Network {
    pub fn chain_id(&self) -> &'static str {
        match self {
            Network::Mainnet => "SN_MAIN",
            Network::Sepolia => "SN_SEPOLIA",
            Network::Local => "SN_GOERLI",
        }
    }
}

/// Wallet configuration for signing transactions
#[derive(Clone)]
pub struct WalletConfig {
    pub private_key: FieldElement,
    pub account_address: FieldElement,
}

impl WalletConfig {
    /// Create wallet config from hex strings
    pub fn from_hex(private_key: &str, account_address: &str) -> SdkResult<Self> {
        let private_key = FieldElement::from_hex_be(private_key)
            .map_err(|e| SdkError::Config(format!("Invalid private key: {}", e)))?;
        let account_address = FieldElement::from_hex_be(account_address)
            .map_err(|e| SdkError::Config(format!("Invalid account address: {}", e)))?;

        Ok(Self {
            private_key,
            account_address,
        })
    }
}

/// Main BitSage SDK client
pub struct BitSageClient {
    config: ClientConfig,
    http_client: reqwest::Client,
    wallet: Option<WalletConfig>,

    // Sub-clients
    jobs: JobsClient,
    workers: WorkersClient,
    proofs: ProofsClient,
}

impl BitSageClient {
    /// Create a new BitSage client
    pub fn new(config: ClientConfig) -> SdkResult<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let http_client = reqwest::Client::builder()
            .timeout(config.timeout)
            .default_headers(headers)
            .build()
            .map_err(|e| SdkError::Http(e.to_string()))?;

        let http_client = Arc::new(http_client);
        let api_url = config.api_url.clone();

        Ok(Self {
            jobs: JobsClient::new(http_client.clone(), api_url.clone()),
            workers: WorkersClient::new(http_client.clone(), api_url.clone()),
            proofs: ProofsClient::new(http_client.clone(), api_url.clone()),
            config,
            http_client: (*http_client).clone(),
            wallet: None,
        })
    }

    /// Create client with default configuration
    pub fn default_client() -> SdkResult<Self> {
        Self::new(ClientConfig::default())
    }

    /// Set wallet for signing transactions
    pub fn with_wallet(mut self, wallet: WalletConfig) -> Self {
        self.wallet = Some(wallet);
        self
    }

    /// Get jobs client
    pub fn jobs(&self) -> &JobsClient {
        &self.jobs
    }

    /// Get workers client
    pub fn workers(&self) -> &WorkersClient {
        &self.workers
    }

    /// Get proofs client
    pub fn proofs(&self) -> &ProofsClient {
        &self.proofs
    }

    // =========================================================================
    // Job Operations
    // =========================================================================

    /// Submit a new job
    pub async fn submit_job(&self, request: SubmitJobRequest) -> SdkResult<SubmitJobResponse> {
        self.jobs.submit(request).await
    }

    /// Get job status
    pub async fn get_job_status(&self, job_id: JobId) -> SdkResult<JobStatusResponse> {
        self.jobs.get_status(job_id).await
    }

    /// Cancel a job
    pub async fn cancel_job(&self, job_id: JobId) -> SdkResult<()> {
        self.jobs.cancel(job_id).await
    }

    /// List jobs
    pub async fn list_jobs(&self, params: ListJobsParams) -> SdkResult<ListJobsResponse> {
        self.jobs.list(params).await
    }

    // =========================================================================
    // Worker Operations
    // =========================================================================

    /// List available workers
    pub async fn list_workers(&self) -> SdkResult<Vec<WorkerInfo>> {
        self.workers.list().await
    }

    /// Get worker details
    pub async fn get_worker(&self, worker_id: WorkerId) -> SdkResult<WorkerInfo> {
        self.workers.get(worker_id).await
    }

    // =========================================================================
    // Proof Operations
    // =========================================================================

    /// Get proof details
    pub async fn get_proof(&self, proof_hash: &str) -> SdkResult<ProofDetails> {
        self.proofs.get(proof_hash).await
    }

    /// Verify a proof
    pub async fn verify_proof(&self, proof_hash: &str) -> SdkResult<bool> {
        self.proofs.verify(proof_hash).await
    }

    // =========================================================================
    // Staking Operations
    // =========================================================================

    /// Stake SAGE tokens
    pub async fn stake(&self, amount: u64, gpu_tier: GpuTier) -> SdkResult<String> {
        let wallet = self.require_wallet()?;
        self.execute_stake(wallet, amount, gpu_tier).await
    }

    /// Unstake SAGE tokens
    pub async fn unstake(&self, amount: u64) -> SdkResult<String> {
        let wallet = self.require_wallet()?;
        self.execute_unstake(wallet, amount).await
    }

    /// Claim staking rewards
    pub async fn claim_rewards(&self) -> SdkResult<u64> {
        let wallet = self.require_wallet()?;
        self.execute_claim_rewards(wallet).await
    }

    /// Get stake information
    pub async fn get_stake_info(&self) -> SdkResult<StakeInfo> {
        let wallet = self.require_wallet()?;
        self.fetch_stake_info(wallet).await
    }

    // =========================================================================
    // Network Operations
    // =========================================================================

    /// Get network statistics
    pub async fn get_network_stats(&self) -> SdkResult<NetworkStats> {
        let url = format!("{}/api/network/stats", self.config.api_url);
        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to get network stats: {}",
                response.status()
            )));
        }

        response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    // =========================================================================
    // Faucet Operations (Testnet only)
    // =========================================================================

    /// Claim tokens from faucet (testnet only)
    pub async fn faucet_claim(&self, address: &str) -> SdkResult<FaucetClaimResponse> {
        if self.config.network == Network::Mainnet {
            return Err(SdkError::Config(
                "Faucet is only available on testnet".to_string(),
            ));
        }

        let url = format!("{}/api/faucet/claim", self.config.api_url);
        let request = FaucetClaimRequest {
            address: address.to_string(),
        };

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
                "Faucet claim failed: {}",
                error_text
            )));
        }

        response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// Get faucet status
    pub async fn faucet_status(&self, address: &str) -> SdkResult<FaucetStatus> {
        let url = format!("{}/api/faucet/status/{}", self.config.api_url, address);
        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to get faucet status: {}",
                response.status()
            )));
        }

        response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    fn require_wallet(&self) -> SdkResult<&WalletConfig> {
        self.wallet
            .as_ref()
            .ok_or_else(|| SdkError::Config("Wallet not configured".to_string()))
    }

    async fn execute_stake(
        &self,
        wallet: &WalletConfig,
        amount: u64,
        gpu_tier: GpuTier,
    ) -> SdkResult<String> {
        let url = format!("{}/api/staking/stake", self.config.api_url);
        let request = StakeRequest {
            address: format!("{:#x}", wallet.account_address),
            amount,
            gpu_tier,
        };

        let response = self
            .http_client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(SdkError::Api(format!("Stake failed: {}", error_text)));
        }

        let result: StakeResponse = response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))?;

        Ok(result.transaction_hash)
    }

    async fn execute_unstake(&self, wallet: &WalletConfig, amount: u64) -> SdkResult<String> {
        let url = format!("{}/api/staking/unstake", self.config.api_url);
        let request = UnstakeRequest {
            address: format!("{:#x}", wallet.account_address),
            amount,
        };

        let response = self
            .http_client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(SdkError::Api(format!("Unstake failed: {}", error_text)));
        }

        let result: UnstakeResponse = response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))?;

        Ok(result.transaction_hash)
    }

    async fn execute_claim_rewards(&self, wallet: &WalletConfig) -> SdkResult<u64> {
        let url = format!("{}/api/staking/claim", self.config.api_url);
        let request = ClaimRewardsRequest {
            address: format!("{:#x}", wallet.account_address),
        };

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
                "Claim rewards failed: {}",
                error_text
            )));
        }

        let result: ClaimRewardsResponse = response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))?;

        Ok(result.amount_claimed)
    }

    async fn fetch_stake_info(&self, wallet: &WalletConfig) -> SdkResult<StakeInfo> {
        let url = format!(
            "{}/api/staking/info/{:#x}",
            self.config.api_url, wallet.account_address
        );

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to get stake info: {}",
                response.status()
            )));
        }

        response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }
}

// =========================================================================
// Request/Response Types
// =========================================================================

/// Job status response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStatusResponse {
    pub job_id: JobId,
    pub status: JobStatus,
    pub worker_id: Option<WorkerId>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub error_message: Option<String>,
    pub result_hash: Option<String>,
}

/// List jobs parameters
#[derive(Debug, Clone, Default, Serialize)]
pub struct ListJobsParams {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub status: Option<JobStatus>,
}

/// List jobs response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListJobsResponse {
    pub jobs: Vec<JobStatusResponse>,
    pub total: u64,
    pub has_more: bool,
}

#[derive(Debug, Serialize)]
struct StakeRequest {
    address: String,
    amount: u64,
    gpu_tier: GpuTier,
}

#[derive(Debug, Deserialize)]
struct StakeResponse {
    transaction_hash: String,
}

#[derive(Debug, Serialize)]
struct UnstakeRequest {
    address: String,
    amount: u64,
}

#[derive(Debug, Deserialize)]
struct UnstakeResponse {
    transaction_hash: String,
}

#[derive(Debug, Serialize)]
struct ClaimRewardsRequest {
    address: String,
}

#[derive(Debug, Deserialize)]
struct ClaimRewardsResponse {
    amount_claimed: u64,
    transaction_hash: String,
}

#[derive(Debug, Serialize)]
struct FaucetClaimRequest {
    address: String,
}

/// Faucet claim response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaucetClaimResponse {
    pub success: bool,
    pub amount: u64,
    pub transaction_hash: String,
}
