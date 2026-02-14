"""
BitSage Easy API — High-level convenience functions.

Usage:
    import bitsage

    bitsage.login()
    job = await bitsage.train(model="llama-3.1-8b", dataset="./data/", epochs=3)
    result = await job.wait()
    output = await bitsage.infer("qwen-14b", "What is ZKML?")
"""

import asyncio
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Any

from bitsage.client import BitSageClient, ClientConfig
from bitsage.types import (
    SubmitJobRequest,
    JobType,
    JobStatus,
    JobResult,
    JobStatusResponse,
    WorkerInfo,
)

# ─── Credentials ────────────────────────────────────────────────────────────

CREDENTIALS_PATH = Path.home() / ".bitsage" / "credentials"


@dataclass
class Credentials:
    type: str  # "api_key" or "wallet"
    token: str
    address: Optional[str] = None
    expires_at: Optional[str] = None


def _load_credentials() -> Optional[Credentials]:
    """Load credentials from ~/.bitsage/credentials"""
    if not CREDENTIALS_PATH.exists():
        return None
    try:
        data = json.loads(CREDENTIALS_PATH.read_text())
        return Credentials(**data)
    except Exception:
        return None


def _get_client(
    api_url: Optional[str] = None,
    api_key: Optional[str] = None,
) -> BitSageClient:
    """Create a client from credentials or explicit config."""
    creds = _load_credentials()

    url = api_url or os.environ.get("BITSAGE_API_URL")
    token = api_key or os.environ.get("BITSAGE_API_KEY")

    if not url and creds:
        url = None  # Use default
    if not token and creds:
        token = creds.token

    config = ClientConfig()
    if url:
        config.api_url = url

    client = BitSageClient(config=config)

    # Inject auth header
    if token:
        client._client.headers["Authorization"] = f"Bearer {token}"

    return client


def _run(coro):
    """Run async coroutine from sync context."""
    try:
        loop = asyncio.get_running_loop()
        # Already in an async context — return the coroutine for await
        return coro
    except RuntimeError:
        return asyncio.run(coro)


# ─── Job Handle ─────────────────────────────────────────────────────────────


class JobHandle:
    """Handle to a submitted job with convenience methods."""

    def __init__(self, job_id: str, client: BitSageClient):
        self.job_id = job_id
        self._client = client

    def __repr__(self) -> str:
        return f"JobHandle(job_id={self.job_id!r})"

    async def status(self) -> JobStatusResponse:
        """Get current job status."""
        return await self._client.get_job_status(self.job_id)

    async def wait(self, poll_interval: float = 2.0, timeout: float = 86400.0) -> JobResult:
        """Wait for job completion and return the result."""
        return await self._client.wait_for_completion(
            self.job_id,
            poll_interval_secs=poll_interval,
            timeout_secs=timeout,
        )

    async def cancel(self) -> None:
        """Cancel the job."""
        await self._client.cancel_job(self.job_id)

    async def result(self) -> JobResult:
        """Get the job result (must be completed)."""
        return await self._client.get_job_result(self.job_id)

    async def download(self, output_dir: str = ".") -> list[str]:
        """Download result files to a local directory."""
        res = await self.result()
        downloaded = []
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)

        for file_url in res.output_files:
            import httpx

            filename = file_url.split("/")[-1]
            dest = out / filename
            async with httpx.AsyncClient() as http:
                r = await http.get(file_url)
                dest.write_bytes(r.content)
            downloaded.append(str(dest))

        return downloaded


# ─── Public API ─────────────────────────────────────────────────────────────


def login(
    api_key: Optional[str] = None,
    api_url: Optional[str] = None,
) -> bool:
    """
    Authenticate with BitSage.

    If no arguments, reads from ~/.bitsage/credentials (shared with CLI).
    Returns True if credentials are valid.

    Args:
        api_key: Explicit API key (or set BITSAGE_API_KEY env var)
        api_url: Coordinator URL (or set BITSAGE_API_URL env var)
    """
    if api_key:
        # Store for this session via env var
        os.environ["BITSAGE_API_KEY"] = api_key
    if api_url:
        os.environ["BITSAGE_API_URL"] = api_url

    # Validate credentials exist
    client = _get_client(api_url=api_url, api_key=api_key)
    has_auth = "Authorization" in client._client.headers
    creds = _load_credentials()

    if has_auth or creds:
        return True

    raise RuntimeError(
        "No credentials found. Either:\n"
        "  1. Run `bitsage login` from CLI first, or\n"
        "  2. Pass api_key='...', or\n"
        "  3. Set BITSAGE_API_KEY environment variable"
    )


async def train(
    model: str,
    dataset: Optional[str] = None,
    epochs: int = 3,
    batch_size: int = 4,
    lr: float = 2e-5,
    method: str = "lora",
    gpu: str = "any",
    **kwargs: Any,
) -> JobHandle:
    """
    Submit a training job.

    Args:
        model: Model name or HuggingFace ID (e.g., "llama-3.1-8b")
        dataset: Local path, S3 URL, or HuggingFace dataset
        epochs: Number of training epochs
        batch_size: Per-GPU batch size
        lr: Learning rate
        method: Training method (full, lora, qlora)
        gpu: GPU tier preference (h100, a100, any)

    Returns:
        JobHandle for monitoring and downloading results
    """
    client = _get_client()

    # Handle local dataset
    input_data = ""
    if dataset and not dataset.startswith(("s3://", "https://", "hf://")):
        p = Path(dataset)
        if p.exists():
            input_data = p.read_bytes().hex()

    request = SubmitJobRequest(
        job_type=JobType.ai_inference(model_type=model, batch_size=batch_size),
        input_data=input_data,
        max_duration_secs=86400,
        **kwargs,
    )

    # Override parameters for training
    request.job_type.type = "ai_inference"
    if hasattr(request.job_type, "__dict__"):
        request.job_type.__dict__.update({
            "task": "train",
            "model_id": model,
            "method": method,
            "epochs": epochs,
            "learning_rate": lr,
            "dataset_url": dataset if dataset and dataset.startswith(("s3://", "https://", "hf://")) else None,
        })

    response = await client.submit_job(request)
    return JobHandle(response.job_id, client)


async def run(
    script: str,
    gpu: str = "any",
    env: Optional[dict[str, str]] = None,
    timeout: int = 3600,
    **kwargs: Any,
) -> JobHandle:
    """
    Run an arbitrary script on a remote GPU worker.

    Args:
        script: Path to script file or inline script content
        gpu: GPU tier preference
        env: Environment variables dict
        timeout: Max runtime in seconds

    Returns:
        JobHandle for monitoring
    """
    client = _get_client()

    # Read script content
    p = Path(script)
    if p.exists():
        script_content = p.read_text()
        script_name = p.name
    else:
        script_content = script
        script_name = "inline.py"

    request = SubmitJobRequest(
        job_type=JobType.custom(name="script_execution"),
        input_data=script_content,
        max_duration_secs=timeout,
        **kwargs,
    )

    if hasattr(request.job_type, "__dict__"):
        request.job_type.__dict__.update({
            "script_name": script_name,
            "env": env or {},
            "gpu_tier": gpu,
        })

    response = await client.submit_job(request)
    return JobHandle(response.job_id, client)


async def infer(
    model: str,
    prompt: str,
    system_prompt: Optional[str] = None,
    max_tokens: int = 512,
    temperature: float = 0.7,
    **kwargs: Any,
) -> str:
    """
    Run inference and return the output directly.

    Args:
        model: Model name (e.g., "qwen-14b", "llama-3.1-8b")
        prompt: Input prompt text
        system_prompt: Optional system prompt
        max_tokens: Maximum output tokens
        temperature: Sampling temperature

    Returns:
        Model output as string
    """
    client = _get_client()

    request = SubmitJobRequest(
        job_type=JobType.ai_inference(model_type=model, batch_size=1),
        input_data=prompt,
        max_duration_secs=120,
        **kwargs,
    )

    if hasattr(request.job_type, "__dict__"):
        request.job_type.__dict__.update({
            "task": "inference",
            "system_prompt": system_prompt,
            "max_tokens": max_tokens,
            "temperature": temperature,
        })

    response = await client.submit_job(request)
    result = await client.wait_for_completion(response.job_id, timeout_secs=120)

    return result.output_data or ""


async def workers() -> list[WorkerInfo]:
    """List available GPU workers on the network."""
    client = _get_client()
    return await client.list_workers()


async def status() -> dict[str, Any]:
    """Get network status and your job summary."""
    client = _get_client()
    stats = await client.get_network_stats()
    return {
        "total_workers": stats.total_workers,
        "active_workers": stats.active_workers,
        "jobs_completed": stats.total_jobs_completed,
        "jobs_in_progress": stats.jobs_in_progress,
        "network_utilization": stats.network_utilization,
    }
