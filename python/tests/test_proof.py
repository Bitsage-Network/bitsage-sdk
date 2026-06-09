"""Tests for bitsage.proof — ProofReceipt shape + verification plumbing."""

from __future__ import annotations

import pytest

from bitsage.proof import ProofReceipt, ProofVerificationError


class TestProofReceiptShape:
    def test_minimum_fields_required(self):
        # Construction works with just the three mandatory fields.
        r = ProofReceipt(
            proof_hash="0xabc",
            proof_commitment="0xdef",
            verifier_address="0x0121d1e9882967e03399f153d57fc208f3d9bce69adc48d9e12d424502a8c005",
        )
        assert r.on_chain_tx is None
        assert r.starknet_rpc_url is None

    def test_is_frozen(self):
        import dataclasses

        r = ProofReceipt(
            proof_hash="0xabc",
            proof_commitment="0xdef",
            verifier_address="0x123",
        )
        with pytest.raises(dataclasses.FrozenInstanceError):  # type: ignore[attr-defined]
            r.proof_hash = "0x999"  # noqa


class TestOnChainUrlHeuristic:
    def test_none_when_no_tx(self):
        r = ProofReceipt(
            proof_hash="0xabc",
            proof_commitment="0xdef",
            verifier_address="0x123",
        )
        assert r.on_chain_url is None

    def test_sepolia_explorer_for_sepolia_rpc(self):
        r = ProofReceipt(
            proof_hash="0xabc",
            proof_commitment="0xdef",
            verifier_address="0x123",
            on_chain_tx="0xdeadbeef",
            starknet_rpc_url="https://starknet-sepolia.public.blastapi.io",
        )
        assert r.on_chain_url == "https://sepolia.voyager.online/tx/0xdeadbeef"

    def test_mainnet_explorer_by_default(self):
        r = ProofReceipt(
            proof_hash="0xabc",
            proof_commitment="0xdef",
            verifier_address="0x123",
            on_chain_tx="0xdeadbeef",
            starknet_rpc_url="https://starknet-mainnet.g.alchemy.com/v2/xxx",
        )
        assert r.on_chain_url == "https://voyager.online/tx/0xdeadbeef"

    def test_case_insensitive_sepolia_match(self):
        r = ProofReceipt(
            proof_hash="0xabc",
            proof_commitment="0xdef",
            verifier_address="0x123",
            on_chain_tx="0xdeadbeef",
            starknet_rpc_url="https://custom-SEPOLIA-node.example.com",
        )
        assert r.on_chain_url is not None
        assert "sepolia.voyager.online" in r.on_chain_url


class TestVerificationPreconditions:
    @pytest.mark.asyncio
    async def test_verify_requires_rpc_url(self):
        r = ProofReceipt(
            proof_hash="0xabc",
            proof_commitment="0xdef",
            verifier_address="0x123",
            on_chain_tx="0xdeadbeef",
        )
        with pytest.raises(ProofVerificationError) as exc_info:
            await r.verify()
        assert "starknet_rpc_url" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_verify_without_tx_raises_for_now(self):
        # Client-side fresh submission isn't implemented in 0.3.0 — this
        # guard ensures users don't silently get a no-op.
        r = ProofReceipt(
            proof_hash="0xabc",
            proof_commitment="0xdef",
            verifier_address="0x123",
            starknet_rpc_url="https://starknet-sepolia.public.blastapi.io",
        )
        with pytest.raises(ProofVerificationError) as exc_info:
            await r.verify()
        assert "coordinator must submit on-chain" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_verify_error_carries_proof_hash(self):
        r = ProofReceipt(
            proof_hash="0xabcdef",
            proof_commitment="0xdef",
            verifier_address="0x123",
        )
        with pytest.raises(ProofVerificationError) as exc_info:
            await r.verify()
        assert exc_info.value.proof_hash == "0xabcdef"
        assert exc_info.value.verifier_address == "0x123"


class TestPublicReExports:
    def test_top_level_imports(self):
        import bitsage

        assert bitsage.ProofReceipt is ProofReceipt
        assert bitsage.ProofVerificationError is ProofVerificationError
