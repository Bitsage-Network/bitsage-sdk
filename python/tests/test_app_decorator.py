"""Tests for bitsage.app — the decorator API.

Covers:
  * decorator shape + FunctionConfig capture
  * request-payload construction (pure — no network)
  * ExecutionResult/UsageReport typing
  * argument-validation errors raised at call time

The HTTP wiring (``Function.remote`` actually round-trips) is tested in
``test_app_remote_integration`` once Day 2 wiring lands.
"""

from __future__ import annotations

import asyncio

import pytest

import bitsage
from bitsage.app import App, ExecutionResult, Function, FunctionConfig, UsageReport
from bitsage.image import Image
from bitsage.service_tier import ServiceTier


# ─── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture
def app() -> App:
    return App("test-app")


# ─── Decorator shape ──────────────────────────────────────────────────


class TestFunctionDecorator:
    def test_decorator_accepts_tier_string(self, app: App):
        @app.function(tier="cpu_standard")
        def f(x: int) -> int:
            return x * 2

        assert isinstance(f, Function)
        assert f.config.tier == ServiceTier.CPU_STANDARD

    def test_decorator_accepts_tier_enum(self, app: App):
        @app.function(tier=ServiceTier.GPU_H100)
        def f() -> int:
            return 42

        assert f.config.tier == ServiceTier.GPU_H100

    def test_decorator_rejects_unknown_tier(self, app: App):
        with pytest.raises(ValueError):

            @app.function(tier="gpu_b200")
            def f():
                ...

    def test_require_proof_default_off(self, app: App):
        @app.function(tier="cpu_standard")
        def f():
            ...

        assert f.config.require_proof is False

    def test_require_proof_opt_in(self, app: App):
        @app.function(tier="gpu_h100", require_proof=True)
        def f():
            ...

        assert f.config.require_proof is True

    def test_decorated_function_still_callable_locally(self, app: App):
        @app.function(tier="cpu_standard")
        def double(x: int) -> int:
            return x * 2

        # Local invocation — no BitSage round trip.
        assert double(7) == 14
        # Explicit alias for the same thing.
        assert double.local(7) == 14

    def test_app_accumulates_functions(self, app: App):
        @app.function(tier="cpu_standard")
        def a():
            ...

        @app.function(tier="gpu_t4")
        def b():
            ...

        assert a in app.functions
        assert b in app.functions
        assert len(app.functions) == 2


class TestFunctionConfigCapture:
    def test_timeout_default_is_600(self, app: App):
        @app.function(tier="cpu_standard")
        def f():
            ...

        assert f.config.timeout == 600

    def test_timeout_override_respected(self, app: App):
        @app.function(tier="cpu_standard", timeout=30)
        def f():
            ...

        assert f.config.timeout == 30

    def test_max_cost_credits_passthrough(self, app: App):
        @app.function(tier="gpu_h100", max_cost_credits=50.0)
        def f():
            ...

        assert f.config.max_cost_credits == 50.0

    def test_function_level_image_overrides_app_level(self, app: App):
        app_image = Image.debian_slim().pip_install("requests")
        fn_image = Image.debian_slim().pip_install("numpy")
        app.image = app_image

        @app.function(tier="cpu_standard", image=fn_image)
        def f():
            ...

        assert f.config.image is fn_image

    def test_app_level_image_used_when_no_function_override(self, app: App):
        app_image = Image.debian_slim().pip_install("requests")
        app.image = app_image

        @app.function(tier="cpu_standard")
        def f():
            ...

        assert f.config.image is app_image


# ─── Request-payload construction ─────────────────────────────────────


class TestRequestPayload:
    def _function(self, app: App, **kwargs) -> Function:
        @app.function(**kwargs)
        def f(x: int, y: int = 10) -> int:
            return x + y

        return f

    def test_payload_has_required_fields(self, app: App):
        f = self._function(app, tier="cpu_standard")
        payload = f._build_request_payload((1,), {"y": 2})

        assert payload["tier"] == "cpu_standard"
        assert payload["job_type"] == "python_exec"
        assert "code_inline" in payload
        assert "inputs_inline" in payload
        assert payload["max_seconds"] == 600

    def test_payload_records_args_and_kwargs(self, app: App):
        f = self._function(app, tier="cpu_standard")
        payload = f._build_request_payload((1, 2), {"y": 3})
        assert payload["inputs_inline"]["args"] == [1, 2]
        assert payload["inputs_inline"]["kwargs"] == {"y": 3}

    def test_payload_includes_require_proof_only_when_on(self, app: App):
        f_off = self._function(app, tier="cpu_standard")
        f_on = self._function(app, tier="gpu_h100", require_proof=True)

        assert "require_proof" not in f_off._build_request_payload((0,), {})
        assert f_on._build_request_payload((0,), {})["require_proof"] is True

    def test_payload_includes_image_when_set(self, app: App):
        img = Image.debian_slim().pip_install("numpy")
        f = self._function(app, tier="cpu_standard", image=img)
        payload = f._build_request_payload((1,), {})
        assert "image" in payload
        assert payload["image"]["base"] == "debian_slim"
        assert payload["image"]["layers"][0]["kind"] == "pip_install"

    def test_payload_omits_image_when_none(self, app: App):
        f = self._function(app, tier="cpu_standard")
        payload = f._build_request_payload((1,), {})
        assert "image" not in payload

    def test_payload_includes_max_cost_credits_when_set(self, app: App):
        f = self._function(app, tier="gpu_h100", max_cost_credits=25.0)
        payload = f._build_request_payload((1,), {})
        assert payload["max_cost_credits"] == 25.0

    def test_payload_includes_function_qualname_in_client_ref(self, app: App):
        f = self._function(app, tier="cpu_standard")
        payload = f._build_request_payload((1,), {})
        assert payload["client_ref"].startswith("test-app:")

    def test_payload_carries_function_source(self, app: App):
        f = self._function(app, tier="cpu_standard")
        payload = f._build_request_payload((1,), {})
        assert "def f(x: int, y: int = 10)" in payload["code_inline"]
        assert "return x + y" in payload["code_inline"]

    def test_payload_is_json_serialisable(self, app: App):
        import json

        img = Image.debian_slim().pip_install("numpy")
        f = self._function(app, tier="gpu_h100", require_proof=True, image=img)
        payload = f._build_request_payload((1, 2), {"y": 3})
        json.dumps(payload)


# ─── Argument validation ──────────────────────────────────────────────


class TestArgumentValidation:
    def test_non_json_args_raise_type_error_at_remote(self, app: App):
        @app.function(tier="cpu_standard")
        def f(x):
            ...

        # datetime is a common offender — not JSON-serialisable out of the box.
        from datetime import datetime

        with pytest.raises(TypeError) as exc_info:
            f._build_request_payload((datetime.now(),), {})
        assert "JSON-serialisable" in str(exc_info.value)

    def test_source_capture_raises_value_error_for_unsourceable_callable(self):
        # Builtins have no Python source — _capture_source must surface a
        # friendly ValueError rather than a low-level OSError/TypeError
        # from deep inside .remote().
        from bitsage.app import _capture_source

        with pytest.raises(ValueError) as exc_info:
            _capture_source(len)  # builtin — no Python source
        assert "cannot capture source" in str(exc_info.value)
        # The error points users toward cloudpickle (the 0.4 upgrade path).
        assert "cloudpickle" in str(exc_info.value)


# ─── Day 2 HTTP wiring (integration-shaped, no network) ───────────────


class TestRemoteInvocationAfterDay2Wiring:
    """Once Day 2 wired up _transport, `.remote()` no longer raises
    NotImplementedError — it hits the network (or tries to). Here we just
    confirm the shape: auth failures surface cleanly, spawn/map still stubs.
    """

    def test_remote_without_credentials_raises_auth_error(
        self, app: App, monkeypatch
    ):
        # Clear any ambient credentials so the transport's auth probe fires.
        monkeypatch.delenv("BITSAGE_API_KEY", raising=False)
        monkeypatch.setattr(
            "bitsage._transport.CREDENTIALS_PATH",
            __import__("pathlib").Path("/nonexistent/credentials"),
        )

        @app.function(tier="cpu_standard")
        def f():
            return 1

        from bitsage._transport import AuthenticationError

        with pytest.raises(AuthenticationError) as exc:
            asyncio.run(f.remote())
        assert "no API key found" in str(exc.value)

    def test_spawn_points_at_roadmap_message(self, app: App):
        # Day 5: .spawn() intentionally still raises — real durable
        # fire-and-forget requires coordinator-side work. Error message
        # must point the user at the workaround (.map) so they can keep
        # moving.
        @app.function(tier="cpu_standard")
        def f():
            ...

        with pytest.raises(NotImplementedError) as exc:
            f.spawn()
        msg = str(exc.value)
        assert "coordinator-side" in msg
        assert "Function.map" in msg


# ─── Public re-exports ────────────────────────────────────────────────


class TestPublicReExports:
    def test_top_level_imports(self):
        # The whole decorator surface should land on `bitsage.*`.
        assert bitsage.App is App
        assert bitsage.Function is Function
        assert bitsage.FunctionConfig is FunctionConfig
        assert bitsage.ExecutionResult is ExecutionResult
        assert bitsage.UsageReport is UsageReport
        assert bitsage.Image is Image
        assert bitsage.ServiceTier is ServiceTier
        assert bitsage.ProofReceipt is not None
        assert bitsage.ProofVerificationError is not None
