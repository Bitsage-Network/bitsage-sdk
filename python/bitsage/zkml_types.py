"""
BitSage ZKML Types

Pydantic v2 models for ZKML proving and verification operations.
Field names match the prove-server (prove_server.rs) response schemas exactly.
"""

from enum import Enum
from typing import Optional, List

from pydantic import BaseModel, Field


class ZkmlJobStatus(str, Enum):
    """Status of a ZKML proving job."""
    QUEUED = "queued"
    PROVING = "proving"
    COMPLETED = "completed"
    FAILED = "failed"


class ZkmlModelInfo(BaseModel):
    """Information about a loaded ZKML model."""
    model_id: str
    weight_commitment: str
    num_layers: int
    input_shape: List[int]
    description: Optional[str] = None


class ZkmlProveRequest(BaseModel):
    """Request to prove a model inference."""
    model_id: str
    input: Optional[List[float]] = None
    gpu: bool = False
    security: str = Field(default="auto")


class ZkmlProveStatus(BaseModel):
    """Status of a proving job."""
    job_id: str
    status: ZkmlJobStatus
    progress_bps: int = Field(default=0, ge=0, le=10000)
    elapsed_secs: float = 0.0


class ZkmlProveResult(BaseModel):
    """Result of a completed proving job.

    Field names match ProveResultPayload in prove_server.rs.
    """
    calldata: List[str]
    io_commitment: str
    weight_commitment: str
    layer_chain_commitment: str
    estimated_gas: int = 0
    num_matmul_proofs: int = 0
    num_layers: int = 0
    prove_time_ms: int = 0
    tee_attestation_hash: Optional[str] = None


class ZkmlChatResult(BaseModel):
    """Result from the /api/v1/chat endpoint — provable text inference."""
    proof_id: str
    token_ids: List[int]
    num_tokens: int
    output: Optional[List[float]] = None
    output_shape: List[int] = Field(default_factory=list)
    predicted_token_id: Optional[int] = None
    predicted_text: Optional[str] = None
    io_commitment: str
    weight_commitment: str
    proof_hash: str
    prove_time_ms: int = 0
    calldata_size: int = 0
    calldata: Optional[List[str]] = None


class ZkmlInferResult(BaseModel):
    """Result from the /api/v1/infer endpoint — provable numeric inference."""
    proof_id: str
    output: Optional[List[float]] = None
    output_shape: List[int] = Field(default_factory=list)
    io_commitment: str
    weight_commitment: str
    proof_hash: str
    verify_url: str = ""
    num_proven_layers: int = 0
    prove_time_ms: int = 0
    estimated_gas: int = 0
    calldata: Optional[List[str]] = None
    calldata_size: int = 0


class ZkmlHealthResponse(BaseModel):
    """Health check response from the prover server.

    Field names match HealthResponse in prove_server.rs.
    """
    status: str
    uptime_secs: float = 0.0
    gpu_available: bool = False
    tee_available: bool = False
    device_name: str = ""
    loaded_models: int = 0
    active_jobs: int = 0
