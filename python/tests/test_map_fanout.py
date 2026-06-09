"""Tests for Function.map / .starmap / .for_each — parallel fan-out.

Exercises the asyncio.gather-based concurrency + error collection. The
underlying ``.remote()`` is monkey-patched at the module level so we
don't need a live coordinator; what's being tested here is:

  * inputs are dispatched in parallel (not sequentially)
  * results land in *input* order, not completion order
  * ``return_exceptions=True`` collects errors instead of raising
  * starmap accepts both plain tuples and explicit (args, kwargs) envelopes
  * for_each drops results
  * empty-input fast-path returns [] without hitting the network
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

import pytest

import bitsage
from bitsage.app import App, ExecutionResult, UsageReport, _split_starmap_inputs
from bitsage.service_tier import ServiceTier
from bitsage._transport import RemoteExecutionError


# ─── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture
def app() -> App:
    return App("fanout-test")


def _fake_result(value, tier: ServiceTier = ServiceTier.CPU_STANDARD) -> ExecutionResult:
    return ExecutionResult(
        value=value,
        usage=UsageReport(tier=tier, wall_seconds=0.1, billable_credits=0.001),
        proof=None,
        job_id=f"job-{value}",
        worker_id="worker-fake",
    )


# ─── _split_starmap_inputs (pure) ────────────────────────────────────


class TestSplitStarmapInputs:
    def test_plain_tuple_becomes_positional_args(self):
        result = _split_starmap_inputs([(1, 2), (3, 4)])
        assert result == [((1, 2), {}), ((3, 4), {})]

    def test_list_item_treated_like_tuple(self):
        result = _split_starmap_inputs([[1, 2]])
        assert result == [((1, 2), {})]

    def test_explicit_envelope_unpacks_args_and_kwargs(self):
        result = _split_starmap_inputs([((1,), {"y": 2}), ((3,), {"y": 4})])
        assert result == [((1,), {"y": 2}), ((3,), {"y": 4})]

    def test_envelope_with_empty_kwargs(self):
        result = _split_starmap_inputs([((5, 6), {})])
        assert result == [((5, 6), {})]

    def test_non_iterable_item_raises(self):
        with pytest.raises(TypeError) as exc:
            _split_starmap_inputs([1, 2, 3])
        assert "must be a tuple or list" in str(exc.value)

    def test_single_element_tuple(self):
        # (x,) is valid — maps to f.remote(x) with no kwargs.
        result = _split_starmap_inputs([(1,), (2,)])
        assert result == [((1,), {}), ((2,), {})]


# ─── .map happy path ─────────────────────────────────────────────────


class TestMapHappyPath:
    @pytest.mark.asyncio
    async def test_map_invokes_remote_once_per_input(self, app, monkeypatch):
        calls = []

        async def fake_remote(self, *args, **kwargs):
            calls.append(args)
            return _fake_result(args[0] * 2)

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def double(x):
            return x * 2

        results = await double.map([1, 2, 3, 4])
        assert [r.value for r in results] == [2, 4, 6, 8]
        assert calls == [(1,), (2,), (3,), (4,)]

    @pytest.mark.asyncio
    async def test_map_results_in_input_order_not_completion_order(
        self, app, monkeypatch
    ):
        async def fake_remote(self, *args, **kwargs):
            # Reverse-ordered sleep: first input sleeps longest.
            (x,) = args
            await asyncio.sleep(0.05 * (5 - x))
            return _fake_result(x)

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def f(x):
            return x

        results = await f.map([1, 2, 3, 4])
        assert [r.value for r in results] == [1, 2, 3, 4]

    @pytest.mark.asyncio
    async def test_map_actually_parallel(self, app, monkeypatch):
        """Concrete parallelism test: sum of sleeps >> wall-clock elapsed."""

        async def fake_remote(self, *args, **kwargs):
            await asyncio.sleep(0.1)
            return _fake_result(args[0])

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def f(x):
            return x

        t0 = time.monotonic()
        await f.map([1, 2, 3, 4, 5])
        elapsed = time.monotonic() - t0
        # 5 × 0.1s serialised = 0.5s; parallel should be < 0.3s with slack.
        assert elapsed < 0.3, f"map appears serial: took {elapsed:.3f}s"

    @pytest.mark.asyncio
    async def test_map_empty_input_returns_empty_without_network(
        self, app, monkeypatch
    ):
        called = False

        async def fake_remote(self, *args, **kwargs):
            nonlocal called
            called = True
            return _fake_result(None)

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def f(x):
            ...

        results = await f.map([])
        assert results == []
        assert not called, ".map([]) should short-circuit — no remote calls"

    @pytest.mark.asyncio
    async def test_map_accepts_generator_input(self, app, monkeypatch):
        async def fake_remote(self, *args, **kwargs):
            return _fake_result(args[0])

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def f(x):
            return x

        def gen():
            yield from [10, 20, 30]

        results = await f.map(gen())
        assert [r.value for r in results] == [10, 20, 30]


# ─── .map error handling ─────────────────────────────────────────────


class TestMapErrors:
    @pytest.mark.asyncio
    async def test_map_raises_on_first_failure_by_default(self, app, monkeypatch):
        async def fake_remote(self, *args, **kwargs):
            (x,) = args
            if x == 3:
                raise RemoteExecutionError(
                    "boom", job_id="j", status="failed", code="worker_error"
                )
            return _fake_result(x)

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def f(x):
            return x

        with pytest.raises(RemoteExecutionError):
            await f.map([1, 2, 3, 4])

    @pytest.mark.asyncio
    async def test_map_return_exceptions_collects_errors(self, app, monkeypatch):
        async def fake_remote(self, *args, **kwargs):
            (x,) = args
            if x == 3:
                raise RemoteExecutionError(
                    "boom", job_id="j", status="failed", code="worker_error"
                )
            return _fake_result(x)

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def f(x):
            return x

        results = await f.map([1, 2, 3, 4], return_exceptions=True)
        assert len(results) == 4
        assert isinstance(results[2], RemoteExecutionError)
        # Successful ones still produce ExecutionResults in-order.
        assert results[0].value == 1
        assert results[1].value == 2
        assert results[3].value == 4

    @pytest.mark.asyncio
    async def test_map_return_exceptions_all_fail(self, app, monkeypatch):
        async def fake_remote(self, *args, **kwargs):
            raise RemoteExecutionError(
                "always", job_id="j", status="failed", code="worker_error"
            )

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def f(x):
            return x

        results = await f.map([1, 2], return_exceptions=True)
        assert all(isinstance(r, RemoteExecutionError) for r in results)


# ─── .starmap ────────────────────────────────────────────────────────


class TestStarmap:
    @pytest.mark.asyncio
    async def test_starmap_plain_tuples_as_positional(self, app, monkeypatch):
        calls = []

        async def fake_remote(self, *args, **kwargs):
            calls.append((args, kwargs))
            return _fake_result(sum(args))

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def add(a, b):
            return a + b

        results = await add.starmap([(1, 2), (3, 4), (5, 6)])
        assert [r.value for r in results] == [3, 7, 11]
        assert calls == [((1, 2), {}), ((3, 4), {}), ((5, 6), {})]

    @pytest.mark.asyncio
    async def test_starmap_explicit_args_kwargs_envelope(self, app, monkeypatch):
        calls = []

        async def fake_remote(self, *args, **kwargs):
            calls.append((args, kwargs))
            return _fake_result(0)

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def f(x, *, y):
            return x + y

        await f.starmap([((1,), {"y": 2}), ((3,), {"y": 4})])
        assert calls == [((1,), {"y": 2}), ((3,), {"y": 4})]

    @pytest.mark.asyncio
    async def test_starmap_rejects_non_iterable_items(self, app, monkeypatch):
        @app.function(tier="cpu_standard")
        def f(x):
            return x

        with pytest.raises(TypeError):
            await f.starmap([1, 2, 3])  # bare ints, not tuples

    @pytest.mark.asyncio
    async def test_starmap_empty_returns_empty(self, app):
        @app.function(tier="cpu_standard")
        def f(a, b):
            return a + b

        assert await f.starmap([]) == []


# ─── .for_each ───────────────────────────────────────────────────────


class TestForEach:
    @pytest.mark.asyncio
    async def test_for_each_drops_results(self, app, monkeypatch):
        async def fake_remote(self, *args, **kwargs):
            return _fake_result(args[0])

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def f(x):
            return x

        # Return is explicitly None.
        assert await f.for_each([1, 2, 3]) is None

    @pytest.mark.asyncio
    async def test_for_each_propagates_errors(self, app, monkeypatch):
        async def fake_remote(self, *args, **kwargs):
            raise RemoteExecutionError(
                "boom", job_id="j", status="failed", code="worker_error"
            )

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def f(x):
            return x

        with pytest.raises(RemoteExecutionError):
            await f.for_each([1])

    @pytest.mark.asyncio
    async def test_for_each_empty_is_noop(self, app, monkeypatch):
        called = False

        async def fake_remote(self, *args, **kwargs):
            nonlocal called
            called = True
            return _fake_result(None)

        monkeypatch.setattr(bitsage.Function, "remote", fake_remote)

        @app.function(tier="cpu_standard")
        def f(x):
            ...

        await f.for_each([])
        assert not called
