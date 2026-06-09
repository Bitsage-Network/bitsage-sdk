"""
Service tiers — customer-facing compute SKUs.

Mirrors the Rust `ServiceTier` enum in `rust-node/src/pricing/service_tier.rs`.
A tier binds three things together:

  1. **Price** — credits charged per wall-clock second of execution.
  2. **Worker minimum spec** — enforced server-side via capability matching.
  3. **API surface** — the stable snake_case slug passed on the wire
     (``"cpu_standard"``, ``"gpu_h100"``).

These are deliberately opinionated SKUs (cf. Modal/FAL). The customer picks
a tier; the marketplace routes to a worker that can serve it — rented from
Shadeform/RunPod/Vast today, decentralized as the miner network scales.

Distinct from :class:`bitsage.types.GpuTier`, which classifies hardware
(Consumer/Workstation/Enterprise/Frontier) for stake requirements.
:class:`ServiceTier` is the *customer-facing* SKU.
"""

from __future__ import annotations

from enum import Enum


class ServiceTier(str, Enum):
    """A customer-facing compute tier.

    The string value is the canonical snake_case slug used on the wire.
    """

    CPU_STANDARD = "cpu_standard"
    """8 vCPU / 16 GB RAM, no GPU. Default for Monte Carlo, ETL, generic Python."""

    CPU_ML = "cpu_ml"
    """16 vCPU / 32 GB RAM, no GPU. Pre-installed numpy/scipy/scikit-learn."""

    GPU_T4 = "gpu_t4"
    """1x NVIDIA T4 (Turing, 16 GB VRAM). Entry-level GPU inference."""

    GPU_L40S = "gpu_l40s"
    """1x NVIDIA L40S (Ada, 48 GB VRAM). Mid-tier inference / fine-tuning."""

    GPU_A100 = "gpu_a100"
    """1x NVIDIA A100 (Ampere, ≥40 GB VRAM). High-throughput training."""

    GPU_H100 = "gpu_h100"
    """1x NVIDIA H100 (Hopper, 80 GB VRAM). Frontier models, FP8, TEE-ready."""

    @property
    def credits_per_second(self) -> float:
        """CIRO credits charged per wall-clock second.

        Placeholder rate card; must stay in sync with
        ``rust-node/src/pricing/service_tier.rs``.
        """
        return _RATE_CARD[self]

    @property
    def requires_gpu(self) -> bool:
        """Whether this tier demands a GPU-capable worker."""
        return self in _GPU_TIERS

    def billable_credits(self, wall_seconds: float) -> float:
        """Credits for an execution of ``wall_seconds`` at this tier.

        Negative wall-seconds clamp to zero — defensive against clock skew
        in upstream metering.
        """
        return self.credits_per_second * max(0.0, wall_seconds)

    @classmethod
    def parse(cls, slug: str) -> "ServiceTier":
        """Parse a canonical slug, raising ``ValueError`` on unknown input.

        Symmetric with ``ServiceTier(slug)`` for recognised values but
        carries a friendlier error message listing the valid slugs.
        """
        try:
            return cls(slug)
        except ValueError as exc:
            known = ", ".join(t.value for t in cls)
            raise ValueError(
                f"unknown service tier {slug!r} — expected one of: {known}"
            ) from exc


# Rate card mirrors the Rust definition.
_RATE_CARD: dict[ServiceTier, float] = {
    ServiceTier.CPU_STANDARD: 0.0083,  # ≈ 30 credits/hr
    ServiceTier.CPU_ML: 0.0222,  # ≈ 80 credits/hr
    ServiceTier.GPU_T4: 0.0417,  # ≈ 150 credits/hr
    ServiceTier.GPU_L40S: 0.0833,  # ≈ 300 credits/hr
    ServiceTier.GPU_A100: 0.1667,  # ≈ 600 credits/hr
    ServiceTier.GPU_H100: 0.3333,  # ≈ 1200 credits/hr
}

_GPU_TIERS = frozenset(
    {
        ServiceTier.GPU_T4,
        ServiceTier.GPU_L40S,
        ServiceTier.GPU_A100,
        ServiceTier.GPU_H100,
    }
)

__all__ = ["ServiceTier"]
