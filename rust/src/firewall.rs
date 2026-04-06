//! ZKML Agent Firewall client.
//!
//! Classifies transactions via the prove-server's `/api/v1/classify` endpoint.
//!
//! ```rust,no_run
//! use bitsage_sdk::firewall::FirewallClient;
//!
//! #[tokio::main]
//! async fn main() {
//!     let client = FirewallClient::new("https://prover.bitsage.network");
//!     let result = client.classify("0x1234...", "1000000", "0xa9059cbb").await.unwrap();
//!     println!("Decision: {}, Score: {}", result.decision, result.threat_score);
//! }
//! ```

use serde::{Deserialize, Serialize};

/// Result from the ZKML classifier.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassifyResult {
    pub request_id: String,
    pub decision: String,
    pub threat_score: u32,
    pub scores: [u64; 3],
    pub io_commitment: String,
    pub policy_commitment: String,
    pub prove_time_ms: u64,
}

/// Client for the ZKML transaction classifier.
pub struct FirewallClient {
    base_url: String,
    client: reqwest::Client,
}

impl FirewallClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::new(),
        }
    }

    /// Classify a transaction. Returns proven threat score and decision.
    pub async fn classify(
        &self,
        target: &str,
        value: &str,
        selector: &str,
    ) -> Result<ClassifyResult, reqwest::Error> {
        let body = serde_json::json!({
            "target": target,
            "value": value,
            "selector": selector,
        });

        self.client
            .post(format!("{}/api/v1/classify", self.base_url))
            .json(&body)
            .send()
            .await?
            .json()
            .await
    }
}
