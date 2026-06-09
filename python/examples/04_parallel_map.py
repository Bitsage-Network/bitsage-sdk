"""
04 — Parallel Map
=================

Modal's canonical fan-out demo: run 100 Monte Carlo simulations in
parallel with one line. On a warm coordinator, 100 runs take roughly the
same wall time as one run — the concurrent invocations share the same
connection pool but each runs on its own worker container.

.. code-block:: python

    import asyncio
    import bitsage

    app = bitsage.App("parallel")

    @app.function(tier="cpu_standard")
    def sample(seed: int) -> float:
        import random
        random.seed(seed)
        return random.gauss(0, 1)

    async def main():
        results = await sample.map(range(100))
        print(f"100 samples, mean = {sum(r.value for r in results) / 100:.3f}")

    asyncio.run(main())

Run it:

.. code-block:: shell

    bitsage run examples/04_parallel_map.py::aggregate \\
        --inputs-json '{"n_samples": 100}'

Expected output (approximate; exact numbers depend on Python's RNG):

.. code-block:: text

    → running aggregate on cpu_standard ...
    ✓ completed in 0.82s
      billable_credits: 0.0068
      result: {"n_samples": 100, "mean": 0.021, "stddev": 0.994}

## Comparison to Modal

Modal's identical demo — find-and-replace portability:

.. code-block:: python

    @app.function()                           # Modal
    @app.function(tier="cpu_standard")        # BitSage

    results = list(my_fn.map(range(100)))     # Modal (sync generator)
    results = await my_fn.map(range(100))     # BitSage (async list)

Modal's ``.map()`` is a generator (yields as each result arrives in
input-order); BitSage ``.map()`` is an awaitable that resolves to a
list. Same input-order semantics; different API shape for the same
throughput. Generator semantics land in a future release alongside true
``.spawn()``.

## Error handling

Propagates exceptions by default. Pass ``return_exceptions=True`` to
collect failures without aborting the batch:

.. code-block:: python

    results = await sample.map(range(100), return_exceptions=True)
    failures = [r for r in results if isinstance(r, Exception)]
"""

import asyncio

import bitsage

app = bitsage.App("parallel-demo")


@app.function(
    tier="cpu_standard",
    image=bitsage.Image.debian_slim().pip_install("numpy"),
    timeout=30,
)
def sample(seed: int) -> float:
    """Return one Gaussian draw, seeded deterministically."""
    import random

    random.seed(seed)
    return random.gauss(0.0, 1.0)


@app.function(
    tier="cpu_standard",
    image=bitsage.Image.debian_slim().pip_install("numpy"),
    timeout=120,
    max_cost_credits=1.0,
)
async def aggregate(n_samples: int = 100) -> dict:
    """Fan-out `n_samples` independent draws, aggregate on return.

    Demonstrates chaining: this function is itself a BitSage function,
    and it uses ``sample.map()`` to parallelise the sub-invocations.
    """
    import numpy as np

    results = await sample.map(list(range(n_samples)))
    values = np.array([r.value for r in results])
    return {
        "n_samples": n_samples,
        "mean": float(values.mean()),
        "stddev": float(values.std()),
    }


if __name__ == "__main__":
    # Local execution of the aggregator — useful for quick smoke tests
    # without hitting the coordinator.
    print(asyncio.run(aggregate(10)))
