"""
BitSage ZKML Clients

Provides ZkmlProverClient (REST API wrapper for prove-server) and
ZkmlVerifierClient (Starknet RPC wrapper for on-chain verification reads).
"""

import asyncio
import os
from datetime import datetime
from typing import Optional, Callable, Awaitable

import httpx

from bitsage.client import SdkError
from bitsage.zkml_types import (
    ZkmlChatResult,
    ZkmlHealthResponse,
    ZkmlInferResult,
    ZkmlJobStatus,
    ZkmlModelInfo,
    ZkmlProveRequest,
    ZkmlProveResult,
    ZkmlProveStatus,
)

# Default prover URL (local prove-server)
DEFAULT_PROVER_URL = "https://prover.bitsage.network"

# Default StweMlStarkVerifier on Starknet Sepolia
DEFAULT_VERIFIER_ADDRESS = (
    os.environ.get("ZKML_VERIFIER_ADDRESS")
    or "0x005928ac548dc2719ef1b34869db2b61c2a55a4b148012fad742262a8d674fba"
)

# Default Starknet Sepolia RPC
DEFAULT_RPC_URL = "https://starknet-sepolia.public.blastapi.io"


class ZkmlProverClient:
    """
    Async client for the BitSage ZKML prove-server REST API.

    Example:
        >>> async def main():
        ...     client = ZkmlProverClient()
        ...     health = await client.health()
        ...     print(f"GPU: {health.gpu_available}")
        ...
        ...     result = await client.prove("model-abc", gpu=True)
        ...     print(f"Calldata length: {len(result.calldata)}")
    """

    def __init__(
        self,
        prover_url: Optional[str] = None,
        timeout: float = 300.0,
    ):
        self._base_url = (
            prover_url
            or os.environ.get("BITSAGE_PROVER_URL")
            or DEFAULT_PROVER_URL
        )
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._client.aclose()

    async def health(self) -> ZkmlHealthResponse:
        """GET /health - Check prover server health."""
        data = await self._request("GET", "/health")
        return ZkmlHealthResponse(**data)

    async def load_model(
        self,
        path: str,
        description: Optional[str] = None,
    ) -> ZkmlModelInfo:
        """POST /api/v1/models - Load a model for proving."""
        body: dict = {"model_path": path}
        if description is not None:
            body["description"] = description
        data = await self._request("POST", "/api/v1/models", json=body)
        return ZkmlModelInfo(**data)

    async def get_model(self, model_id: str) -> ZkmlModelInfo:
        """GET /api/v1/models/{id} - Get model info."""
        data = await self._request("GET", f"/api/v1/models/{model_id}")
        return ZkmlModelInfo(**data)

    async def submit_prove(
        self,
        request: ZkmlProveRequest,
    ) -> tuple[str, ZkmlJobStatus]:
        """POST /api/v1/prove - Submit a proving job."""
        data = await self._request(
            "POST", "/api/v1/prove", json=request.model_dump()
        )
        return data["job_id"], ZkmlJobStatus(data.get("status", "queued"))

    async def get_prove_status(self, job_id: str) -> ZkmlProveStatus:
        """GET /api/v1/prove/{id} - Get proving job status."""
        data = await self._request("GET", f"/api/v1/prove/{job_id}")
        return ZkmlProveStatus(**data)

    async def get_prove_result(self, job_id: str) -> ZkmlProveResult:
        """GET /api/v1/prove/{id}/result - Get completed proof result."""
        data = await self._request("GET", f"/api/v1/prove/{job_id}/result")
        return ZkmlProveResult(**data)

    async def prove(
        self,
        model_id: str,
        *,
        input: Optional[list[float]] = None,
        gpu: Optional[bool] = None,
        security: Optional[str] = None,
        on_progress: Optional[Callable[[ZkmlProveStatus], Awaitable[None]]] = None,
        poll_interval: float = 2.0,
        timeout: float = 600.0,
    ) -> ZkmlProveResult:
        """
        Submit a proving job and poll until completion.

        Args:
            model_id: ID of the loaded model.
            input: Optional input tensor values.
            gpu: Whether to use GPU acceleration (default: server decides).
            security: Security mode ("auto", "tee", "zk-only").
            on_progress: Optional async callback for status updates.
            poll_interval: Seconds between status polls.
            timeout: Maximum seconds to wait for completion.

        Returns:
            ZkmlProveResult with calldata, commitments, and timing.

        Raises:
            SdkError: If the job fails or times out.
        """
        req_kwargs: dict = {"model_id": model_id}
        if input is not None:
            req_kwargs["input"] = input
        if gpu is not None:
            req_kwargs["gpu"] = gpu
        if security is not None:
            req_kwargs["security"] = security

        request = ZkmlProveRequest(**req_kwargs)
        job_id, _ = await self.submit_prove(request)

        start = datetime.now()
        while (datetime.now() - start).total_seconds() < timeout:
            status = await self.get_prove_status(job_id)

            if on_progress is not None:
                await on_progress(status)

            if status.status == ZkmlJobStatus.COMPLETED:
                return await self.get_prove_result(job_id)
            elif status.status == ZkmlJobStatus.FAILED:
                raise SdkError(
                    f"Proving job {job_id} failed",
                    "PROVE_FAILED",
                )

            await asyncio.sleep(poll_interval)

        raise SdkError("Timeout waiting for proving job", "TIMEOUT")

    async def chat(
        self,
        model_id: str,
        prompt: str,
        *,
        include_calldata: bool = False,
        gpu: bool = True,
    ) -> ZkmlChatResult:
        """Prove ML inference on a text prompt.

        The server tokenizes the prompt, embeds it, runs the forward pass
        with a GKR proof, and returns the predicted next token.

        Example::

            async with ZkmlProverClient("https://api.bitsage.network", api_key="...") as c:
                r = await c.chat("smollm2-135m", "Hello world")
                print(r.predicted_text)  # predicted next token
                print(r.proof_id)        # proof identifier
        """
        data = await self._request("POST", "/api/v1/chat", json={
            "model_id": model_id,
            "prompt": prompt,
            "include_calldata": include_calldata,
            "gpu": gpu,
        })
        return ZkmlChatResult(**data)

    async def infer_sync(
        self,
        model_id: str,
        *,
        input: Optional[list[float]] = None,
        prompt: Optional[str] = None,
        include_calldata: bool = False,
        include_output: bool = True,
        gpu: bool = True,
    ) -> ZkmlInferResult:
        """Synchronous provable inference (blocks until proof is ready).

        Provide either ``input`` (raw f32 array) or ``prompt`` (text).

        Example::

            r = await c.infer_sync("smollm2-135m", prompt="Hello world")
            print(r.output)          # model output
            print(r.io_commitment)   # proof binding
        """
        body: dict = {
            "model_id": model_id,
            "include_calldata": include_calldata,
            "include_output": include_output,
            "gpu": gpu,
        }
        if input is not None:
            body["input"] = input
        if prompt is not None:
            body["prompt"] = prompt
        data = await self._request("POST", "/api/v1/infer", json=body)
        return ZkmlInferResult(**data)

    async def _request(
        self,
        method: str,
        path: str,
        json: Optional[dict] = None,
    ) -> dict:
        try:
            response = await self._client.request(method, path, json=json)

            if response.status_code == 404:
                raise SdkError(f"Resource not found: {path}", "NOT_FOUND", 404)

            if not response.is_success:
                raise SdkError(
                    f"Prover API error: {response.text}",
                    "API_ERROR",
                    response.status_code,
                )

            return response.json()

        except httpx.TimeoutException:
            raise SdkError("Prover request timeout", "TIMEOUT")
        except httpx.RequestError as e:
            raise SdkError(str(e), "NETWORK_ERROR")


class ZkmlVerifierClient:
    """
    Async client for reading on-chain ZKML verification state from Starknet.

    Uses starknet_py to call view functions on the EloVerifier contract.

    Example:
        >>> async def main():
        ...     client = ZkmlVerifierClient()
        ...     verified = await client.is_proof_verified("0xabc...")
        ...     print(f"Verified: {verified}")
    """

    def __init__(
        self,
        verifier_address: str = DEFAULT_VERIFIER_ADDRESS,
        rpc_url: str = DEFAULT_RPC_URL,
    ):
        self._verifier_address = verifier_address
        self._rpc_url = rpc_url
        self._contract = None
        self._lock = asyncio.Lock()

    async def _get_contract(self):
        """Lazily initialize the starknet-py Contract instance (thread-safe)."""
        if self._contract is not None:
            return self._contract
        async with self._lock:
            if self._contract is None:
                from starknet_py.net.full_node_client import FullNodeClient
                from starknet_py.contract import Contract

                client = FullNodeClient(node_url=self._rpc_url)
                self._contract = await Contract.from_address(
                    address=int(self._verifier_address, 16),
                    provider=client,
                )
        return self._contract

    async def get_model_commitment(self, model_id: str) -> str:
        """Read the weight commitment for a model from on-chain storage."""
        contract = await self._get_contract()
        (result,) = await contract.functions["get_model_commitment"].call(
            int(model_id, 16)
        )
        return hex(result)

    async def get_verification_count(self, model_id: str) -> int:
        """Read how many proofs have been verified for a model."""
        contract = await self._get_contract()
        (result,) = await contract.functions["get_verification_count"].call(
            int(model_id, 16)
        )
        return result

    async def is_proof_verified(self, proof_hash: str) -> bool:
        """Check whether a specific proof has been verified on-chain."""
        contract = await self._get_contract()
        (result,) = await contract.functions["is_proof_verified"].call(
            int(proof_hash, 16)
        )
        return bool(result)
