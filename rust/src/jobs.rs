//! # Jobs Client
//!
//! Client for job submission and management operations.

use crate::error::{SdkError, SdkResult};
use crate::types::*;
use crate::client::{JobStatusResponse, ListJobsParams, ListJobsResponse};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio_stream::Stream;
use tracing::{debug, info};

/// Job submission request
#[derive(Debug, Clone, Serialize)]
pub struct SubmitJobRequest {
    /// Type of job to execute
    pub job_type: JobType,
    /// Input data (base64 encoded or URL)
    pub input_data: String,
    /// Maximum cost in SAGE tokens willing to pay
    pub max_cost_sage: u64,
    /// Maximum execution time in seconds
    pub max_duration_secs: u64,
    /// Priority (1-10, higher = more urgent)
    pub priority: u8,
    /// Whether to require TEE execution
    pub require_tee: bool,
    /// Optional deadline
    pub deadline: Option<chrono::DateTime<chrono::Utc>>,
    /// Optional callback URL for webhooks
    pub callback_url: Option<String>,
}

impl SubmitJobRequest {
    /// Create a new job submission request
    pub fn new(job_type: JobType, input_data: String) -> Self {
        Self {
            job_type,
            input_data,
            max_cost_sage: 100,
            max_duration_secs: 3600,
            priority: 5,
            require_tee: false,
            deadline: None,
            callback_url: None,
        }
    }

    /// Set maximum cost
    pub fn with_max_cost(mut self, cost: u64) -> Self {
        self.max_cost_sage = cost;
        self
    }

    /// Set maximum duration
    pub fn with_max_duration(mut self, secs: u64) -> Self {
        self.max_duration_secs = secs;
        self
    }

    /// Set priority
    pub fn with_priority(mut self, priority: u8) -> Self {
        self.priority = priority.min(10);
        self
    }

    /// Require TEE execution
    pub fn with_tee(mut self, require: bool) -> Self {
        self.require_tee = require;
        self
    }

    /// Set deadline
    pub fn with_deadline(mut self, deadline: chrono::DateTime<chrono::Utc>) -> Self {
        self.deadline = Some(deadline);
        self
    }

    /// Set callback URL
    pub fn with_callback(mut self, url: String) -> Self {
        self.callback_url = Some(url);
        self
    }
}

/// Job submission response
#[derive(Debug, Clone, Deserialize)]
pub struct SubmitJobResponse {
    /// Assigned job ID
    pub job_id: JobId,
    /// Initial status
    pub status: JobStatus,
    /// Estimated cost
    pub estimated_cost_sage: u64,
    /// Estimated completion time
    pub estimated_completion_secs: Option<u64>,
    /// Queue position
    pub queue_position: Option<u32>,
}

/// Job result data
#[derive(Debug, Clone, Deserialize)]
pub struct JobResult {
    /// Job ID
    pub job_id: JobId,
    /// Output data (base64 encoded)
    pub output_data: Option<String>,
    /// Output files URLs
    pub output_files: Vec<String>,
    /// Execution time in seconds
    pub execution_time_secs: f64,
    /// Actual cost in SAGE
    pub actual_cost_sage: u64,
    /// Proof hash (if ZK proof was generated)
    pub proof_hash: Option<String>,
    /// Worker that executed the job
    pub worker_id: WorkerId,
    /// Error message if failed
    pub error: Option<String>,
}

/// Jobs client for job-specific operations
pub struct JobsClient {
    http_client: Arc<Client>,
    api_url: String,
}

impl JobsClient {
    pub(crate) fn new(http_client: Arc<Client>, api_url: String) -> Self {
        Self {
            http_client,
            api_url,
        }
    }

    /// Submit a new job
    pub async fn submit(&self, request: SubmitJobRequest) -> SdkResult<SubmitJobResponse> {
        let url = format!("{}/api/jobs/submit", self.api_url);

        debug!("Submitting job: {:?}", request.job_type);

        let response = self
            .http_client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(SdkError::Api(format!(
                "Job submission failed ({}): {}",
                status, error_text
            )));
        }

        let result: SubmitJobResponse = response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))?;

        info!("Job submitted: {}", result.job_id);
        Ok(result)
    }

    /// Get job status
    pub async fn get_status(&self, job_id: JobId) -> SdkResult<JobStatusResponse> {
        let url = format!("{}/api/jobs/{}", self.api_url, job_id);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(SdkError::NotFound(format!("Job {} not found", job_id)));
        }

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to get job status: {}",
                response.status()
            )));
        }

        response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// Get job result
    pub async fn get_result(&self, job_id: JobId) -> SdkResult<JobResult> {
        let url = format!("{}/api/jobs/{}/result", self.api_url, job_id);

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(SdkError::NotFound(format!(
                "Result for job {} not found",
                job_id
            )));
        }

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to get job result: {}",
                response.status()
            )));
        }

        response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// Cancel a job
    pub async fn cancel(&self, job_id: JobId) -> SdkResult<()> {
        let url = format!("{}/api/jobs/{}/cancel", self.api_url, job_id);

        let response = self
            .http_client
            .post(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(SdkError::NotFound(format!("Job {} not found", job_id)));
        }

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(SdkError::Api(format!(
                "Failed to cancel job: {}",
                error_text
            )));
        }

        info!("Job {} cancelled", job_id);
        Ok(())
    }

    /// List jobs with optional filtering
    pub async fn list(&self, params: ListJobsParams) -> SdkResult<ListJobsResponse> {
        let mut url = format!("{}/api/jobs", self.api_url);

        // Build query string
        let mut query_params = vec![];
        if let Some(limit) = params.limit {
            query_params.push(format!("limit={}", limit));
        }
        if let Some(offset) = params.offset {
            query_params.push(format!("offset={}", offset));
        }
        if let Some(status) = params.status {
            // Use serde serialization for lowercase enum values (e.g., "pending" not "Pending")
            let status_str = serde_json::to_value(&status)
                .ok()
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| format!("{:?}", status).to_lowercase());
            query_params.push(format!("status={}", status_str));
        }

        if !query_params.is_empty() {
            url = format!("{}?{}", url, query_params.join("&"));
        }

        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| SdkError::Http(e.to_string()))?;

        if !response.status().is_success() {
            return Err(SdkError::Api(format!(
                "Failed to list jobs: {}",
                response.status()
            )));
        }

        response
            .json()
            .await
            .map_err(|e| SdkError::Deserialization(e.to_string()))
    }

    /// Wait for job completion with polling
    pub async fn wait_for_completion(
        &self,
        job_id: JobId,
        poll_interval_ms: u64,
        timeout_secs: u64,
    ) -> SdkResult<JobResult> {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(timeout_secs);
        let interval = std::time::Duration::from_millis(poll_interval_ms);

        loop {
            if start.elapsed() > timeout {
                return Err(SdkError::Timeout(format!(
                    "Timeout waiting for job {} to complete",
                    job_id
                )));
            }

            let status = self.get_status(job_id).await?;

            match status.status {
                JobStatus::Completed => {
                    return self.get_result(job_id).await;
                }
                JobStatus::Failed => {
                    return Err(SdkError::JobFailed(
                        status
                            .error_message
                            .unwrap_or_else(|| "Unknown error".to_string()),
                    ));
                }
                JobStatus::Cancelled => {
                    return Err(SdkError::JobCancelled(job_id.to_string()));
                }
                JobStatus::Timeout => {
                    return Err(SdkError::JobTimeout(job_id.to_string()));
                }
                _ => {
                    // Still processing
                    tokio::time::sleep(interval).await;
                }
            }
        }
    }
}
