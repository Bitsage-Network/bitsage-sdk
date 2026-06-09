"""
02 — Monte Carlo
================

The CIRO flagship workload: Monte Carlo simulation with numpy.
Demonstrates the ``Image.pip_install()`` DSL and per-second billing.

Run it:

.. code-block:: shell

    bitsage run examples/02_monte_carlo.py::monte_carlo \\
        --inputs-json '{"iters": 100000}'

Expected output:

.. code-block:: text

    → running monte_carlo on cpu_standard ...
    ✓ completed in 0.37s
      billable_credits: 0.003071
      result: {"mean": 0.002, "stddev": 1.001, "iters": 100000}

The cost model is transparent: the ``cpu_standard`` tier bills 0.0083
credits/second. A 0.37s job bills 0.003071 credits. A Monte Carlo that
previously ran on AWS c6i.2xlarge at hourly rates now bills for what it
actually consumed, to the millisecond.
"""

import bitsage

app = bitsage.App("monte-carlo")


@app.function(
    tier="cpu_standard",
    image=bitsage.Image.debian_slim().pip_install("numpy", "scipy"),
    timeout=60,
    max_cost_credits=0.5,  # hard ceiling — worst case
)
def monte_carlo(iters: int = 10_000) -> dict:
    """Return summary statistics for ``iters`` Gaussian draws."""
    import numpy as np

    samples = np.random.randn(iters)
    return {
        "mean": float(samples.mean()),
        "stddev": float(samples.std()),
        "iters": iters,
    }


if __name__ == "__main__":
    # Local call with a small sample for quick validation:
    print(monte_carlo(1000))
