"""
BitSage SDK

Official Python SDK for interacting with the BitSage Network.

Example:
    >>> from bitsage import BitSageClient, JobType
    >>>
    >>> async def main():
    ...     client = BitSageClient()
    ...
    ...     # Submit an AI inference job
    ...     response = await client.submit_job(
    ...         job_type=JobType.ai_inference(model_type="llama-7b", batch_size=1),
    ...         input_data="base64_encoded_data",
    ...         max_cost_sage=100,
    ...     )
    ...     print(f"Job submitted: {response.job_id}")
    ...
    ...     # Wait for completion
    ...     result = await client.wait_for_completion(response.job_id)
    ...     print(f"Result: {result}")
"""

from bitsage.client import BitSageClient, ClientConfig, WalletConfig
from bitsage.types import (
    JobId,
    WorkerId,
    JobType,
    JobStatus,
    GpuTier,
    WorkerStatus,
    ProofVerificationStatus,
    WorkerCapabilities,
    WorkerInfo,
    ProofDetails,
    NetworkStats,
    StakeInfo,
    FaucetStatus,
    SubmitJobRequest,
    SubmitJobResponse,
    JobStatusResponse,
    JobResult,
    ListJobsParams,
    ListJobsResponse,
    FaucetClaimResponse,
)

__version__ = "0.1.0"
__all__ = [
    # Client
    "BitSageClient",
    "ClientConfig",
    "WalletConfig",
    # Types
    "JobId",
    "WorkerId",
    "JobType",
    "JobStatus",
    "GpuTier",
    "WorkerStatus",
    "ProofVerificationStatus",
    "WorkerCapabilities",
    "WorkerInfo",
    "ProofDetails",
    "NetworkStats",
    "StakeInfo",
    "FaucetStatus",
    "SubmitJobRequest",
    "SubmitJobResponse",
    "JobStatusResponse",
    "JobResult",
    "ListJobsParams",
    "ListJobsResponse",
    "FaucetClaimResponse",
]
