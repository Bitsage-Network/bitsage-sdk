//! # Workers Client
//!
//! Client for worker management and monitoring operations.

use crate::error::{SdkError, SdkResult};
use crate::types::*;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Workers client for worker-specific operations
pub struct WorkersClient {
    http_client: Arc<Client>,
    api_url: String,
}

impl WorkersClient {
    pub(crate) fn new(http_client: Arc<Client>, api_url: String) -> Self {
        Self { http_client, api_url }
    }

    /// List all available workers
    pub async fn list(&self) -> SdkResult<Vec<WorkerInfo>> {
        let url = format!("{}/api/workers", self.api_url);

        let response = self.http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to list workers: {}", response.status()
            )));
        }

        response.json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// Get worker details
    pub async fn get(&self, worker_id: WorkerId) -> SdkResult<WorkerInfo> {
        let url = format!("{}/api/workers/{}", self.api_url, worker_id);

        let response = self.http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(SdkError::NotFound(format!("Worker {} not found", worker_id)));
        }

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to get worker: {}", response.status()
            )));
        }

        response.json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// Get workers by GPU tier
    pub async fn list_by_tier(&self, tier: GpuTier) -> SdkResult<Vec<WorkerInfo>> {
        let url = format!("{}/api/workers?gpu_tier={:?}", self.api_url, tier);

        let response = self.http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to list workers: {}", response.status()
            )));
        }

        response.json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// Get workers with TEE support
    pub async fn list_tee_workers(&self) -> SdkResult<Vec<WorkerInfo>> {
        let url = format!("{}/api/workers?has_tee=true", self.api_url);

        let response = self.http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to list TEE workers: {}", response.status()
            )));
        }

        response.json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }
}
