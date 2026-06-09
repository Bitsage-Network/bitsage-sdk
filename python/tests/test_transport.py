"""Tests for bitsage._transport — the HTTP seam.

Uses :class:`httpx.MockTransport` to intercept requests without extra deps.
Covers the happy path, the full HTTP error-code table, and the proof-receipt
+ usage-report parsing branches.
"""

from __future__ import annotations

import json
from typing import Any, Callable

import httpx
import pytest

import bitsage
from bitsage._transport import (
    AuthenticationError,
    BadRequestError,
    BitSageServerError,
    CostCapExceededError,
    HandlerTimeoutError,
    NotFoundError,
    RemoteExecutionError,
    ServiceUnavailableError,
    run_sync_invoke,
)
from bitsage.app import App
from bitsage.service_tier import ServiceTier


# ─── Helpers ─────────────────────────────────────────────────────────


def make_mock_client(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.AsyncClient:
    """Build an ``httpx.AsyncClient`` backed by a MockTransport."""
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def make_function(app: App | None = None, **kwargs):
    """Build a decorated function for the tests."""
    app = app or App("test")
    default_kwargs = {"tier": "cpu_standard"}
    default_kwargs.update(kwargs)

    @app.function(**default_kwargs)
    def f(x: int) -> int:
        return x * 2

    return f


def success_body(**overrides) -> dict[str, Any]:
    base = {
        "job_id": "job-abc",
        "status": "completed",
        "tier": "cpu_standard",
        "usage": {
            "tier": "cpu_standard",
            "wall_seconds": 2.347,
            "billable_credits": 0.0195,
        },
        "worker_id": "worker-xyz",
        "started_at": "2026-04-24T20:30:01Z",
        "completed_at": "2026-04-24T20:30:03Z",
    }
    base.update(overrides)
    return base


@pytest.fixture(autouse=True)
def _api_key_env(monkeypatch):
    """Every test runs with a valid BITSAGE_API_KEY in the env."""
    monkeypatch.setenv("BITSAGE_API_KEY", "bsk_test_key_for_unit_tests")
    monkeypatch.setenv("BITSAGE_API_URL", "https://coord.test")
    yield


# ─── Happy path ──────────────────────────────────────────────────────


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_success_returns_execution_result(self):
        fn = make_function()

        def handler(req: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=success_body())

        result = await run_sync_invoke(
            app=fn.app,
            function=fn,
            request={"tier": "cpu_standard", "max_seconds": 60},
            http_client=make_mock_client(handler),
        )
        assert result.job_id == "job-abc"
        assert result.worker_id == "worker-xyz"
        assert result.usage.tier == ServiceTier.CPU_STANDARD
        assert result.usage.wall_seconds == 2.347
        assert result.usage.billable_credits == pytest.approx(0.0195)
        assert result.proof is None

    @pytest.mark.asyncio
    async def test_sends_bearer_token_auth_header(self):
        captured = {}

        def handler(req: httpx.Request) -> httpx.Response:
            captured["auth"] = req.headers.get("authorization")
            captured["ua"] = req.headers.get("user-agent")
            return httpx.Response(200, json=success_body())

        fn = make_function()
        await run_sync_invoke(
            app=fn.app,
            function=fn,
            request={"tier": "cpu_standard", "max_seconds": 60},
            http_client=make_mock_client(handler),
        )
        assert captured["auth"] == "Bearer bsk_test_key_for_unit_tests"
        assert captured["ua"].startswith("bitsage-py/")

    @pytest.mark.asyncio
    async def test_posts_to_configured_endpoint(self):
        captured = {}

        def handler(req: httpx.Request) -> httpx.Response:
            captured["url"] = str(req.url)
            captured["body"] = json.loads(req.content)
            return httpx.Response(200, json=success_body())

        fn = make_function()
        payload = {
            "tier": "gpu_h100",
            "max_seconds": 60,
            "require_proof": True,
            "client_ref": "ciro-mc-1",
        }
        await run_sync_invoke(
            app=fn.app,
            function=fn,
            request=payload,
            http_client=make_mock_client(handler),
        )
        assert captured["url"] == "https://coord.test/api/v1/jobs/run-sync"
        assert captured["body"]["tier"] == "gpu_h100"
        assert captured["body"]["require_proof"] is True
        assert captured["body"]["client_ref"] == "ciro-mc-1"


# ─── Proof receipt parsing ───────────────────────────────────────────


class TestProofReceiptParsing:
    @pytest.mark.asyncio
    async def test_proof_absent_when_server_omits(self):
        fn = make_function()

        def handler(req: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=success_body())

        result = await run_sync_invoke(
            app=fn.app,
            function=fn,
            request={"tier": "cpu_standard", "max_seconds": 60},
            http_client=make_mock_client(handler),
        )
        assert result.proof is None

    @pytest.mark.asyncio
    async def test_proof_populated_when_server_emits(self):
        fn = make_function(tier="gpu_h100", require_proof=True)

        def handler(req: httpx.Request) -> httpx.Response:
            body = success_body(
                tier="gpu_h100",
                usage={
                    "tier": "gpu_h100",
                    "wall_seconds": 10.0,
                    "billable_credits": 3.333,
                },
                proof={
                    "proof_hash": "0xabc123",
                    "proof_commitment": "0xdef456",
                    "verifier_address": "0x0121d1e9882967e03399f153d57fc208f3d9bce69adc48d9e12d424502a8c005",
                    "on_chain_tx": "0xdeadbeef",
                },
            )
            return httpx.Response(200, json=body)

        result = await run_sync_invoke(
            app=fn.app,
            function=fn,
            request={"tier": "gpu_h100", "max_seconds": 60, "require_proof": True},
            http_client=make_mock_client(handler),
        )
        assert result.proof is not None
        assert result.proof.proof_hash == "0xabc123"
        assert result.proof.proof_commitment == "0xdef456"
        assert result.proof.on_chain_tx == "0xdeadbeef"
        # With no STARKNET_RPC_URL set, on_chain_url falls back to mainnet
        # voyager. The heuristic keys on the rpc URL string, not the verifier
        # address — this is intentional (same verifier binary runs on both nets).
        assert result.proof.on_chain_url == "https://voyager.online/tx/0xdeadbeef"

    @pytest.mark.asyncio
    async def test_proof_missing_on_chain_tx_is_allowed(self):
        fn = make_function(tier="gpu_h100", require_proof=True)

        def handler(req: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json=success_body(
                    tier="gpu_h100",
                    proof={
                        "proof_hash": "0xabc",
                        "proof_commitment": "0xdef",
                        "verifier_address": "0x0121d1e988",
                    },
                ),
            )

        result = await run_sync_invoke(
            app=fn.app,
            function=fn,
            request={"tier": "gpu_h100", "max_seconds": 60, "require_proof": True},
            http_client=make_mock_client(handler),
        )
        assert result.proof is not None
        assert result.proof.on_chain_tx is None


# ─── Terminal-state failures (HTTP 200 with error envelope) ──────────


class TestTerminalFailures:
    @pytest.mark.asyncio
    async def test_failed_status_raises_remote_execution_error(self):
        fn = make_function()

        def handler(req: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json=success_body(
                    status="failed",
                    error={
                        "code": "worker_error",
                        "message": "Python crashed: ZeroDivisionError",
                    },
                ),
            )

        with pytest.raises(RemoteExecutionError) as exc:
            await run_sync_invoke(
                app=fn.app,
                function=fn,
                request={"tier": "cpu_standard", "max_seconds": 60},
                http_client=make_mock_client(handler),
            )
        assert exc.value.status == "failed"
        assert exc.value.code == "worker_error"
        assert exc.value.job_id == "job-abc"
        assert "ZeroDivisionError" in str(exc.value)

    @pytest.mark.asyncio
    async def test_timed_out_status_raises_remote_execution_error(self):
        fn = make_function()

        def handler(req: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json=success_body(
                    status="timed_out",
                    error={"code": "job_timeout", "message": "exceeded 60s"},
                ),
            )

        with pytest.raises(RemoteExecutionError) as exc:
            await run_sync_invoke(
                app=fn.app,
                function=fn,
                request={"tier": "cpu_standard", "max_seconds": 60},
                http_client=make_mock_client(handler),
            )
        assert exc.value.status == "timed_out"

    @pytest.mark.asyncio
    async def test_cancelled_status_raises_remote_execution_error(self):
        fn = make_function()

        def handler(req: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=success_body(status="cancelled"))

        with pytest.raises(RemoteExecutionError) as exc:
            await run_sync_invoke(
                app=fn.app,
                function=fn,
                request={"tier": "cpu_standard", "max_seconds": 60},
                http_client=make_mock_client(handler),
            )
        assert exc.value.status == "cancelled"


# ─── HTTP error mapping ──────────────────────────────────────────────


class TestHttpErrorMapping:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "status_code, exc_cls",
        [
            (400, BadRequestError),
            (401, AuthenticationError),
            (402, CostCapExceededError),
            (403, AuthenticationError),
            (404, NotFoundError),
            (503, ServiceUnavailableError),
            (504, HandlerTimeoutError),
            (500, BitSageServerError),
            (502, BitSageServerError),
            (522, BitSageServerError),
        ],
    )
    async def test_status_code_maps_to_exception(self, status_code: int, exc_cls: type):
        fn = make_function()

        def handler(req: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code,
                json={
                    "error": {"code": "probe", "message": f"HTTP {status_code} probe"},
                    "job_id": "job-xyz",
                },
            )

        with pytest.raises(exc_cls) as exc:
            await run_sync_invoke(
                app=fn.app,
                function=fn,
                request={"tier": "cpu_standard", "max_seconds": 60},
                http_client=make_mock_client(handler),
            )
        assert exc.value.status_code == status_code
        assert exc.value.code == "probe"

    @pytest.mark.asyncio
    async def test_504_carries_job_id_for_async_resumption(self):
        """504 is a special snowflake — the caller may want to keep polling."""
        fn = make_function()

        def handler(req: httpx.Request) -> httpx.Response:
            return httpx.Response(
                504,
                json={
                    "error": {
                        "code": "handler_timeout",
                        "message": "hold budget exhausted",
                    },
                    "job_id": "job-pending",
                },
            )

        with pytest.raises(HandlerTimeoutError) as exc:
            await run_sync_invoke(
                app=fn.app,
                function=fn,
                request={"tier": "cpu_standard", "max_seconds": 60},
                http_client=make_mock_client(handler),
            )
        assert exc.value.job_id == "job-pending"

    @pytest.mark.asyncio
    async def test_error_without_json_body_still_raises(self):
        """Coordinator hasn't always JSON; raw HTML/text errors must still work."""
        fn = make_function()

        def handler(req: httpx.Request) -> httpx.Response:
            return httpx.Response(502, content=b"<html>Bad Gateway</html>")

        with pytest.raises(BitSageServerError) as exc:
            await run_sync_invoke(
                app=fn.app,
                function=fn,
                request={"tier": "cpu_standard", "max_seconds": 60},
                http_client=make_mock_client(handler),
            )
        assert exc.value.status_code == 502


# ─── Credential resolution ──────────────────────────────────────────


class TestCredentialResolution:
    @pytest.mark.asyncio
    async def test_missing_api_key_raises_auth_error(self, monkeypatch):
        monkeypatch.delenv("BITSAGE_API_KEY", raising=False)
        monkeypatch.setattr(
            "bitsage._transport.CREDENTIALS_PATH",
            __import__("pathlib").Path("/nonexistent/credentials"),
        )

        fn = make_function()

        def handler(req: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=success_body())  # never reached

        with pytest.raises(AuthenticationError) as exc:
            await run_sync_invoke(
                app=fn.app,
                function=fn,
                request={"tier": "cpu_standard", "max_seconds": 60},
                http_client=make_mock_client(handler),
            )
        assert "no API key found" in str(exc.value)
        assert exc.value.code == "no_credentials"

    @pytest.mark.asyncio
    async def test_api_url_defaults_when_env_unset(self, monkeypatch):
        monkeypatch.delenv("BITSAGE_API_URL", raising=False)
        captured = {}

        def handler(req: httpx.Request) -> httpx.Response:
            captured["url"] = str(req.url)
            return httpx.Response(200, json=success_body())

        fn = make_function()
        await run_sync_invoke(
            app=fn.app,
            function=fn,
            request={"tier": "cpu_standard", "max_seconds": 60},
            http_client=make_mock_client(handler),
        )
        assert captured["url"].startswith("https://api.bitsage.network/")


# ─── End-to-end via Function.remote() ────────────────────────────────


class TestFunctionRemoteIntegration:
    """Final integration: decorator → .remote() → transport → ExecutionResult.

    Proves the full client-side loop closes. The network layer is still
    mocked (no real coordinator needed) — this tests the wiring between the
    Day 1 decorator and the Day 2 transport.
    """

    @pytest.mark.asyncio
    async def test_remote_returns_execution_result(self, monkeypatch):
        app = App("integration")

        @app.function(tier="cpu_standard")
        def add(a: int, b: int) -> int:
            return a + b

        captured_body = {}

        def handler(req: httpx.Request) -> httpx.Response:
            captured_body["body"] = json.loads(req.content)
            return httpx.Response(
                200,
                json=success_body(
                    usage={
                        "tier": "cpu_standard",
                        "wall_seconds": 0.12,
                        "billable_credits": 0.001,
                    },
                    result_inline=5,
                ),
            )

        mock_client = make_mock_client(handler)

        # Inject the mock by monkey-patching the transport call. Cleanest
        # surface is to wrap run_sync_invoke so Function.remote() uses it.
        async def patched_invoke(*, app, function, request, http_client=None):
            return await run_sync_invoke(
                app=app,
                function=function,
                request=request,
                http_client=mock_client,
            )

        # Function.remote() does `from bitsage._transport import run_sync_invoke`
        # inside the method body, so the import resolves the symbol at call
        # time — patching the module attribute propagates correctly.
        monkeypatch.setattr("bitsage._transport.run_sync_invoke", patched_invoke)

        result = await add.remote(2, 3)
        assert result.value == 5
        assert result.usage.billable_credits == pytest.approx(0.001)
        assert captured_body["body"]["inputs_inline"]["args"] == [2, 3]
        assert captured_body["body"]["tier"] == "cpu_standard"

    @pytest.mark.asyncio
    async def test_remote_with_require_proof_parses_receipt(self, monkeypatch):
        app = App("integration-proof")

        @app.function(tier="gpu_h100", require_proof=True)
        def compute(x: int) -> int:
            return x * 7

        def handler(req: httpx.Request) -> httpx.Response:
            assert json.loads(req.content)["require_proof"] is True
            return httpx.Response(
                200,
                json=success_body(
                    tier="gpu_h100",
                    usage={
                        "tier": "gpu_h100",
                        "wall_seconds": 3.0,
                        "billable_credits": 1.0,
                    },
                    proof={
                        "proof_hash": "0xabc",
                        "proof_commitment": "0xdef",
                        "verifier_address": "0x0121d1e988",
                        "on_chain_tx": "0x999",
                    },
                    result_inline=49,
                ),
            )

        mock_client = make_mock_client(handler)

        async def patched_invoke(*, app, function, request, http_client=None):
            return await run_sync_invoke(
                app=app,
                function=function,
                request=request,
                http_client=mock_client,
            )

        monkeypatch.setattr("bitsage._transport.run_sync_invoke", patched_invoke)

        result = await compute.remote(7)
        assert result.value == 49
        assert result.proof is not None
        assert result.proof.proof_hash == "0xabc"
        assert result.proof.on_chain_tx == "0x999"
