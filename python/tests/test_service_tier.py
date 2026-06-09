"""Tests for bitsage.service_tier."""

from __future__ import annotations

import math

import pytest

from bitsage.service_tier import ServiceTier


class TestServiceTier:
    def test_slug_roundtrips(self):
        for tier in ServiceTier:
            assert ServiceTier.parse(tier.value) == tier
            assert ServiceTier(tier.value) == tier

    def test_parse_rejects_unknown_slug_with_friendly_error(self):
        with pytest.raises(ValueError) as exc_info:
            ServiceTier.parse("gpu_b200")
        assert "gpu_b200" in str(exc_info.value)
        # The error lists the valid options.
        for slug in (t.value for t in ServiceTier):
            assert slug in str(exc_info.value)

    def test_rate_card_monotone_non_decreasing(self):
        rates = [tier.credits_per_second for tier in ServiceTier]
        assert rates == sorted(rates), (
            f"rate card is not in ascending price order: {rates}"
        )

    def test_rate_card_matches_rust_placeholders(self):
        # These values must stay in lock-step with
        # rust-node/src/pricing/service_tier.rs — drift means billing will
        # disagree between SDK estimate and server-side charge.
        expected = {
            ServiceTier.CPU_STANDARD: 0.0083,
            ServiceTier.CPU_ML: 0.0222,
            ServiceTier.GPU_T4: 0.0417,
            ServiceTier.GPU_L40S: 0.0833,
            ServiceTier.GPU_A100: 0.1667,
            ServiceTier.GPU_H100: 0.3333,
        }
        for tier, expected_rate in expected.items():
            assert math.isclose(tier.credits_per_second, expected_rate)

    def test_billable_credits_scales_linearly(self):
        tier = ServiceTier.CPU_STANDARD
        assert math.isclose(
            tier.billable_credits(2.5),
            tier.credits_per_second * 2.5,
        )

    def test_billable_credits_clamps_negative(self):
        # Defensive against upstream clock skew.
        assert ServiceTier.GPU_H100.billable_credits(-1.0) == 0.0

    def test_requires_gpu_matches_slug_prefix(self):
        for tier in ServiceTier:
            expected = tier.value.startswith("gpu_")
            assert tier.requires_gpu is expected

    def test_value_is_canonical_snake_case(self):
        # Slugs are the wire contract — mustn't drift.
        assert ServiceTier.GPU_H100.value == "gpu_h100"
        assert ServiceTier.CPU_STANDARD.value == "cpu_standard"
        assert ServiceTier.GPU_L40S.value == "gpu_l40s"

    def test_str_enum_inheritance_preserved(self):
        # Lets callers pass tiers straight into JSON / string formatting
        # without calling .value every time.
        assert ServiceTier.GPU_H100 == "gpu_h100"
        assert f"{ServiceTier.GPU_H100}" == "ServiceTier.GPU_H100"
        # But .value is still the slug on the wire.
        import json

        assert json.dumps(ServiceTier.GPU_H100.value) == '"gpu_h100"'
