"""ObelyZK SDK — verifiable ML inference on Starknet.

Quick start:
    >>> from obelyzk import ObelyzkClient
    >>> client = ObelyzkClient("http://localhost:8080")
    >>> result = client.prove("smollm2-135m", [1.0, 2.0, 3.0])
    >>> print(result["proof_hash"])
"""

__version__ = "0.2.0"

import asyncio
import os
from typing import Any, Optional

import httpx


DEFAULT_URL = os.environ.get("OBELYSK_PROVER_URL", "https://api.obelysk.xyz")
DEFAULT_CONTRACT = "0x526fcdb940f92dc50bc3a234ffafe6d08d7b2e3b69f6cb41678331ee6a5a03c"


class ObelyzkClient:
    """Synchronous client for ObelyZK prove-server.

    Args:
        url: Prover URL. Default: $OBELYSK_PROVER_URL or https://api.obelysk.xyz
        api_key: API key for authentication. Default: $OBELYSK_API_KEY
        timeout: Request timeout in seconds.
    """

    def __init__(
        self,
        url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = 300.0,
    ):
        self._url = (url or DEFAULT_URL).rstrip("/")
        self._api_key = api_key or os.environ.get("OBELYSK_API_KEY")
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        self._client = httpx.Client(
            base_url=self._url, timeout=timeout, headers=headers
        )

    def health(self) -> dict[str, Any]:
        """Check prover health. Returns status, gpu_available, loaded_models."""
        return self._get("/health")

    def models(self) -> list[dict[str, Any]]:
        """List loaded models."""
        return self._get("/api/v1/models")

    def prove(
        self,
        model: str,
        input: list[float],
        *,
        gpu: bool = True,
        on_chain: bool = False,
        recursive: bool = True,
        poll_interval: float = 2.0,
        timeout: float = 600.0,
    ) -> dict[str, Any]:
        """Prove model inference and optionally verify on-chain.

        Args:
            model: Model name or ID.
            input: Input tensor as flat array.
            gpu: Use GPU acceleration.
            on_chain: Submit proof to Starknet after proving.
            recursive: Use recursive STARK compression (single TX).
            poll_interval: Seconds between status polls.
            timeout: Maximum wait time.

        Returns:
            Dict with proof_id, output, proof_hash, io_commitment,
            prove_time_ms, calldata_felts, and optionally tx_hash.
        """
        if on_chain:
            return self._post("/api/v1/attest", {
                "model_id": model,
                "input": input,
                "gpu": gpu,
                "submit_onchain": True,
                "recursive": recursive,
            })

        # Async prove with polling
        resp = self._post("/api/v1/prove", {
            "model_id": model,
            "input": input,
            "gpu": gpu,
        })
        job_id = resp.get("job_id")
        if not job_id:
            return resp  # Blocking response

        import time
        start = time.time()
        while time.time() - start < timeout:
            status = self._get(f"/api/v1/prove/{job_id}")
            if status.get("status") == "completed":
                return self._get(f"/api/v1/prove/{job_id}/result")
            if status.get("status") == "failed":
                raise RuntimeError(f"Prove job {job_id} failed: {status}")
            time.sleep(poll_interval)
        raise TimeoutError(f"Prove job {job_id} timed out after {timeout}s")

    def infer(
        self,
        model: str,
        input: list[float],
        *,
        gpu: bool = True,
    ) -> dict[str, Any]:
        """Blocking inference: run model + generate proof in one call.

        Returns:
            Dict with proof_id, output, io_commitment, prove_time_ms.
        """
        return self._post("/api/v1/infer", {
            "model_id": model,
            "input": input,
            "gpu": gpu,
            "include_output": True,
        })

    def attest(
        self,
        model: str,
        input: list[float],
        *,
        gpu: bool = True,
        recursive: bool = True,
    ) -> dict[str, Any]:
        """Full attestation: prove + submit on-chain.

        Returns:
            Dict with proof_id, tx_hashes, verification_status,
            io_commitment, prove_time_ms.
        """
        return self._post("/api/v1/attest", {
            "model_id": model,
            "input": input,
            "gpu": gpu,
            "submit_onchain": True,
            "recursive": recursive,
        })

    def classify(
        self,
        target: str,
        value: str = "0",
        selector: str = "",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Classify a transaction for threat scoring.

        Returns:
            Dict with decision, threat_score, scores, io_commitment.
        """
        return self._post("/api/v1/classify", {
            "target": target,
            "value": value,
            "selector": selector,
            **kwargs,
        })

    def verify(self, proof_hash: str) -> dict[str, Any]:
        """Check if a proof was verified on-chain."""
        return self._get(f"/api/v1/verify/{proof_hash}")

    def _get(self, path: str) -> Any:
        r = self._client.get(path)
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, data: dict) -> Any:
        r = self._client.post(path, json=data)
        r.raise_for_status()
        return r.json()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self._client.close()


class AsyncObelyzkClient:
    """Async client for ObelyZK prove-server.

    Usage:
        async with AsyncObelyzkClient() as client:
            result = await client.prove("smollm2-135m", [1.0, 2.0])
    """

    def __init__(
        self,
        url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = 300.0,
    ):
        self._url = (url or DEFAULT_URL).rstrip("/")
        self._api_key = api_key or os.environ.get("OBELYSK_API_KEY")
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        self._client = httpx.AsyncClient(
            base_url=self._url, timeout=timeout, headers=headers
        )

    async def health(self) -> dict[str, Any]:
        return await self._get("/health")

    async def models(self) -> list[dict[str, Any]]:
        return await self._get("/api/v1/models")

    async def prove(
        self,
        model: str,
        input: list[float],
        *,
        gpu: bool = True,
        on_chain: bool = False,
        recursive: bool = True,
    ) -> dict[str, Any]:
        if on_chain:
            return await self._post("/api/v1/attest", {
                "model_id": model, "input": input, "gpu": gpu,
                "submit_onchain": True, "recursive": recursive,
            })
        resp = await self._post("/api/v1/prove", {
            "model_id": model, "input": input, "gpu": gpu,
        })
        job_id = resp.get("job_id")
        if not job_id:
            return resp
        while True:
            status = await self._get(f"/api/v1/prove/{job_id}")
            if status.get("status") == "completed":
                return await self._get(f"/api/v1/prove/{job_id}/result")
            if status.get("status") == "failed":
                raise RuntimeError(f"Failed: {status}")
            await asyncio.sleep(2.0)

    async def infer(self, model: str, input: list[float], *, gpu: bool = True) -> dict:
        return await self._post("/api/v1/infer", {
            "model_id": model, "input": input, "gpu": gpu, "include_output": True,
        })

    async def attest(self, model: str, input: list[float], **kw) -> dict:
        return await self._post("/api/v1/attest", {
            "model_id": model, "input": input, "gpu": True,
            "submit_onchain": True, "recursive": True, **kw,
        })

    async def classify(self, target: str, **kw) -> dict:
        return await self._post("/api/v1/classify", {"target": target, **kw})

    async def _get(self, path: str) -> Any:
        r = await self._client.get(path)
        r.raise_for_status()
        return r.json()

    async def _post(self, path: str, data: dict) -> Any:
        r = await self._client.post(path, json=data)
        r.raise_for_status()
        return r.json()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self._client.aclose()


__all__ = [
    "ObelyzkClient",
    "AsyncObelyzkClient",
    "DEFAULT_CONTRACT",
    "__version__",
]
