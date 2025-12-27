"""
BitSage SDK Types
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Union
from pydantic import BaseModel, Field

# Type aliases
JobId = str
WorkerId = str


class JobStatus(str, Enum):
    """Job status"""
    PENDING = "pending"
    ASSIGNED = "assigned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


class GpuTier(str, Enum):
    """GPU tier classification"""
    CONSUMER = "consumer"
    WORKSTATION = "workstation"
    DATA_CENTER = "data_center"
    ENTERPRISE = "enterprise"
    FRONTIER = "frontier"

    @property
    def min_stake(self) -> int:
        """Get minimum stake required for this tier (in SAGE tokens)"""
        stakes = {
            GpuTier.CONSUMER: 1_000,
            GpuTier.WORKSTATION: 2_500,
            GpuTier.DATA_CENTER: 5_000,
            GpuTier.ENTERPRISE: 10_000,
            GpuTier.FRONTIER: 25_000,
        }
        return stakes[self]

    @classmethod
    def from_gpu_model(cls, model: str) -> "GpuTier":
        """Get tier from GPU model name"""
        lower = model.lower()
        if "b200" in lower:
            return cls.FRONTIER
        if "h100" in lower or "h200" in lower:
            return cls.ENTERPRISE
        if "a100" in lower:
            return cls.DATA_CENTER
        if "a6000" in lower or "l40" in lower:
            return cls.WORKSTATION
        return cls.CONSUMER


class WorkerStatus(str, Enum):
    """Worker status"""
    AVAILABLE = "available"
    BUSY = "busy"
    OFFLINE = "offline"
    SUSPENDED = "suspended"


class ProofVerificationStatus(str, Enum):
    """Proof verification status"""
    PENDING = "pending"
    VERIFIED = "verified"
    FAILED = "failed"


class JobType(BaseModel):
    """Job type specification"""
    type: str

    @classmethod
    def ai_inference(cls, model_type: str, batch_size: int = 1) -> "JobType":
        return cls(type="ai_inference", model_type=model_type, batch_size=batch_size)

    @classmethod
    def zk_proof(cls, circuit_type: str, proof_system: str = "stwo") -> "JobType":
        return cls(type="zk_proof", circuit_type=circuit_type, proof_system=proof_system)

    @classmethod
    def computer_vision(cls, model_name: str, input_format: str = "image") -> "JobType":
        return cls(type="computer_vision", model_name=model_name, input_format=input_format)

    @classmethod
    def data_pipeline(cls, pipeline_type: str, tee_required: bool = False) -> "JobType":
        return cls(type="data_pipeline", pipeline_type=pipeline_type, tee_required=tee_required)

    @classmethod
    def render_3d(cls, resolution: str, frames: int = 1) -> "JobType":
        return cls(type="render_3d", resolution=resolution, frames=frames)

    @classmethod
    def custom(cls, name: str, parallelizable: bool = True) -> "JobType":
        return cls(type="custom", name=name, parallelizable=parallelizable)

    class Config:
        extra = "allow"


class WorkerCapabilities(BaseModel):
    """Worker capabilities"""
    gpu_model: str
    gpu_memory_gb: int
    cpu_cores: int
    ram_gb: int
    has_tee: bool
    tee_type: Optional[str] = None
    supported_job_types: List[str]


class WorkerInfo(BaseModel):
    """Worker information"""
    id: WorkerId
    address: str
    capabilities: WorkerCapabilities
    status: WorkerStatus
    reputation: int
    stake_amount: int
    gpu_tier: GpuTier
    registered_at: datetime


class ProofDetails(BaseModel):
    """Proof details"""
    proof_hash: str
    job_id: JobId
    proof_type: str
    verification_status: ProofVerificationStatus
    created_at: datetime
    verified_at: Optional[datetime] = None
    gas_cost: Optional[int] = None


class NetworkStats(BaseModel):
    """Network statistics"""
    total_workers: int
    active_workers: int
    total_jobs_completed: int
    jobs_in_progress: int
    total_compute_hours: float
    average_job_duration_secs: float
    network_utilization: float


class StakeInfo(BaseModel):
    """Staking information"""
    staked_amount: int
    locked_until: Optional[datetime] = None
    pending_rewards: int
    total_rewards_claimed: int
    gpu_tier: GpuTier
    is_slashable: bool


class FaucetStatus(BaseModel):
    """Faucet status"""
    can_claim: bool
    time_until_next_claim_secs: int
    last_claim_at: Optional[datetime] = None
    total_claimed: int
    claim_amount: int


class SubmitJobRequest(BaseModel):
    """Submit job request"""
    job_type: JobType
    input_data: str
    max_cost_sage: int = 100
    max_duration_secs: int = 3600
    priority: int = Field(default=5, ge=1, le=10)
    require_tee: bool = False
    deadline: Optional[datetime] = None
    callback_url: Optional[str] = None


class SubmitJobResponse(BaseModel):
    """Submit job response"""
    job_id: JobId
    status: JobStatus
    estimated_cost_sage: int
    estimated_completion_secs: Optional[int] = None
    queue_position: Optional[int] = None


class JobStatusResponse(BaseModel):
    """Job status response"""
    job_id: JobId
    status: JobStatus
    worker_id: Optional[WorkerId] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    result_hash: Optional[str] = None


class JobResult(BaseModel):
    """Job result"""
    job_id: JobId
    output_data: Optional[str] = None
    output_files: List[str] = []
    execution_time_secs: float
    actual_cost_sage: int
    proof_hash: Optional[str] = None
    worker_id: WorkerId
    error: Optional[str] = None


class ListJobsParams(BaseModel):
    """List jobs parameters"""
    limit: Optional[int] = None
    offset: Optional[int] = None
    status: Optional[JobStatus] = None


class ListJobsResponse(BaseModel):
    """List jobs response"""
    jobs: List[JobStatusResponse]
    total: int
    has_more: bool


class FaucetClaimResponse(BaseModel):
    """Faucet claim response"""
    success: bool
    amount: int
    transaction_hash: str
