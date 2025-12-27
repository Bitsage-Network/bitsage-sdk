"""
BitSage SDK Client
"""

import asyncio
from dataclasses import dataclass, field
from typing import Optional, AsyncIterator
from datetime import datetime

import httpx

from bitsage.types import (
    JobId,
    WorkerId,
    JobStatus,
    GpuTier,
    SubmitJobRequest,
    SubmitJobResponse,
    JobStatusResponse,
    JobResult,
    ListJobsParams,
    ListJobsResponse,
    WorkerInfo,
    ProofDetails,
    NetworkStats,
    StakeInfo,
    FaucetStatus,
    FaucetClaimResponse,
)


class SdkError(Exception):
    """SDK Error"""

    def __init__(self, message: str, code: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass
class ClientConfig:
    """Client configuration"""

    api_url: str = "https://api.bitsage.network"
    starknet_rpc_url: str = "https://starknet-sepolia.public.blastapi.io"
    timeout: float = 30.0
    network: str = "sepolia"


@dataclass
class WalletConfig:
    """Wallet configuration"""

    private_key: str
    account_address: str


class BitSageClient:
    """
    BitSage SDK Client

    Example:
        >>> async def main():
        ...     client = BitSageClient()
        ...
        ...     # Submit a job
        ...     response = await client.submit_job(
        ...         SubmitJobRequest(
        ...             job_type=JobType.ai_inference("llama-7b", 1),
        ...             input_data="base64_data",
        ...         )
        ...     )
        ...
        ...     # Wait for completion
        ...     result = await client.wait_for_completion(response.job_id)
    """

    def __init__(
        self,
        config: Optional[ClientConfig] = None,
        wallet: Optional[WalletConfig] = None,
    ):
        self.config = config or ClientConfig()
        self.wallet = wallet
        self._client = httpx.AsyncClient(
            base_url=self.config.api_url,
            timeout=self.config.timeout,
            headers={"Content-Type": "application/json"},
        )

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._client.aclose()

    def with_wallet(self, wallet: WalletConfig) -> "BitSageClient":
        """Set wallet for signing transactions"""
        self.wallet = wallet
        return self

    # =========================================================================
    # Job Operations
    # =========================================================================

    async def submit_job(self, request: SubmitJobRequest) -> SubmitJobResponse:
        """Submit a new job"""
        response = await self._request("POST", "/api/jobs/submit", json=request.model_dump())
        return SubmitJobResponse(**response)

    async def get_job_status(self, job_id: JobId) -> JobStatusResponse:
        """Get job status"""
        response = await self._request("GET", f"/api/jobs/{job_id}")
        return JobStatusResponse(**response)

    async def get_job_result(self, job_id: JobId) -> JobResult:
        """Get job result"""
        response = await self._request("GET", f"/api/jobs/{job_id}/result")
        return JobResult(**response)

    async def cancel_job(self, job_id: JobId) -> None:
        """Cancel a job"""
        await self._request("POST", f"/api/jobs/{job_id}/cancel")

    async def list_jobs(self, params: Optional[ListJobsParams] = None) -> ListJobsResponse:
        """List jobs"""
        params = params or ListJobsParams()
        query = {}
        if params.limit:
            query["limit"] = params.limit
        if params.offset:
            query["offset"] = params.offset
        if params.status:
            query["status"] = params.status.value

        response = await self._request("GET", "/api/jobs", params=query)
        return ListJobsResponse(**response)

    async def wait_for_completion(
        self,
        job_id: JobId,
        poll_interval_secs: float = 1.0,
        timeout_secs: float = 3600.0,
    ) -> JobResult:
        """Wait for job completion with polling"""
        start = datetime.now()

        while (datetime.now() - start).total_seconds() < timeout_secs:
            status = await self.get_job_status(job_id)

            if status.status == JobStatus.COMPLETED:
                return await self.get_job_result(job_id)
            elif status.status == JobStatus.FAILED:
                raise SdkError(
                    status.error_message or "Job failed",
                    "JOB_FAILED",
                )
            elif status.status == JobStatus.CANCELLED:
                raise SdkError("Job was cancelled", "JOB_CANCELLED")
            elif status.status == JobStatus.TIMEOUT:
                raise SdkError("Job timed out", "JOB_TIMEOUT")

            await asyncio.sleep(poll_interval_secs)

        raise SdkError("Timeout waiting for job completion", "TIMEOUT")

    async def stream_job_status(
        self, job_id: JobId, poll_interval_secs: float = 1.0
    ) -> AsyncIterator[JobStatusResponse]:
        """Stream job status updates"""
        last_status: Optional[JobStatus] = None

        while True:
            status = await self.get_job_status(job_id)

            if status.status != last_status:
                last_status = status.status
                yield status

            if status.status in (
                JobStatus.COMPLETED,
                JobStatus.FAILED,
                JobStatus.CANCELLED,
                JobStatus.TIMEOUT,
            ):
                break

            await asyncio.sleep(poll_interval_secs)

    # =========================================================================
    # Worker Operations
    # =========================================================================

    async def list_workers(self) -> list[WorkerInfo]:
        """List available workers"""
        response = await self._request("GET", "/api/workers")
        return [WorkerInfo(**w) for w in response]

    async def get_worker(self, worker_id: WorkerId) -> WorkerInfo:
        """Get worker details"""
        response = await self._request("GET", f"/api/workers/{worker_id}")
        return WorkerInfo(**response)

    # =========================================================================
    # Proof Operations
    # =========================================================================

    async def get_proof(self, proof_hash: str) -> ProofDetails:
        """Get proof details"""
        response = await self._request("GET", f"/api/proofs/{proof_hash}")
        return ProofDetails(**response)

    async def verify_proof(self, proof_hash: str) -> bool:
        """Verify a proof"""
        response = await self._request("POST", f"/api/proofs/{proof_hash}/verify")
        return response["valid"]

    # =========================================================================
    # Staking Operations
    # =========================================================================

    async def stake(self, amount: int, gpu_tier: GpuTier) -> str:
        """Stake SAGE tokens"""
        self._require_wallet()
        response = await self._request(
            "POST",
            "/api/staking/stake",
            json={
                "address": self.wallet.account_address,
                "amount": amount,
                "gpu_tier": gpu_tier.value,
            },
        )
        return response["transaction_hash"]

    async def unstake(self, amount: int) -> str:
        """Unstake SAGE tokens"""
        self._require_wallet()
        response = await self._request(
            "POST",
            "/api/staking/unstake",
            json={
                "address": self.wallet.account_address,
                "amount": amount,
            },
        )
        return response["transaction_hash"]

    async def claim_rewards(self) -> int:
        """Claim staking rewards"""
        self._require_wallet()
        response = await self._request(
            "POST",
            "/api/staking/claim",
            json={"address": self.wallet.account_address},
        )
        return response["amount_claimed"]

    async def get_stake_info(self) -> StakeInfo:
        """Get stake information"""
        self._require_wallet()
        response = await self._request(
            "GET", f"/api/staking/info/{self.wallet.account_address}"
        )
        return StakeInfo(**response)

    # =========================================================================
    # Network Operations
    # =========================================================================

    async def get_network_stats(self) -> NetworkStats:
        """Get network statistics"""
        response = await self._request("GET", "/api/network/stats")
        return NetworkStats(**response)

    # =========================================================================
    # Faucet Operations (Testnet only)
    # =========================================================================

    async def faucet_claim(self, address: str) -> FaucetClaimResponse:
        """Claim tokens from faucet"""
        if self.config.network == "mainnet":
            raise SdkError("Faucet is only available on testnet", "INVALID_NETWORK")

        response = await self._request(
            "POST",
            "/api/faucet/claim",
            json={"address": address},
        )
        return FaucetClaimResponse(**response)

    async def faucet_status(self, address: str) -> FaucetStatus:
        """Get faucet status"""
        response = await self._request("GET", f"/api/faucet/status/{address}")
        return FaucetStatus(**response)

    # =========================================================================
    # Internal Helpers
    # =========================================================================

    def _require_wallet(self) -> None:
        if not self.wallet:
            raise SdkError("Wallet not configured", "WALLET_REQUIRED")

    async def _request(
        self,
        method: str,
        path: str,
        json: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> dict:
        try:
            response = await self._client.request(
                method,
                path,
                json=json,
                params=params,
            )

            if response.status_code == 404:
                raise SdkError(f"Resource not found: {path}", "NOT_FOUND", 404)

            if not response.is_success:
                error_text = response.text
                raise SdkError(
                    f"API error: {error_text}",
                    "API_ERROR",
                    response.status_code,
                )

            return response.json()

        except httpx.TimeoutException:
            raise SdkError("Request timeout", "TIMEOUT")
        except httpx.RequestError as e:
            raise SdkError(str(e), "NETWORK_ERROR")
