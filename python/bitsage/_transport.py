"""
Internal HTTP transport — the seam between :mod:`bitsage.app` and the
coordinator's ``/api/v1/jobs/run-sync`` endpoint.

Kept separate from :mod:`bitsage.app` to avoid circular imports and to give
the HTTP layer a single, test-isolatable home. The public decorator API
stays unaware of httpx, retries, and credential sourcing.

Auth + endpoint resolution follows the usual ladder:

    1. Explicit argument (future: per-App override) — not wired yet.
    2. ``BITSAGE_API_URL`` / ``BITSAGE_API_KEY`` env vars.
    3. ``~/.bitsage/credentials`` JSON (written by the CLI's ``login``).
    4. Fallback default URL; auth error if no key found.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

import httpx

if TYPE_CHECKING:  # pragma: no cover
    from bitsage.app import ExecutionResult, Function
    from bitsage.app import App as _App  # noqa: F401


DEFAULT_API_URL = "https://api.bitsage.network"
CREDENTIALS_PATH = Path.home() / ".bitsage" / "credentials"

# Wall-clock ceiling for the HTTP request itself. Separate from the
# job-level `max_seconds`: the server holds the connection for up to
# `max_seconds + 30s`, so our client timeout must cover that plus slack.
_HTTP_TIMEOUT_FLOOR_SECONDS = 60


# ─── Exceptions ───────────────────────────────────────────────────────


class BitSageHttpError(Exception):
    """Base class for all HTTP-layer failures from the transport.

    Carries the HTTP status code and the structured ``error.code`` string
    emitted by the coordinator so callers can switch on either.
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        code: str,
        job_id: Optional[str] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.job_id = job_id


class BadRequestError(BitSageHttpError):
    """HTTP 400 — request shape was rejected (bad tier, missing code, etc)."""


class AuthenticationError(BitSageHttpError):
    """HTTP 401 / 403 — bad or missing API key."""


class CostCapExceededError(BitSageHttpError):
    """HTTP 402 — worst-case cost would exceed the caller's ``max_cost_credits``."""


class NotFoundError(BitSageHttpError):
    """HTTP 404 — endpoint or resource not found."""


class HandlerTimeoutError(BitSageHttpError):
    """HTTP 504 — job didn't reach terminal state within the handler's hold budget.

    The coordinator returns the ``job_id`` so the caller can resume polling
    via the async job API. ``self.job_id`` carries it.
    """


class ServiceUnavailableError(BitSageHttpError):
    """HTTP 503 — no workers available to pick up the job."""


class BitSageServerError(BitSageHttpError):
    """HTTP 5xx (other than 503/504) — coordinator-internal failure."""


class RemoteExecutionError(Exception):
    """Raised when a job reaches a terminal state of ``failed`` / ``cancelled`` / ``timed_out``.

    Distinct from :class:`BitSageHttpError` — the HTTP call succeeded, but
    the *job* itself failed. Carries the server-reported error detail.
    """

    def __init__(
        self,
        message: str,
        *,
        job_id: str,
        status: str,
        code: str,
        traceback: Optional[str] = None,
    ):
        super().__init__(message)
        self.job_id = job_id
        self.status = status
        self.code = code
        self.traceback = traceback


# ─── Credential + URL resolution ─────────────────────────────────────


def _resolve_api_url() -> str:
    return os.environ.get("BITSAGE_API_URL") or DEFAULT_API_URL


def _resolve_auth_token() -> Optional[str]:
    """Look up the API token via env → credentials file → None."""
    token = os.environ.get("BITSAGE_API_KEY")
    if token:
        return token
    if CREDENTIALS_PATH.exists():
        try:
            creds = json.loads(CREDENTIALS_PATH.read_text())
            return creds.get("token")
        except Exception:
            return None
    return None


# ─── Main entry point ────────────────────────────────────────────────


async def run_sync_invoke(
    *,
    app: "_App",
    function: "Function",
    request: dict[str, Any],
    http_client: Optional[httpx.AsyncClient] = None,
) -> "ExecutionResult":
    """Submit a run-sync request and return the parsed :class:`ExecutionResult`.

    Parameters
    ----------
    app : App
        The decorating app — used for authentication scope today, will carry
        per-App client config overrides in a future release.
    function : Function
        The invoked function — used to carry tier + proof expectations into
        the response parsing so we can populate :class:`ProofReceipt` and
        :class:`UsageReport` with correct typing.
    request : dict
        The JSON-serialisable request body, produced by
        :meth:`Function._build_request_payload`.
    http_client : httpx.AsyncClient, optional
        Inject a pre-configured client. Exposed for tests so they can attach
        a ``respx`` / ``pytest-httpx`` mock transport. Production callers
        should leave this ``None`` and let the function manage lifecycle.
    """
    # Import locally to avoid circulars at module load.
    from bitsage.app import ExecutionResult, UsageReport
    from bitsage.proof import ProofReceipt
    from bitsage.service_tier import ServiceTier

    api_url = _resolve_api_url()
    token = _resolve_auth_token()
    if not token:
        raise AuthenticationError(
            "no API key found — set BITSAGE_API_KEY or run `bitsage login`",
            status_code=401,
            code="no_credentials",
        )

    # Timeout: max_seconds from the request plus 30s handler buffer plus
    # 30s network slack. Minimum floor prevents sub-second requests from
    # being starved by cold TLS handshakes.
    max_seconds = int(request.get("max_seconds", 0))
    timeout_s = max(_HTTP_TIMEOUT_FLOOR_SECONDS, max_seconds + 60)

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": f"bitsage-py/{_sdk_version()}",
    }

    endpoint = f"{api_url.rstrip('/')}/api/v1/jobs/run-sync"

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=timeout_s)
    try:
        resp = await client.post(endpoint, json=request, headers=headers)
    finally:
        if owns_client:
            await client.aclose()

    # ─── Error handling ─────────────────────────────────────────────
    if resp.status_code >= 400:
        _raise_for_error_response(resp)

    # ─── Success path ───────────────────────────────────────────────
    body = resp.json()

    # Terminal job status of `failed` / `cancelled` / `timed_out` surfaces
    # as HTTP 200 with an error envelope — a successful HTTP round-trip of
    # an unsuccessful *job*. We promote to an SDK exception unless the
    # caller has asked for status to be returned verbatim via a future
    # `return_exceptions=True`-style parameter (not wired yet).
    status = body.get("status")
    if status in {"failed", "cancelled", "timed_out"}:
        err = body.get("error") or {}
        raise RemoteExecutionError(
            err.get("message") or f"job ended in {status}",
            job_id=body.get("job_id", "unknown"),
            status=status,
            code=err.get("code", "unknown"),
            traceback=err.get("traceback"),
        )

    # ─── Build ExecutionResult ──────────────────────────────────────
    usage_body = body.get("usage") or {}
    tier = ServiceTier(usage_body.get("tier", function.config.tier.value))
    usage = UsageReport(
        tier=tier,
        wall_seconds=float(usage_body.get("wall_seconds", 0.0)),
        billable_credits=float(usage_body.get("billable_credits", 0.0)),
        cpu_seconds=_optional_float(usage_body.get("cpu_seconds")),
        gpu_seconds=_optional_float(usage_body.get("gpu_seconds")),
    )

    proof: Optional[ProofReceipt] = None
    proof_body = body.get("proof")
    if proof_body is not None:
        proof = ProofReceipt(
            proof_hash=proof_body["proof_hash"],
            proof_commitment=proof_body["proof_commitment"],
            verifier_address=proof_body["verifier_address"],
            on_chain_tx=proof_body.get("on_chain_tx"),
            # Best-effort: pick up the RPC URL from env so `.verify()` works
            # without extra wiring. The SDK's BitSageClient carries a config
            # we could forward here once App wires it through.
            starknet_rpc_url=os.environ.get("STARKNET_RPC_URL"),
        )

    return ExecutionResult(
        # `result_inline` lands server-side in Day 3 when the worker-side
        # Python runtime writes return values back. Until then this stays
        # `None`; the handle remains usable for billing + proof verification.
        value=body.get("result_inline"),
        usage=usage,
        proof=proof,
        job_id=body.get("job_id"),
        worker_id=body.get("worker_id"),
    )


# ─── Response → exception mapping ────────────────────────────────────


def _raise_for_error_response(resp: httpx.Response) -> None:
    """Translate an HTTP error response into the right SDK exception."""
    try:
        body = resp.json()
        err = body.get("error") or {}
        job_id = body.get("job_id")
    except ValueError:
        err = {"code": "http_error", "message": resp.text or resp.reason_phrase}
        job_id = None

    message = err.get("message") or f"HTTP {resp.status_code}"
    code = err.get("code") or "http_error"

    kwargs = dict(status_code=resp.status_code, code=code, job_id=job_id)

    if resp.status_code == 400:
        raise BadRequestError(message, **kwargs)
    if resp.status_code in (401, 403):
        raise AuthenticationError(message, **kwargs)
    if resp.status_code == 402:
        raise CostCapExceededError(message, **kwargs)
    if resp.status_code == 404:
        raise NotFoundError(message, **kwargs)
    if resp.status_code == 503:
        raise ServiceUnavailableError(message, **kwargs)
    if resp.status_code == 504:
        raise HandlerTimeoutError(message, **kwargs)
    raise BitSageServerError(message, **kwargs)


# ─── Helpers ─────────────────────────────────────────────────────────


def _optional_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    return float(v)


def _sdk_version() -> str:
    try:
        from bitsage import __version__

        return __version__
    except Exception:  # pragma: no cover - defensive
        return "unknown"


__all__ = [
    "run_sync_invoke",
    # Exceptions
    "BitSageHttpError",
    "BadRequestError",
    "AuthenticationError",
    "CostCapExceededError",
    "NotFoundError",
    "HandlerTimeoutError",
    "ServiceUnavailableError",
    "BitSageServerError",
    "RemoteExecutionError",
]
