"""
03 — Verifiable Compute
=======================

**This is the example Modal and FAL cannot write.**

``require_proof=True`` instructs the coordinator to route the invocation
through the STARK proof pipeline. The response carries back a
:class:`bitsage.ProofReceipt` that the client can verify on Starknet —
cryptographic evidence that the code you asked for ran on the hardware
you paid for.

.. code-block:: shell

    bitsage run examples/03_verifiable_compute.py::compute_with_proof \\
        --inputs-json '{"x": 42}'

Expected output:

.. code-block:: text

    → running compute_with_proof on gpu_h100 with proof ...
    ✓ completed in 10.24s
      billable_credits: 3.413992
      proof_hash : 0xabc...
      verifier   : 0x0121d1e9882967e03399f153d57fc208f3d9bce69adc48d9e12d424502a8c005
      on_chain   : https://sepolia.voyager.online/tx/0xdead...
      result     : 1764

The ``on_chain`` URL points to the EloVerifier transaction that attested
the proof. ``result.proof.verify()`` re-runs the verification at any time
— useful for audit trails, SLAs, and compliance.
"""

import asyncio

import bitsage

app = bitsage.App("verifiable-compute")


@app.function(
    tier="gpu_h100",
    require_proof=True,  # ← the moat
    image=bitsage.Image.debian_slim().pip_install("numpy"),
    timeout=300,
)
def compute_with_proof(x: int) -> int:
    """Compute x² — small so the demo runs fast; proof fields stay the same
    regardless of workload complexity."""
    return x * x


async def _main() -> None:
    """Driver for running + verifying the proof end-to-end."""
    result = await compute_with_proof.remote(42)
    print(f"Result: {result.value}")
    print(f"Usage:  {result.usage.billable_credits:.6f} credits")

    if result.proof is None:
        print("⚠  No proof receipt returned — "
              "is the coordinator running the proof pipeline?")
        return

    print(f"Proof hash: {result.proof.proof_hash}")
    print(f"On-chain:   {result.proof.on_chain_url}")

    # Independent on-chain verification — re-checks the EloVerifier event.
    try:
        verified = await result.proof.verify()
        print(f"✓ on-chain verification: {verified}")
    except bitsage.ProofVerificationError as exc:
        print(f"✗ verification failed: {exc}")


if __name__ == "__main__":
    asyncio.run(_main())
