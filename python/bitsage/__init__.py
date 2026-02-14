"""
BitSage SDK

Official Python SDK for interacting with the BitSage Network.

Quick Start (Easy API):
    >>> import bitsage
    >>>
    >>> bitsage.login()  # Uses ~/.bitsage/credentials from CLI
    >>> output = await bitsage.infer("qwen-14b", "What is ZKML?")
    >>> print(output)

Full Client:
    >>> from bitsage import BitSageClient, JobType
    >>>
    >>> async def main():
    ...     client = BitSageClient()
    ...     response = await client.submit_job(
    ...         job_type=JobType.ai_inference(model_type="llama-7b", batch_size=1),
    ...         input_data="base64_encoded_data",
    ...         max_cost_sage=100,
    ...     )
    ...     result = await client.wait_for_completion(response.job_id)
"""

from bitsage.client import BitSageClient, ClientConfig, WalletConfig
from bitsage.zkml import ZkmlProverClient, ZkmlVerifierClient
from bitsage.zkml_types import (
    ZkmlJobStatus,
    ZkmlModelInfo,
    ZkmlProveRequest,
    ZkmlProveStatus,
    ZkmlProveResult,
    ZkmlHealthResponse,
)
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

# Easy API — top-level convenience functions
from bitsage.easy import (
    login,
    train,
    run,
    infer,
    workers,
    status as network_status,
    JobHandle,
)

__version__ = "0.2.0"
__all__ = [
    # Easy API (top-level convenience)
    "login",
    "train",
    "run",
    "infer",
    "workers",
    "network_status",
    "JobHandle",
    # Client
    "BitSageClient",
    "ClientConfig",
    "WalletConfig",
    # ZKML
    "ZkmlProverClient",
    "ZkmlVerifierClient",
    "ZkmlJobStatus",
    "ZkmlModelInfo",
    "ZkmlProveRequest",
    "ZkmlProveStatus",
    "ZkmlProveResult",
    "ZkmlHealthResponse",
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
