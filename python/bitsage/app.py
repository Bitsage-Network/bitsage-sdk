"""
App and Function — Modal-shaped decorators for verifiable compute.

.. code-block:: python

    import bitsage

    app = bitsage.App("demo")

    @app.function(
        tier="gpu_h100",
        require_proof=True,
        image=bitsage.Image.debian_slim().pip_install("numpy"),
        timeout=600,
    )
    def monte_carlo(iters: int) -> dict:
        import numpy as np
        return {"sum": float(np.random.randn(iters).sum())}

    result = monte_carlo.remote(100_000)
    print(result.value)                 # the return value
    print(result.usage.billable_credits)
    print(result.proof.on_chain_url)    # explorer URL for the verifier tx

Design notes for Day 1
----------------------

- The decorator is pure-Python at this stage: it captures metadata and
  source, but submitting work happens lazily on ``.remote()``.
- ``.remote()`` → ``/api/v1/jobs/run-sync``; ``.spawn()`` and ``.map()`` ship
  Day 2. Keeping them stubbed until we have the shared HTTP layer.
- ``require_proof`` rides through the request payload from line one. The
  Rust coordinator threads it into :class:`ObelyskExecutor`; the response
  carries the proof receipt back untouched.
- No cloudpickle. Source is extracted via :func:`inspect.getsource` and
  reconstituted on the worker. Args/kwargs must be JSON-serialisable.
  Phase 1 Week 4 adds cloudpickle for richer closures.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any, Callable, Generic, List, Optional, TypeVar

from bitsage.image import Image
from bitsage.proof import ProofReceipt
from bitsage.service_tier import ServiceTier


R = TypeVar("R")


# ─── Results ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class UsageReport:
    """Metered execution summary — mirrors the Rust ``UsageReport``."""

    tier: ServiceTier
    wall_seconds: float
    billable_credits: float
    cpu_seconds: Optional[float] = None
    gpu_seconds: Optional[float] = None


@dataclass(frozen=True)
class ExecutionResult(Generic[R]):
    """Return value + usage + optional proof for a single ``.remote()`` call."""

    value: R
    usage: UsageReport
    proof: Optional[ProofReceipt] = None
    job_id: Optional[str] = None
    worker_id: Optional[str] = None


# ─── Function ─────────────────────────────────────────────────────────


@dataclass
class FunctionConfig:
    """Static configuration captured at decoration time.

    Stored on the underlying :class:`Function` and serialised into every
    invocation request. Mutating after construction is unsupported — make a
    new function if the shape changes.
    """

    tier: ServiceTier
    require_proof: bool = False
    image: Optional[Image] = None
    gpu: Optional[str] = None
    cpu: Optional[float] = None
    memory_mb: Optional[int] = None
    timeout: int = 600
    max_cost_credits: Optional[float] = None
    retries: int = 0
    # Modal/FAL-style warm-pool dials; unused Day 1, threaded for Phase 3.
    min_containers: int = 0
    max_containers: Optional[int] = None
    keep_alive: Optional[int] = None

    def to_request_overrides(self) -> dict[str, Any]:
        """Serialise non-default fields into the run-sync request body."""
        out: dict[str, Any] = {
            "tier": self.tier.value,
            "max_seconds": self.timeout,
        }
        if self.require_proof:
            out["require_proof"] = True
        if self.max_cost_credits is not None:
            out["max_cost_credits"] = self.max_cost_credits
        if self.image is not None:
            out["image"] = self.image.to_request_payload()
        if self.gpu is not None:
            out["gpu"] = self.gpu
        # Retries / warm-pool dials are ignored by the Day 1 coordinator but
        # forwarded so the wire shape is stable from v0.3.0.
        if self.retries:
            out["retries"] = self.retries
        if self.min_containers:
            out["min_containers"] = self.min_containers
        if self.max_containers is not None:
            out["max_containers"] = self.max_containers
        if self.keep_alive is not None:
            out["keep_alive"] = self.keep_alive
        return out


class Function(Generic[R]):
    """A decorated function registered with an :class:`App`.

    Construct via :meth:`App.function`; not intended for direct instantiation.
    Instances are **not** bound HTTP clients — they carry metadata and defer
    network I/O to per-call methods.
    """

    def __init__(
        self,
        *,
        app: "App",
        fn: Callable[..., R],
        config: FunctionConfig,
    ):
        self._app = app
        self._fn = fn
        self._config = config
        self._source = _capture_source(fn)
        self._qualname = f"{fn.__module__}.{fn.__qualname__}"

    # ─── Introspection ────────────────────────────────────────────────

    @property
    def app(self) -> "App":
        return self._app

    @property
    def config(self) -> FunctionConfig:
        return self._config

    @property
    def source(self) -> str:
        return self._source

    @property
    def qualname(self) -> str:
        return self._qualname

    def __repr__(self) -> str:
        return (
            f"<bitsage.Function {self._qualname} "
            f"tier={self._config.tier.value} "
            f"proof={'on' if self._config.require_proof else 'off'}>"
        )

    # ─── Invocation — local ───────────────────────────────────────────

    def __call__(self, *args: Any, **kwargs: Any) -> R:
        """Call the function **locally** — same process, no BitSage round-trip.

        Exists so decorated functions remain drop-in usable during tests and
        REPL exploration. For remote execution, use :meth:`remote`.
        """
        return self._fn(*args, **kwargs)

    def local(self, *args: Any, **kwargs: Any) -> R:
        """Explicit alias for :meth:`__call__` — local, in-process execution."""
        return self._fn(*args, **kwargs)

    # ─── Invocation — remote (Day 1: shape; Day 2: HTTP) ─────────────

    async def remote(self, *args: Any, **kwargs: Any) -> ExecutionResult[R]:
        """Execute on a BitSage worker and return the result + usage + proof.

        Blocks until the worker reaches a terminal state. Uses the v1
        run-sync endpoint under the hood; caller's HTTP connection is held
        open for the duration.

        Day 1 status: request construction is complete; HTTP dispatch is
        wired in Day 2 via the shared :class:`bitsage.client.BitSageClient`.
        """
        request = self._build_request_payload(args, kwargs)
        # Import here to avoid circulars during Day 1 scaffold; will move to
        # module-top once Day 2 wiring lands.
        from bitsage._transport import run_sync_invoke

        return await run_sync_invoke(
            app=self._app,
            function=self,
            request=request,
        )

    def spawn(self, *args: Any, **kwargs: Any) -> "FunctionCall[R]":
        """Fire-and-forget submission, returning a :class:`FunctionCall` handle.

        **Not yet implemented** — requires a coordinator-side non-blocking
        submit endpoint (``POST /api/v1/jobs/submit``) that returns a
        ``job_id`` without holding the connection open, plus
        ``GET /api/v1/jobs/:id/result`` that returns a full :class:`ExecutionResult`
        once terminal. Both land in Phase 1 Week 3 of the Modal/FAL
        competitor roadmap.

        Until then, use :meth:`map` for parallel fan-out — it achieves the
        same throughput for batch workloads, at the cost of the HTTP
        connection staying open for the longest-running job.
        """
        raise NotImplementedError(
            "Function.spawn requires coordinator-side durable submit; "
            "use Function.map for parallel fan-out today. "
            "See roadmap Phase 1 Week 3."
        )

    async def map(
        self,
        iterable: Any,
        *,
        return_exceptions: bool = False,
    ) -> List[ExecutionResult[R] | BaseException]:
        """Parallel fan-out over ``iterable``, returning results in input order.

        Each item is passed as a single positional argument to a
        ``.remote()`` invocation. Invocations run concurrently via
        :func:`asyncio.gather`; the method returns once every result is in.

        .. code-block:: python

            results = await my_fn.map([1, 2, 3, 4, 5])
            for r in results:
                print(r.value)

        For multi-argument calls, use :meth:`starmap`.

        Parameters
        ----------
        iterable : Iterable
            Inputs, each passed as ``*args=(item,)`` to one ``.remote()``.
        return_exceptions : bool, default False
            When ``True``, exceptions raised by individual invocations are
            collected into the result list instead of propagated. Matches
            :func:`asyncio.gather`'s semantics. Modal calls this
            ``return_exceptions=True``; the flag name is identical for
            portability.

        Returns
        -------
        list[ExecutionResult | BaseException]
            One entry per input, in input order. With
            ``return_exceptions=True``, failed invocations appear as the
            exception instance they raised (typically
            :class:`~bitsage._transport.RemoteExecutionError` or
            :class:`~bitsage._transport.BitSageHttpError`).

        Notes
        -----
        The client holds one HTTP connection per in-flight invocation.
        For very large fan-outs (>1000), throttle via chunking or upgrade
        to :meth:`spawn` once it's available.
        """
        import asyncio as _asyncio

        inputs = list(iterable)
        if not inputs:
            return []

        tasks = [self.remote(item) for item in inputs]
        results = await _asyncio.gather(*tasks, return_exceptions=return_exceptions)
        return list(results)

    async def starmap(
        self,
        iterable: Any,
        *,
        return_exceptions: bool = False,
    ) -> List[ExecutionResult[R] | BaseException]:
        """Like :meth:`map`, but each item is an ``(args, kwargs)`` tuple or
        a positional-args tuple.

        .. code-block:: python

            results = await add.starmap([(1, 2), (3, 4), (5, 6)])

        Each element of ``iterable`` is either:

        - A tuple/list ``(*args,)`` — unpacked as positional args.
        - A 2-tuple ``(args, kwargs)`` where ``args`` is a list/tuple and
          ``kwargs`` is a dict — both unpacked.

        Mirrors Modal's ``.starmap`` shape.
        """
        import asyncio as _asyncio

        inputs = list(iterable)
        if not inputs:
            return []

        tasks = [self.remote(*args_, **kwargs_) for args_, kwargs_ in _split_starmap_inputs(inputs)]
        results = await _asyncio.gather(*tasks, return_exceptions=return_exceptions)
        return list(results)

    async def for_each(self, iterable: Any) -> None:
        """Parallel fan-out that discards results.

        Useful when the function is invoked for side effects (writing to a
        volume, emitting a webhook, etc.) and the return values don't
        matter. Equivalent to ``await map(iterable)`` then dropping the
        list, but spells the intent explicitly.

        Exceptions propagate — use ``map(iter, return_exceptions=True)``
        when you want to collect failures.
        """
        await self.map(iterable)

    # ─── Request construction (testable without network) ─────────────

    def _build_request_payload(self, args: tuple, kwargs: dict) -> dict[str, Any]:
        """Assemble the ``/api/v1/jobs/run-sync`` request body.

        Pure function — no network I/O, so unit-testable in isolation.

        The ``python_exec`` job type routes through the coordinator's
        in-process subprocess runner (see
        ``rust-node/src/compute/python_executor.rs``). Proof-required jobs
        still take this job type but fall through to the distributed path
        server-side so they reach ``ObelyskExecutor`` — invisible to the
        SDK caller.
        """
        inputs = _pack_inputs(args, kwargs)
        payload: dict[str, Any] = {
            "job_type": "python_exec",
            "code_inline": self._source,
            "inputs_inline": {
                "entrypoint": self._qualname,
                "args": inputs["args"],
                "kwargs": inputs["kwargs"],
            },
            "client_ref": f"{self._app.name}:{self._fn.__name__}",
        }
        payload.update(self._config.to_request_overrides())
        return payload


# ─── FunctionCall (spawn handle) ──────────────────────────────────────


@dataclass
class FunctionCall(Generic[R]):
    """Handle to a spawned invocation. Complete in Day 2 of SDK build-out."""

    job_id: str
    function: Function[R]

    async def get(self, timeout: Optional[float] = None) -> ExecutionResult[R]:
        """Block until the spawned invocation terminates; return its result."""
        raise NotImplementedError("FunctionCall.get lands Day 2 of SDK build-out")


# ─── App ──────────────────────────────────────────────────────────────


@dataclass
class App:
    """A deployable namespace of functions.

    Usage:

    .. code-block:: python

        app = bitsage.App("my-app")

        @app.function(tier="gpu_h100", require_proof=True)
        def f(x): ...

    ``App.name`` is the stable identifier used for deployment, quota, and
    billing scope — pick it carefully.
    """

    name: str
    image: Optional[Image] = None
    functions: List[Function[Any]] = field(default_factory=list)

    def function(
        self,
        *,
        tier: "str | ServiceTier",
        require_proof: bool = False,
        image: Optional[Image] = None,
        gpu: Optional[str] = None,
        cpu: Optional[float] = None,
        memory_mb: Optional[int] = None,
        timeout: int = 600,
        max_cost_credits: Optional[float] = None,
        retries: int = 0,
        min_containers: int = 0,
        max_containers: Optional[int] = None,
        keep_alive: Optional[int] = None,
    ) -> Callable[[Callable[..., R]], Function[R]]:
        """Decorator that registers ``fn`` as a remotely-invocable function.

        The only required argument is ``tier``. ``require_proof=True`` turns
        on cryptographic receipts — this is the flag that makes BitSage
        meaningfully different from Modal and FAL.

        Effective image precedence: function-level ``image`` override →
        app-level :attr:`App.image` → plain debian-slim default applied by
        the coordinator.
        """
        resolved_tier = tier if isinstance(tier, ServiceTier) else ServiceTier.parse(tier)
        effective_image = image if image is not None else self.image

        def decorator(fn: Callable[..., R]) -> Function[R]:
            config = FunctionConfig(
                tier=resolved_tier,
                require_proof=require_proof,
                image=effective_image,
                gpu=gpu,
                cpu=cpu,
                memory_mb=memory_mb,
                timeout=timeout,
                max_cost_credits=max_cost_credits,
                retries=retries,
                min_containers=min_containers,
                max_containers=max_containers,
                keep_alive=keep_alive,
            )
            wrapped = Function(app=self, fn=fn, config=config)
            self.functions.append(wrapped)
            return wrapped

        return decorator


# ─── Helpers ──────────────────────────────────────────────────────────


def _capture_source(fn: Callable[..., Any]) -> str:
    """Extract the decorated function's source + all textual context needed to
    reconstitute it on the worker.

    For Day 1 we capture only the function body via :func:`inspect.getsource`.
    Phase 1 Week 4 upgrades to cloudpickle, which carries closures, globals,
    and imports automatically.
    """
    try:
        return inspect.getsource(fn)
    except (OSError, TypeError) as exc:
        # OSError: source unavailable (e.g. defined in __main__ interactively).
        # TypeError: fn is a built-in or C-implemented callable.
        raise ValueError(
            f"cannot capture source for {fn!r}: {exc}. "
            "Define the function in a regular .py module — cloudpickle support "
            "arrives in SDK 0.4."
        ) from exc


def _split_starmap_inputs(
    inputs: List[Any],
) -> List[tuple[tuple[Any, ...], dict[str, Any]]]:
    """Normalise :meth:`Function.starmap` inputs into ``(args, kwargs)`` pairs.

    Accepted item shapes:
      * ``(arg1, arg2, ...)`` — plain positional tuple.
      * ``[(args,), {}]`` or ``((args,), kwargs)`` — explicit envelope.

    The explicit envelope lets callers pass kwargs per invocation; the
    plain tuple is the common case.
    """
    out: List[tuple[tuple[Any, ...], dict[str, Any]]] = []
    for idx, item in enumerate(inputs):
        if not isinstance(item, (tuple, list)):
            raise TypeError(
                f"starmap input #{idx} must be a tuple or list, got {type(item).__name__}"
            )
        if (
            len(item) == 2
            and isinstance(item[0], (tuple, list))
            and isinstance(item[1], dict)
        ):
            # Explicit envelope shape: (args, kwargs).
            args = tuple(item[0])
            kwargs = dict(item[1])
        else:
            args = tuple(item)
            kwargs = {}
        out.append((args, kwargs))
    return out


def _pack_inputs(args: tuple, kwargs: dict) -> dict[str, Any]:
    """Validate and package positional + keyword args for JSON transport."""
    # Defensive JSON-round-trip: surface a friendly error at call time rather
    # than an opaque serialisation failure deep inside the HTTP layer.
    try:
        import json

        json.dumps({"args": list(args), "kwargs": kwargs})
    except TypeError as exc:
        raise TypeError(
            f"function arguments are not JSON-serialisable: {exc}. "
            "Convert to dicts/lists/primitives, or upload large inputs via "
            "bitsage.storage and pass the URL instead."
        ) from exc
    return {"args": list(args), "kwargs": kwargs}


__all__ = [
    "App",
    "ExecutionResult",
    "Function",
    "FunctionCall",
    "FunctionConfig",
    "UsageReport",
]
