//! # Proofs Client
//!
//! Client for proof verification and management.

use crate::error::{SdkError, SdkResult};
use crate::types::*;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Proofs client for proof-specific operations
pub struct ProofsClient {
    http_client: Arc<Client>,
    api_url: String,
}

impl ProofsClient {
    pub(crate) fn new(http_client: Arc<Client>, api_url: String) -> Self {
        Self { http_client, api_url }
    }

    /// Get proof details by hash
    pub async fn get(&self, proof_hash: &str) -> SdkResult<ProofDetails> {
        let url = format!("{}/api/proofs/{}", self.api_url, proof_hash);

        let response = self.http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(SdkError::NotFound(format!("Proof {} not found", proof_hash)));
        }

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to get proof: {}", response.status()
            )));
        }

        response.json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// Verify a proof on-chain
    pub async fn verify(&self, proof_hash: &str) -> SdkResult<bool> {
        let url = format!("{}/api/proofs/{}/verify", self.api_url, proof_hash);

        let response = self.http_client
            .post(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(SdkError::NotFound(format!("Proof {} not found", proof_hash)));
        }

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to verify proof: {}", response.status()
            )));
        }

        let result: VerifyResponse = response.json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))?;

        Ok(result.valid)
    }

    /// List proofs for a job
    pub async fn list_by_job(&self, job_id: JobId) -> SdkResult<Vec<ProofDetails>> {
        let url = format!("{}/api/jobs/{}/proofs", self.api_url, job_id);

        let response = self.http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to list proofs: {}", response.status()
            )));
        }

        response.json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }
}

#[derive(Deserialize)]
struct VerifyResponse {
    valid: bool,
    verification_time_ms: Option<u64>,
}
